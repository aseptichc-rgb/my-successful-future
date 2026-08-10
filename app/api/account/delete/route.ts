/**
 * DELETE /api/account/delete
 *
 * Google Play 콘솔의 "사용자 데이터 — 계정 삭제 정책" (2024+ 의무) 충족용 라우트.
 * 본인이 본인 계정/데이터를 완전 삭제할 수 있어야 한다.
 *
 * 삭제 범위:
 *   1) users/{uid} 와 그 모든 서브컬렉션
 *      — 목록은 [lib/constants/userData.ts] 의 USER_SUBCOLLECTIONS 가 단일 진리원천.
 *        Firestore 는 상위 문서를 지워도 서브컬렉션을 자동 삭제하지 않으므로 반드시 열거해야 한다.
 *   2) entitlements/{uid}  (결제 영수증 검증 결과)
 *   3) Firebase Auth 사용자 레코드 (auth.deleteUser)
 *
 * 익명화(레코드는 남기고 신원만 지우는 항목):
 *   - tokenUsage/{docId}.uid → null : LLM 토큰 비용 회계는 전자상거래법상 보관 의무가 있어
 *     레코드 자체는 남기지만, 개인을 식별하는 uid 는 지운다. 남는 건 모델·토큰수·비용뿐이라
 *     [app/privacy/page.tsx] 의 "anonymized token usage metrics" 문구와 실제가 일치한다.
 *   - trialLedger/{emailHash}.lastUid → 삭제 : 원장 문서는 남겨야 탈퇴→재가입 트라이얼
 *     리셋을 계속 막을 수 있다(문서 ID 는 복원 불가능한 단방향 해시). 계정과 이어지는
 *     lastUid 만 제거한다. [lib/trialLedger.ts] 참고.
 *
 * 인증:
 *   Authorization: Bearer <Firebase ID Token>
 *
 * 응답:
 *   200 { ok: true, deletedAt: number }
 *   401 { error }   — 인증 없음/만료
 *   500 { error }   — 부분 실패 (자세한 단계는 server log)
 */
import { NextRequest, NextResponse } from "next/server";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { verifyRequestUser, AuthError } from "@/lib/authServer";
import { USER_SUBCOLLECTIONS } from "@/lib/constants/userData";
import { trialLedgerPath } from "@/lib/trialLedger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE_NAME = "__session";

// 삭제 시 한 번에 처리할 문서 수. Firestore batch 제한(500) 이내로 안전한 값.
const DELETE_BATCH_SIZE = 200;

/**
 * 단일 서브컬렉션을 페이지네이션으로 모두 삭제. limit 단위로 commit.
 * 호출당 1회의 트랜잭션이 아니라 여러 batch 로 나누어 처리 — Firestore 500개 제한 회피.
 */
async function deleteSubcollection(db: Firestore, path: string): Promise<number> {
  let totalDeleted = 0;
  // while 무한 루프 위험 방지: 비어있는 페이지가 나오면 종료
  while (true) {
    const snap = await db.collection(path).limit(DELETE_BATCH_SIZE).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    totalDeleted += snap.size;
    if (snap.size < DELETE_BATCH_SIZE) break;
  }
  return totalDeleted;
}

/**
 * tokenUsage 의 비용 레코드는 남기되 uid 만 지워 익명 집계로 만든다.
 *
 * 페이지네이션이 필요 없다: uid 를 null 로 덮는 순간 같은 쿼리에 다시 걸리지 않으므로,
 * 매번 "아직 uid 가 남아 있는 문서" 만 조회하면 자연히 소진된다.
 */
async function anonymizeTokenUsage(db: Firestore, uid: string): Promise<number> {
  let totalRedacted = 0;
  while (true) {
    const snap = await db
      .collection("tokenUsage")
      .where("uid", "==", uid)
      .limit(DELETE_BATCH_SIZE)
      .get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) =>
      batch.update(d.ref, { uid: null, uidRedactedAt: FieldValue.serverTimestamp() }),
    );
    await batch.commit();
    totalRedacted += snap.size;
    if (snap.size < DELETE_BATCH_SIZE) break;
  }
  return totalRedacted;
}

export async function DELETE(request: NextRequest) {
  let uid: string | null = null;
  try {
    const me = await verifyRequestUser(request);
    uid = me.uid;
    const db = getAdminDb();
    const auth = getAdminAuth();

    // 1) 서브컬렉션 모두 비우기 — 부분 실패해도 다음 단계로 넘어가지 않고 즉시 throw.
    //    Firebase 사용자 레코드를 먼저 지우면 본인 uid 토큰이 무효화돼서
    //    클라가 재시도를 못 함 → 데이터 먼저, Auth 사용자 마지막 순서를 지킨다.
    for (const sub of USER_SUBCOLLECTIONS) {
      await deleteSubcollection(db, `users/${uid}/${sub}`);
    }

    // 2) entitlements/{uid} — 결제 영수증 검증 캐시. 어드민/감사용이 아니라 본인 권한 캐시이므로 삭제.
    await db.doc(`entitlements/${uid}`).delete().catch((e) => {
      // 문서 없음/일시 오류는 삭제 흐름을 막지 않는다. 다만 무음으로 넘기지 않고 로그로 남긴다
      // (사용자 데이터는 지워졌는데 결제 레코드만 남는 상태를 감지할 수 있도록).
      console.warn(
        `[account/delete] uid=${uid} entitlements 삭제 실패:`,
        e instanceof Error ? e.message : String(e),
      );
    });

    // 3) 계정과 분리 보존되는 레코드에서 신원만 지운다 (레코드 자체는 목적상 남긴다).
    //    둘 다 best-effort — 여기서 실패해도 계정 삭제 자체는 완료시키고 로그로 남긴다.
    //    (사용자를 삭제 불가 상태에 묶어두는 것이 더 나쁜 결과다.)
    try {
      const redacted = await anonymizeTokenUsage(db, uid);
      if (redacted > 0) {
        console.info(`[account/delete] tokenUsage ${redacted}건 uid 익명화 완료.`);
      }
    } catch (e) {
      console.warn(
        `[account/delete] uid=${uid} tokenUsage 익명화 실패:`,
        e instanceof Error ? e.message : String(e),
      );
    }

    const ledgerPath = trialLedgerPath(me.email);
    if (ledgerPath) {
      try {
        // 문서를 지우면 재가입 트라이얼 리셋 차단이 무너지므로 lastUid 필드만 제거.
        await db.doc(ledgerPath).update({ lastUid: FieldValue.delete() });
      } catch (e) {
        // 원장 문서가 없는 사용자(트라이얼 미발급)는 not-found — 정상 흐름이라 debug 수준.
        const code = (e as { code?: number | string })?.code;
        if (code !== 5 && code !== "not-found") {
          console.warn(
            `[account/delete] uid=${uid} trialLedger lastUid 제거 실패:`,
            e instanceof Error ? e.message : String(e),
          );
        }
      }
    }

    // 4) users/{uid} 본문 삭제
    await db.doc(`users/${uid}`).delete();

    // 5) Firebase Auth 사용자 삭제 — 같은 이메일로 재가입 가능해진다.
    //    이미 다른 곳에서 삭제됐을 수 있으니 not-found 는 멱등하게 무시.
    try {
      await auth.deleteUser(uid);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== "auth/user-not-found") throw err;
    }

    // 6) 세션 쿠키 폐기 — 클라이언트에서 Firebase 로컬 상태도 함께 signOut 호출하지만,
    //    웹 측 httpOnly 세션이 살아 있으면 곧장 다른 라우트가 통과될 수 있어 동시에 만료시킨다.
    const response = NextResponse.json({ ok: true, deletedAt: Date.now() });
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: "",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[account/delete] uid=${uid ?? "unknown"} 실패:`, msg);
    return NextResponse.json(
      { error: "계정 삭제 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }
}
