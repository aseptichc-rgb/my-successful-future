/**
 * GET /api/auth/onboarding-status
 *
 * 안드로이드 앱이 부팅 시 호출 — Firestore users/{uid}.onboardedAt 을 보고
 * 메인 홈으로 보낼지 / 온보딩 게이트로 보낼지 결정한다.
 *
 * "진실" 은 Firestore.onboardedAt 하나 — markOnboarded(uid) 가 박는다.
 * 클라이언트의 로컬 플래그는 캐시일 뿐, 이 응답이 항상 우선.
 *
 * 인증: Authorization: Bearer <Firebase ID Token>. 결제 게이트는 안 둔다 —
 *       온보딩 자체가 trial 시작 전에도 떠야 하기 때문.
 *
 * 응답:
 *   200 { ok: true, onboarded: boolean, onboardedAt: number | null }
 *   401 { error }
 */
import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyRequestUser, AuthError } from "@/lib/authServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const me = await verifyRequestUser(request);
    const db = getAdminDb();
    const snap = await db.doc(`users/${me.uid}`).get();
    const raw = snap.exists ? snap.data()?.onboardedAt : null;
    const onboardedAt =
      raw instanceof Timestamp ? raw.toMillis() : null;
    return NextResponse.json({
      ok: true,
      onboarded: onboardedAt !== null,
      onboardedAt,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[auth/onboarding-status] 실패:", msg);
    return NextResponse.json(
      { error: "온보딩 상태 조회 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
