/**
 * POST /api/auth/start-trial
 *
 * 가입 직후(이메일 / 구글 로그인 / 세션 복구) 클라이언트가 호출.
 * 서버가 사용자의 기존 custom claim 을 확인해 멱등 처리한다:
 *   - 이미 paid=true            → no-op (결제 완료자는 트라이얼을 다시 켜지 않는다)
 *   - 이미 trialEndsAt 박혀있음 → no-op (이중 시작 방지)
 *   - 둘 다 없음                → trialEndsAt = now + TRIAL_DURATION_MS 박고 customToken 발급
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
import { createHash } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { verifyRequestUser, AuthError } from "@/lib/authServer";
import { TRIAL_DURATION_MS } from "@/lib/constants/quota";

/** 이메일을 트라이얼 원장 문서 ID(해시)로 변환 — 원문 이메일을 저장하지 않는다. */
function trialLedgerKey(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const me = await verifyRequestUser(request);
    const auth = getAdminAuth();

    // 기존 claim 을 읽어 머지 — paid / productId / purchaseTime 이 박힌 결제 완료자에게는
    // 트라이얼을 추가로 켜 주지 않는다. setCustomUserClaims 는 전체 덮어쓰기이므로
    // 머지를 직접 처리해야 다른 claim 이 사라지지 않는다.
    const userRecord = await auth.getUser(me.uid);
    const currentClaims: Record<string, unknown> = { ...(userRecord.customClaims ?? {}) };

    const alreadyPaid = currentClaims.paid === true;
    const existingTrialEndsAt =
      typeof currentClaims.trialEndsAt === "number"
        ? (currentClaims.trialEndsAt as number)
        : null;

    if (alreadyPaid || existingTrialEndsAt !== null) {
      return NextResponse.json({
        ok: true,
        alreadyStarted: true,
        paid: alreadyPaid,
        trialEndsAt: existingTrialEndsAt,
      });
    }

    const db = getAdminDb();
    // 탈퇴→재가입으로 14일 트라이얼을 무한 리셋하는 것을 막는다. 이메일 해시로 원장을 조회해
    // 과거에 이미 트라이얼을 받은 이메일이면 새 트라이얼을 켜지 않는다(계정과 분리 보존).
    const ledgerKey = me.email ? trialLedgerKey(me.email) : null;
    if (ledgerKey) {
      const ledgerSnap = await db.doc(`trialLedger/${ledgerKey}`).get();
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
    if (ledgerKey) {
      try {
        await db.doc(`trialLedger/${ledgerKey}`).set(
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
