/**
 * DELETE /api/account/delete
 *
 * Google Play 콘솔의 "사용자 데이터 — 계정 삭제 정책" (2024+ 의무) 충족용 라우트.
 * 본인이 본인 계정/데이터를 완전 삭제할 수 있어야 한다.
 *
 * 삭제 범위:
 *   1) users/{uid} 와 그 모든 서브컬렉션
 *      - dailyEntries/{ymd}
 *      - dailyMotivations/{ymd}
 *      - usage/{ymd}
 *      - identityProgress/{tag}
 *      - affirmationLogs/{ymd}
 *   2) entitlements/{uid}  (결제 영수증 검증 결과)
 *   3) Firebase Auth 사용자 레코드 (auth.deleteUser)
 *
 * 보존(의도적으로 남기는 항목):
 *   - tokenUsage/{docId} : LLM 토큰 비용 회계 — 어드민 전용 read 만 가능하며
 *     본인 uid 가 들어있어도 PII 가 아닌 비용 집계 목적이라 보존 (영수증·세무 보관 의무 대비).
 *     사용자가 별도 요청 시 어드민이 수동 마스킹.
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
import type { Firestore } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { verifyRequestUser, AuthError } from "@/lib/authServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE_NAME = "__session";

// 삭제 시 한 번에 처리할 문서 수. Firestore batch 제한(500) 이내로 안전한 값.
const DELETE_BATCH_SIZE = 200;
// 사용자별 서브컬렉션 목록 — Admin SDK 는 listCollections 가 비싸서 명시 열거.
const USER_SUBCOLLECTIONS = [
  "dailyEntries",
  "dailyMotivations",
  "usage",
  "identityProgress",
  "affirmationLogs",
] as const;

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
    await db.doc(`entitlements/${uid}`).delete().catch(() => {
      // 문서 없음은 무시. 다른 오류는 다음 단계 진행에 영향 X — log only.
    });

    // 3) users/{uid} 본문 삭제
    await db.doc(`users/${uid}`).delete();

    // 4) Firebase Auth 사용자 삭제 — 같은 이메일로 재가입 가능해진다.
    //    이미 다른 곳에서 삭제됐을 수 있으니 not-found 는 멱등하게 무시.
    try {
      await auth.deleteUser(uid);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== "auth/user-not-found") throw err;
    }

    // 5) 세션 쿠키 폐기 — 클라이언트에서 Firebase 로컬 상태도 함께 signOut 호출하지만,
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
