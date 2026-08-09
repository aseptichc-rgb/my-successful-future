import { describe, expect, it } from "vitest";
import type { Entitlement } from "@/lib/entitlement";
import { computeTrialStatus, MS_PER_DAY } from "@/lib/trialStatus";

const NOW = 1_700_000_000_000; // 고정 기준 시각(ms)

const lifetime: Entitlement = {
  kind: "lifetime",
  productId: "anima_lifetime",
  grantedAt: NOW,
  platform: "ios",
};
const subscription: Entitlement = {
  kind: "subscription",
  productId: "anima_sub",
  grantedAt: NOW,
  expiresAt: NOW + 30 * MS_PER_DAY,
  platform: "ios",
};
const free: Entitlement = { kind: "free" };
const trialEnt = (trialEndsAt: number): Entitlement => ({ kind: "trial", trialEndsAt });

describe("computeTrialStatus", () => {
  it("평생 결제자는 pro (배너 없음)", () => {
    expect(computeTrialStatus(lifetime, null, NOW)).toEqual({ kind: "pro" });
  });

  it("구독자는 pro (배너 없음)", () => {
    expect(computeTrialStatus(subscription, null, NOW)).toEqual({ kind: "pro" });
  });

  it("체험 14일 남았으면 daysLeft=14", () => {
    const endsAt = NOW + 14 * MS_PER_DAY;
    expect(computeTrialStatus(trialEnt(endsAt), endsAt, NOW)).toEqual({
      kind: "trial",
      daysLeft: 14,
    });
  });

  it("남은 시간이 하루 미만이어도 최소 1일로 올림", () => {
    const endsAt = NOW + Math.floor(MS_PER_DAY / 2); // 12시간 남음
    expect(computeTrialStatus(trialEnt(endsAt), endsAt, NOW)).toEqual({
      kind: "trial",
      daysLeft: 1,
    });
  });

  it("이틀에서 1분 모자라도 2일로 올림(경계는 올림)", () => {
    const endsAt = NOW + 2 * MS_PER_DAY - 60_000;
    expect(computeTrialStatus(trialEnt(endsAt), endsAt, NOW)).toEqual({
      kind: "trial",
      daysLeft: 2,
    });
  });

  it("free + 과거 trialEndsAt 이면 expired", () => {
    const endsAt = NOW - MS_PER_DAY;
    expect(computeTrialStatus(free, endsAt, NOW)).toEqual({ kind: "expired" });
  });

  it("만료 경계(정확히 now)도 expired 로 본다", () => {
    expect(computeTrialStatus(free, NOW, NOW)).toEqual({ kind: "expired" });
  });

  it("free + trialEndsAt 없음이면 none (배너 없음)", () => {
    expect(computeTrialStatus(free, null, NOW)).toEqual({ kind: "none" });
  });

  it("trialEndsAt 이 0/음수 등 비정상이면 none", () => {
    expect(computeTrialStatus(free, 0, NOW)).toEqual({ kind: "none" });
    expect(computeTrialStatus(free, -1, NOW)).toEqual({ kind: "none" });
  });
});
