/**
 * 서버 측 Firebase ID 토큰 검증 및 세션 권한 확인 헬퍼.
 * 클라이언트가 보낸 Authorization 헤더를 검증해 위변조된 uid 사용을 차단한다.
 *
 * paid claim:
 *   /api/entitlement/verify 가 Play Billing 영수증을 확인한 뒤
 *   Firebase custom claim 으로 paid=true 를 박아 두면 verifyIdToken 결과로 그대로 들어온다.
 *   결제 게이팅이 필요한 라우트는 requirePaidUser() 를 사용해 차단할 수 있다.
 *
 * trialEndsAt claim:
 *   /api/auth/start-trial 이 가입 직후 14일 뒤 시각(ms) 을 박아둔다.
 *   paid 가 아니더라도 trialEndsAt > now 이면 무료 체험 중으로 간주해 통과시킨다.
 */
import type { NextRequest } from "next/server";
import { getAdminAuth, getAdminDb } from "./firebase-admin";
import { ENTITLEMENT_REQUIRED } from "./constants/quota";

export interface AuthedUser {
  uid: string;
  email?: string;
  /** Play Billing 영수증 검증을 통과한 사용자에게만 true. */
  paid: boolean;
  /** 결제된 제품 ID (예: "anima_lifetime"). 미결제 또는 dev 모드에서는 null. */
  productId: string | null;
  /** 결제 시점 (ms). claim 에 박아둔 값. */
  purchaseTimeMs: number | null;
  /** 무료 체험 종료 시각(ms). 미시작이면 null. */
  trialEndsAt: number | null;
}

const SESSION_COOKIE_NAME = "__session";

/**
 * 우선 Authorization: Bearer <idToken> 헤더로 검증하고,
 * 없으면 httpOnly 세션 쿠키(__session)로 폴백해 검증한다.
 * 둘 다 없거나 유효하지 않으면 throw — 호출부에서 401/403 응답 처리.
 *
 * 세션 쿠키 폴백이 필요한 이유: PWA 클라이언트가 콜드부트 직후
 * Firebase SDK 복원이 끝나기 전에 API를 호출하는 경우, 또는
 * 쿠키 기반 자동 복구 직전에 첫 요청이 새는 케이스를 막기 위함.
 */
function decodedToAuthedUser(
  decoded: import("firebase-admin/auth").DecodedIdToken,
): AuthedUser {
  const paid = decoded.paid === true;
  const productId = typeof decoded.productId === "string" ? decoded.productId : null;
  const purchaseTimeMs =
    typeof decoded.purchaseTime === "number" ? (decoded.purchaseTime as number) : null;
  const trialEndsAt =
    typeof decoded.trialEndsAt === "number" ? (decoded.trialEndsAt as number) : null;
  return {
    uid: decoded.uid,
    email: decoded.email,
    paid,
    productId,
    purchaseTimeMs,
    trialEndsAt,
  };
}

export async function verifyRequestUser(request: NextRequest): Promise<AuthedUser> {
  const header = request.headers.get("authorization") || request.headers.get("Authorization");
  if (header && header.startsWith("Bearer ")) {
    const token = header.slice(7).trim();
    if (token) {
      try {
        const decoded = await getAdminAuth().verifyIdToken(token);
        return decodedToAuthedUser(decoded);
      } catch {
        // 헤더 검증 실패 시 쿠키 폴백 시도
      }
    }
  }

  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (cookie) {
    try {
      const decoded = await getAdminAuth().verifySessionCookie(cookie, true);
      return decodedToAuthedUser(decoded);
    } catch {
      throw new AuthError(401, "세션이 만료되었습니다. 다시 로그인해주세요.");
    }
  }

  throw new AuthError(401, "인증 정보가 필요합니다.");
}

/**
 * 결제 검증 또는 무료 체험을 통과한 사용자만 통과시킨다.
 *
 * 통과 조건 (ENTITLEMENT_REQUIRED=true 일 때):
 *   1) user.paid === true — Play Billing 영수증 검증 완료자
 *   2) user.trialEndsAt > now — 가입 직후 14일 무료 체험 중
 *   둘 다 아니면 402 PaymentRequired.
 *
 * - ENTITLEMENT_REQUIRED 미설정 (개발/베타): 모두 통과시키되 user.paid=false / trialEndsAt=null
 *   값을 그대로 노출해서 라우트가 다운그레이드 응답을 결정할 수 있게 한다.
 *
 * 결제 흐름이 완성되기 전에 운영 빌드에 ENTITLEMENT_REQUIRED 를 켜면
 * 모든 보호 라우트가 즉시 닫히므로, 안드로이드 BillingClient 통합·검증 흐름 점검 후 켤 것.
 */
export async function requirePaidUser(request: NextRequest): Promise<AuthedUser> {
  const user = await verifyRequestUser(request);
  if (!ENTITLEMENT_REQUIRED) return user;
  if (user.paid) return user;
  const now = Date.now();
  if (user.trialEndsAt !== null && user.trialEndsAt > now) return user;
  const reason = user.trialEndsAt === null ? "trial_not_started" : "trial_expired";
  throw new AuthError(
    402,
    reason === "trial_expired"
      ? "무료 체험 기간이 끝났습니다. 안드로이드 앱에서 결제를 완료해 주세요."
      : "무료 체험이 시작되지 않았습니다. 다시 로그인해 주세요.",
  );
}

/**
 * 사용자가 해당 세션의 참여자인지 확인. 아니면 403.
 */
export async function assertSessionParticipant(
  uid: string,
  sessionId: string
): Promise<void> {
  if (!sessionId) throw new AuthError(400, "sessionId가 필요합니다.");
  const snap = await getAdminDb().doc(`sessions/${sessionId}`).get();
  if (!snap.exists) throw new AuthError(404, "세션을 찾을 수 없습니다.");
  const data = snap.data();
  const participants: unknown = data?.participants;
  if (!Array.isArray(participants) || !participants.includes(uid)) {
    throw new AuthError(403, "이 세션에 접근 권한이 없습니다.");
  }
}

export class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "AuthError";
  }
}
