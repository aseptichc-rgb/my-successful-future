import { describe, expect, it } from "vitest";
import { isPaidPro, readEntitlement, type Entitlement } from "@/lib/entitlement";

const NOW = 1_700_000_000_000;

describe("isPaidPro", () => {
  it("평생 결제자는 true", () => {
    const ent: Entitlement = {
      kind: "lifetime",
      productId: "pro_lifetime",
      grantedAt: NOW,
      platform: "android",
    };
    expect(isPaidPro(ent)).toBe(true);
  });

  it("구독 결제자는 true", () => {
    const ent: Entitlement = {
      kind: "subscription",
      productId: "pro_monthly",
      grantedAt: NOW,
      expiresAt: NOW + 1,
      platform: "ios",
    };
    expect(isPaidPro(ent)).toBe(true);
  });

  it("트라이얼은 false — 전원 자동 시작이라 포함하면 해금 여정이 사라진다", () => {
    expect(isPaidPro({ kind: "trial", trialEndsAt: NOW + 1 })).toBe(false);
  });

  it("무료는 false", () => {
    expect(isPaidPro({ kind: "free" })).toBe(false);
  });

  it("만료된 구독 claim 은 free 로 읽혀 false — 게이트가 자연 복귀한다", () => {
    const claims = {
      ent: {
        kind: "subscription",
        productId: "pro_monthly",
        grantedAt: NOW - 10,
        expiresAt: NOW - 1,
      },
    };
    expect(isPaidPro(readEntitlement(claims, NOW))).toBe(false);
  });
});
