/**
 * 서버 측 권한 회수(revoke) 헬퍼 — 환불/취소/차지백 시 결제 권한을 거둬들인다.
 *
 * /api/entitlement/verify 가 부여한 것의 정확한 역연산:
 *   1) entitlements/{uid} 에 저장된 purchaseToken 으로 소유자를 역추적
 *   2) Firebase custom claim 에서 결제 관련 키(paid/productId/purchaseTime/ent)만 제거
 *      (trialEndsAt 등 무관 claim 은 보존)
 *   3) 기존 ID 토큰(최대 1h)이 paid=true 를 들고 있으므로 refresh token 을 강제 만료 —
 *      다음 토큰 갱신부터 무료 사용자로 떨어진다.
 *   4) entitlements/{uid} 에 회수 사실을 감사 로그로 남김
 *
 * RTDN 웹훅(/api/billing/rtdn)과 향후 운영자 수동 회수가 공유한다.
 */
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "./firebase-admin";

/** verify 라우트가 박는 결제 관련 claim 키 — 회수 시 이 키들만 지운다. */
const ENTITLEMENT_CLAIM_KEYS = ["paid", "productId", "purchaseTime", "ent"] as const;

export type RevokeStatus = "revoked" | "not_found" | "already_revoked";

export interface RevokeResult {
  status: RevokeStatus;
  /** 회수 대상으로 식별된 사용자 (not_found 이면 없음). */
  uid?: string;
}

/**
 * Firebase auth 의 user-not-found 에러인지 판별 (이미 탈퇴한 사용자).
 * 이 경우 claim 조작은 건너뛰되 영수증 회수 기록은 남긴다.
 */
function isUserNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "auth/user-not-found"
  );
}

/**
 * purchaseToken 으로 소유자를 찾아 결제 권한을 회수한다. 멱등 — 이미 회수된 건은
 * already_revoked 로 즉시 반환하고 재처리하지 않는다.
 *
 * @param purchaseToken Google/Apple 영수증 토큰 (verify 시 entitlements 에 저장된 값)
 * @param reason        감사 로그에 남길 회수 사유 (예: "voided_purchase")
 * @param meta          감사 로그에 함께 남길 부가 정보 (refundType, orderId 등)
 */
export async function revokeEntitlementByPurchaseToken(
  purchaseToken: string,
  reason: string,
  meta?: Record<string, unknown>,
): Promise<RevokeResult> {
  const token = (purchaseToken || "").trim();
  if (!token) return { status: "not_found" };

  const db = getAdminDb();
  const snap = await db
    .collection("entitlements")
    .where("purchaseToken", "==", token)
    .limit(1)
    .get();
  if (snap.empty) return { status: "not_found" };

  const doc = snap.docs[0];
  const uid = doc.id;
  if (doc.data()?.revoked === true) return { status: "already_revoked", uid };

  const auth = getAdminAuth();

  try {
    // 결제 관련 claim 만 제거하고 나머지(trialEndsAt 등)는 그대로 보존.
    const userRecord = await auth.getUser(uid);
    const nextClaims: Record<string, unknown> = { ...(userRecord.customClaims ?? {}) };
    for (const key of ENTITLEMENT_CLAIM_KEYS) delete nextClaims[key];
    await auth.setCustomUserClaims(uid, nextClaims);

    // 기존 토큰이 들고 있는 paid=true 를 즉시 무효화 — 다음 갱신부터 무료로 떨어진다.
    await auth.revokeRefreshTokens(uid);
  } catch (err) {
    // 이미 탈퇴한 사용자면 claim 조작은 의미 없으므로 회수 기록만 남기고 통과.
    if (!isUserNotFound(err)) throw err;
  }

  await doc.ref.set(
    {
      revoked: true,
      revokedAt: FieldValue.serverTimestamp(),
      revokeReason: reason,
      ...(meta ?? {}),
    },
    { merge: true },
  );

  return { status: "revoked", uid };
}
