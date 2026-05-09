/**
 * Entitlement 추상화 — 결제/트라이얼 권한 판정의 단일 진입점.
 *
 * 모든 게이트(서버 requirePaidUser, 클라 ensureTrialStarted 등)는 claim 을 직접
 * 들여다보지 말고 readEntitlement / hasProAccess / shouldStartTrial 만 호출한다.
 * 향후 구독 모델을 도입할 때 verify 라우트가 박는 claim 형식만 바뀌면 되고,
 * 호출부는 한 줄도 안 바꿔도 된다.
 *
 * 인식하는 claim 형식 두 가지 (둘 다 살아 있음 — 객체 claim 우선):
 *   1) 평면 (현재 운영 — /api/entitlement/verify, /api/auth/start-trial 가 박음)
 *      { paid: true, productId, purchaseTime, trialEndsAt }
 *   2) 객체 (향후 구독 모델 도입 시)
 *      { ent: { kind: 'lifetime' | 'subscription', productId, grantedAt, expiresAt? },
 *        trialEndsAt }
 */

export type Entitlement =
  | { kind: "lifetime"; productId: string; grantedAt: number }
  | { kind: "subscription"; productId: string; grantedAt: number; expiresAt: number }
  | { kind: "trial"; trialEndsAt: number }
  | { kind: "free" };

function isPositiveNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

interface EntClaim {
  kind?: unknown;
  productId?: unknown;
  grantedAt?: unknown;
  expiresAt?: unknown;
}

function readObjectClaim(ent: EntClaim, now: number): Entitlement | null {
  const productId = typeof ent.productId === "string" ? ent.productId : null;
  if (!productId) return null;
  const grantedAt = isPositiveNumber(ent.grantedAt) ? ent.grantedAt : 0;

  if (ent.kind === "lifetime") {
    return { kind: "lifetime", productId, grantedAt };
  }
  if (ent.kind === "subscription") {
    if (!isPositiveNumber(ent.expiresAt)) return null;
    if (ent.expiresAt <= now) return null;
    return { kind: "subscription", productId, grantedAt, expiresAt: ent.expiresAt };
  }
  return null;
}

/**
 * Firebase ID 토큰의 claims (또는 동등한 plain object) 를 받아 권한 상태를 반환한다.
 * 만료된 trial 은 free 로 떨어진다 — 단, trial 을 다시 켜야 하는지는 shouldStartTrial 로 따로 판정.
 */
export function readEntitlement(
  claims: Record<string, unknown> | null | undefined,
  now: number = Date.now(),
): Entitlement {
  if (!claims) return { kind: "free" };

  if (claims.ent && typeof claims.ent === "object") {
    const fromObject = readObjectClaim(claims.ent as EntClaim, now);
    if (fromObject) return fromObject;
  }

  if (claims.paid === true) {
    const productId =
      typeof claims.productId === "string" && claims.productId
        ? claims.productId
        : "legacy_lifetime";
    const grantedAt = isPositiveNumber(claims.purchaseTime) ? claims.purchaseTime : 0;
    return { kind: "lifetime", productId, grantedAt };
  }

  if (isPositiveNumber(claims.trialEndsAt) && claims.trialEndsAt > now) {
    return { kind: "trial", trialEndsAt: claims.trialEndsAt };
  }

  return { kind: "free" };
}

/**
 * Pro 기능 접근 여부. 트라이얼 / 평생 / 구독 어느 쪽이든 true.
 * 보호 라우트의 게이트는 이 함수만 호출한다 (claim 의 구체 형식을 모름).
 */
export function hasProAccess(ent: Entitlement): boolean {
  return ent.kind !== "free";
}

/**
 * 트라이얼을 새로 시작해야 하는 사용자인가 — start-trial 호출 멱등 판정용.
 *
 * 켜지 않는 경우:
 *   - 이미 lifetime / subscription 결제자
 *   - trialEndsAt 이 한 번이라도 박혔던 사용자 (만료 여부 무관 — 재시작 차단)
 */
export function shouldStartTrial(
  claims: Record<string, unknown> | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!claims) return true;
  const ent = readEntitlement(claims, now);
  if (ent.kind === "lifetime" || ent.kind === "subscription") return false;
  if (isPositiveNumber(claims.trialEndsAt)) return false;
  return true;
}
