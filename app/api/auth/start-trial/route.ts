/**
 * POST /api/auth/start-trial
 *
 * 가입 직후(이메일 / 구글 로그인 / 세션 복구) 클라이언트가 호출.
 * 서버가 사용자의 기존 custom claim 을 확인해 멱등 처리한다. 판정은 직접 하지 않고
 * [lib/entitlement.ts] 의 shouldStartTrial() 하나로 위임한다:
 *   - 이미 결제자 (평면 paid=true / 객체 ent.kind=lifetime|subscription) → no-op
 *   - 이미 trialEndsAt 박혀있음 (만료 여부 무관)                          → no-op
 *   - 어느 쪽도 아님 → trialEndsAt = now + TRIAL_DURATION_MS 박고 customToken 발급
 *
 * ⚠️ 여기서 claim 을 직접 들여다보지 말 것. 과거에 `paid === true` 만 보다가 iOS 객체
 *    claim(ent) 결제자를 놓쳤고, 그 사용자가 환불되면(결제 claim 만 회수, trialEndsAt 은
 *    보존 — [lib/entitlementAdmin.ts]) 환불 후에도 14일 트라이얼이 살아남았다.
 *
 * 클라이언트는 응답으로 받은 customToken 으로 즉시 signInWithCustomToken 재로그인 →
 * 다음 ID 토큰부터 trialEndsAt claim 이 박혀 보호 라우트가 통과된다.
 *
 * Firestore 미러:
 *   users/{uid}.trialEndsAt = Timestamp.fromMillis(...)
 *   UI 의 "남은 일수 D-day" 표시에만 사용. 실제 게이트 판정은 claim 으로 함.
 *
 * 인증:
 *   Authorization: Bearer <Firebase ID Token> (이미 로그인된 사용자여야 함)
 *
 * 응답:
 *   200 { ok: true, alreadyStarted: true, paid: boolean, trialEndsAt: number | null }
 *   200 { ok: true, alreadyStarted: false, customToken, trialEndsAt: number }
 *   401 { error }
 */
import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { verifyRequestUser, AuthError } from "@/lib/authServer";
import { readEntitlement, shouldStartTrial } from "@/lib/entitlement";
import { TRIAL_DURATION_MS } from "@/lib/constants/quota";
import { trialLedgerPath } from "@/lib/trialLedger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const me = await verifyRequestUser(request);
    const auth = getAdminAuth();

    // ID 토큰의 claim 은 최대 1시간 낡을 수 있으므로 Auth 에서 최신본을 다시 읽는다.
    // setCustomUserClaims 가 전체 덮어쓰기라 머지 용도로도 어차피 필요하다.
    const userRecord = await auth.getUser(me.uid);
    const currentClaims: Record<string, unknown> = { ...(userRecord.customClaims ?? {}) };

    const existingTrialEndsAt =
      typeof currentClaims.trialEndsAt === "number"
        ? (currentClaims.trialEndsAt as number)
        : null;

    if (!shouldStartTrial(currentClaims)) {
      const ent = readEntitlement(currentClaims);
      return NextResponse.json({
        ok: true,
        alreadyStarted: true,
        // 응답의 paid 는 "결제 완료자인가" — 트라이얼 중은 false 여야 한다(기존 계약 유지).
        paid: ent.kind === "lifetime" || ent.kind === "subscription",
        trialEndsAt: existingTrialEndsAt,
      });
    }

    const db = getAdminDb();
    // 탈퇴→재가입으로 14일 트라이얼을 무한 리셋하는 것을 막는다. 이메일 해시로 원장을 조회해
    // 과거에 이미 트라이얼을 받은 이메일이면 새 트라이얼을 켜지 않는다(계정과 분리 보존).
    const ledgerPath = trialLedgerPath(me.email);
    if (ledgerPath) {
      const ledgerSnap = await db.doc(ledgerPath).get();
      if (ledgerSnap.exists) {
        return NextResponse.json({
          ok: true,
          alreadyStarted: true,
          paid: false,
          trialEndsAt: null,
        });
      }
    }

    const trialEndsAt = Date.now() + TRIAL_DURATION_MS;
    const nextClaims = { ...currentClaims, trialEndsAt };

    await auth.setCustomUserClaims(me.uid, nextClaims);

    // 트라이얼 발급 이력을 원장에 남긴다(재가입 리셋 차단용). best-effort.
    if (ledgerPath) {
      try {
        await db.doc(ledgerPath).set(
          { firstTrialAt: Timestamp.now(), lastUid: me.uid },
          { merge: true },
        );
      } catch (ledgerErr) {
        console.error(
          "[auth/start-trial] 트라이얼 원장 기록 실패:",
          ledgerErr instanceof Error ? ledgerErr.message : String(ledgerErr),
        );
      }
    }

    // Firestore 미러는 best-effort — 실패해도 게이트 판정은 claim 으로 동작하므로
    // 여기서 throw 하지 않고 로그만 남긴다.
    try {
      await db.doc(`users/${me.uid}`).set(
        { trialEndsAt: Timestamp.fromMillis(trialEndsAt) },
        { merge: true },
      );
    } catch (mirrorErr) {
      const msg = mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr);
      console.error("[auth/start-trial] Firestore 미러 실패:", msg);
    }

    const customToken = await auth.createCustomToken(me.uid, { trialEndsAt });

    return NextResponse.json({
      ok: true,
      alreadyStarted: false,
      customToken,
      trialEndsAt,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[auth/start-trial] 실패:", msg);
    return NextResponse.json(
      { error: "무료 체험 시작 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
