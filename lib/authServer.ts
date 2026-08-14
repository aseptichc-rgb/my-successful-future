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
import { getAdminAuth } from "./firebase-admin";
import { ENTITLEMENT_REQUIRED } from "./constants/quota";
import { readEntitlement, hasProAccess, type Entitlement } from "./entitlement";

export interface AuthedUser {
  uid: string;
  email?: string;
  /**
   * 권한 상태(lifetime / subscription / trial / free) 의 단일 진입점.
   * 새 호출부는 이 필드만 보면 된다. 아래 paid / productId / purchaseTimeMs 는
   * 기존 호출부 호환을 위해 유지하는 그림자 필드이며, 점진적으로 entitlement 로 이전한다.
   */
  entitlement: Entitlement;
  /** @deprecated entitlement.kind 가 'lifetime' 또는 'subscription' 인지로 대체. */
  paid: boolean;
  /** @deprecated entitlement.productId 로 대체 (lifetime/subscription 일 때만 존재). */
  productId: string | null;
  /** @deprecated entitlement.grantedAt 로 대체. */
  purchaseTimeMs: number | null;
  /**
   * 무료 체험 종료 시각(ms). 미시작이면 null. raw 값이라 만료 여부 무관.
   * D-day UI 표시 등에 사용. 게이트 판정에는 entitlement / hasProAccess 를 쓸 것.
   */
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
  const claims = decoded as unknown as Record<string, unknown>;
  const entitlement = readEntitlement(claims);

  // 그림자 필드 — 기존 호출부 호환. entitlement 에서 파생.
  const paid = entitlement.kind === "lifetime" || entitlement.kind === "subscription";
  const productId =
    entitlement.kind === "lifetime" || entitlement.kind === "subscription"
      ? entitlement.productId
      : null;
  const purchaseTimeMs =
    (entitlement.kind === "lifetime" || entitlement.kind === "subscription") &&
    entitlement.grantedAt > 0
      ? entitlement.grantedAt
      : null;
  // trialEndsAt 은 만료 여부와 무관한 raw 값을 그대로 노출 (UI D-day 등에서 사용).
  const trialEndsAt =
    typeof claims.trialEndsAt === "number" ? (claims.trialEndsAt as number) : null;

  return {
    uid: decoded.uid,
    email: decoded.email,
    entitlement,
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
      throw new AuthError(401, "Your session expired. Please sign in again.");
    }
  }

  throw new AuthError(401, "Authentication is required.");
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
 * 모든 보호 라우트가 즉시 닫히므로, iOS StoreKit · 안드로이드 BillingClient 양쪽의
 * 결제·검증 흐름을 점검한 뒤에 켤 것.
 *
 * 안내 문구는 플랫폼 중립으로 쓴다 — 결제 진입점이 iOS(StoreKit) / 안드로이드(Play Billing)
 * 양쪽 앱의 설정 화면에 있고, 웹에는 아예 없다. 특정 스토어를 지목하면 나머지 플랫폼
 * 사용자에게 오안내가 된다.
 */
export async function requirePaidUser(request: NextRequest): Promise<AuthedUser> {
  const user = await verifyRequestUser(request);
  if (!ENTITLEMENT_REQUIRED) return user;
  if (hasProAccess(user.entitlement)) return user;
  const reason = user.trialEndsAt === null ? "trial_not_started" : "trial_expired";
  throw new AuthError(
    402,
    reason === "trial_expired"
      ? "Your free trial has ended. Complete your purchase in the app's Settings screen."
      : "Your free trial hasn't started yet. Please sign in again.",
  );
}

/**
 * AI 생성 기능(Gemini 호출)을 쓸 수 있는 사용자인지 — **던지지 않고** boolean 으로 답한다.
 *
 * [requirePaidUser] 와 역할이 다르다:
 *   requirePaidUser   — Pro 전용 라우트를 통째로 막는다(402). 미래 비전·초상·코치 등.
 *   canUseAiFeatures  — 무료로도 계속 써야 하는 라우트에서 "AI 개인화 대신 큐레이션으로
 *                       다운그레이드할지" 를 정한다. 카드·위젯이 여기에 해당.
 *
 * ENTITLEMENT_REQUIRED 가 꺼져 있으면(개발/베타) 항상 true — 게이트 스위치는 여전히 하나다.
 */
export function canUseAiFeatures(user: AuthedUser): boolean {
  if (!ENTITLEMENT_REQUIRED) return true;
  return hasProAccess(user.entitlement);
}

/**
 * 서버가 클라이언트로 돌려주는 에러. **message 는 항상 영어로 쓴다.**
 *
 * 서버는 요청자의 언어를 알 수 없다 — 로케일은 Firestore 의 users/{uid}.language 와
 * 클라이언트 i18n 사전에만 있고, ID 토큰에는 실려 오지 않는다. 그래서 한국어로 쓰면
 * en/es/zh 사용자에게 그대로 새고, 언어별로 나눌 방법도 없다. 영어를 공통 폴백으로
 * 고정해 두면 어느 로케일에서도 최소한 읽을 수 있는 문장이 남는다.
 *
 * 같은 이유로 app/api/** 의 `NextResponse.json({ error })` 와 로케일을 모르는 lib 모듈
 * (adminAuth · appleStoreKit · playBilling · playIntegrity · iosPurchase · androidPurchase ·
 * authedFetch · nativeAuth) 의 메시지도 전부 영어다. 새 메시지를 추가할 때 이 규칙을 지킬 것.
 *
 * 화면에 자연스러운 모국어로 띄우고 싶다면 서버 문구를 번역하지 말고, 호출부가 상태 코드로
 * 분기해 [lib/i18n] 사전의 키를 쓰는 쪽이 맞다 (402 → ProUpsellSheet 가 이미 그렇게 한다).
 */
export class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "AuthError";
  }
}
