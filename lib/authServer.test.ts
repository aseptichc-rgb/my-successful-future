/**
 * 무료/Pro 티어 스위치([canUseAiFeatures]) 단위 테스트.
 *
 * 이 함수 하나가 "AI 개인화를 줄지, 큐레이션으로 다운그레이드할지" 를 결정하고, 카드 라우트와
 * 위젯 라우트가 둘 다 여기에 매달려 있다. 잘못 뒤집히면 (a) 미결제 사용자에게 LLM 비용이 계속
 * 나가거나 (b) 결제자가 큐레이션 카드를 받는, 어느 쪽이든 조용한 사고가 난다.
 *
 * ENTITLEMENT_REQUIRED 는 모듈 로드 시점에 읽히므로 케이스마다 resetModules + 재임포트 한다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import type { AuthedUser } from "@/lib/authServer";
import type { Entitlement } from "@/lib/entitlement";

const NOW = 1_700_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

function authedUser(entitlement: Entitlement, trialEndsAt: number | null = null): AuthedUser {
  const paid = entitlement.kind === "lifetime" || entitlement.kind === "subscription";
  return {
    uid: "u1",
    entitlement,
    paid,
    productId: paid ? entitlement.productId : null,
    purchaseTimeMs: null,
    trialEndsAt,
  };
}

/** ENTITLEMENT_REQUIRED 를 주어진 값으로 고정한 뒤 canUseAiFeatures 를 새로 읽어온다. */
async function loadGate(flag: string) {
  vi.resetModules();
  vi.stubEnv("ENTITLEMENT_REQUIRED", flag);
  const mod = await import("@/lib/authServer");
  return mod.canUseAiFeatures;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("canUseAiFeatures", () => {
  it("플래그가 꺼져 있으면(개발/베타) 미결제 사용자도 AI 기능을 쓴다", async () => {
    const canUseAiFeatures = await loadGate("");
    expect(canUseAiFeatures(authedUser({ kind: "free" }))).toBe(true);
  });

  it("플래그가 켜져 있으면 무료 사용자는 큐레이션으로 다운그레이드된다", async () => {
    const canUseAiFeatures = await loadGate("true");
    expect(canUseAiFeatures(authedUser({ kind: "free" }, NOW - DAY_MS))).toBe(false);
  });

  it("체험 중이면 AI 기능을 쓴다", async () => {
    const canUseAiFeatures = await loadGate("true");
    const trial: Entitlement = { kind: "trial", trialEndsAt: NOW + DAY_MS };
    expect(canUseAiFeatures(authedUser(trial, NOW + DAY_MS))).toBe(true);
  });

  it("평생 이용권 구매자는 AI 기능을 쓴다", async () => {
    const canUseAiFeatures = await loadGate("true");
    const lifetime: Entitlement = {
      kind: "lifetime",
      productId: "anima_lifetime",
      grantedAt: NOW,
      platform: "ios",
    };
    expect(canUseAiFeatures(authedUser(lifetime))).toBe(true);
  });

  it("구독자는 AI 기능을 쓴다", async () => {
    const canUseAiFeatures = await loadGate("true");
    const subscription: Entitlement = {
      kind: "subscription",
      productId: "anima_monthly",
      grantedAt: NOW,
      expiresAt: NOW + 30 * DAY_MS,
      platform: "android",
    };
    expect(canUseAiFeatures(authedUser(subscription))).toBe(true);
  });

  it("체험을 시작한 적 없는 사용자도 플래그가 켜지면 막힌다(무료 티어로 떨어진다)", async () => {
    const canUseAiFeatures = await loadGate("true");
    expect(canUseAiFeatures(authedUser({ kind: "free" }, null))).toBe(false);
  });
});
