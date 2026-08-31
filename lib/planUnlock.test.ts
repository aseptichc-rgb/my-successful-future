import { describe, expect, it } from "vitest";
import { PLAN_UNLOCK_STREAK } from "@/lib/constants/growth";
import { computePlanUnlock } from "@/lib/planUnlock";

describe("computePlanUnlock", () => {
  it("목표도 플랜도 없으면 hidden", () => {
    expect(computePlanUnlock({ goalCount: 0, planCount: 0 })).toEqual({ kind: "hidden" });
  });

  it("시작 직후(목표 1, 스트릭 없음)는 locked / progress 0", () => {
    expect(computePlanUnlock({ goalCount: 1 })).toEqual({
      kind: "locked",
      progress: 0,
      threshold: PLAN_UNLOCK_STREAK,
    });
  });

  it("임계 직전(6일)은 locked", () => {
    expect(
      computePlanUnlock({ goalCount: 1, affirmation: { count: 6, bestCount: 6 } }),
    ).toEqual({ kind: "locked", progress: 6, threshold: PLAN_UNLOCK_STREAK });
  });

  it("임계 도달(7일)은 open", () => {
    expect(
      computePlanUnlock({ goalCount: 1, affirmation: { count: 7, bestCount: 7 } }).kind,
    ).toBe("open");
  });

  it("전사 축만 7일이어도 open", () => {
    expect(
      computePlanUnlock({
        goalCount: 1,
        affirmation: { count: 7, bestCount: 7 },
        goal: { count: 0, bestCount: 0 },
      }).kind,
    ).toBe("open");
  });

  it("목표 달성 축만 9일이어도 open (progress 는 큰 축)", () => {
    expect(computePlanUnlock({ goalCount: 1, goal: { count: 9, bestCount: 9 } }).kind).toBe(
      "open",
    );
  });

  it("스트릭이 끊겨도(count 0, best 12) open — 역대 최고 기준", () => {
    expect(
      computePlanUnlock({ goalCount: 1, affirmation: { count: 0, bestCount: 12 } }).kind,
    ).toBe("open");
  });

  it("손상 문서(count 8 > bestCount 3)는 큰 값을 채택해 open", () => {
    expect(
      computePlanUnlock({ goalCount: 1, affirmation: { count: 8, bestCount: 3 } }).kind,
    ).toBe("open");
  });

  it("스트릭 0이어도 플랜이 있으면 open — 기존 사용자 보존(hidden/locked 아님)", () => {
    expect(computePlanUnlock({ goalCount: 0, planCount: 2 }).kind).toBe("open");
  });

  it("레거시 문서(bestCount 없음, count 7)도 open", () => {
    expect(computePlanUnlock({ goalCount: 1, affirmation: { count: 7 } }).kind).toBe("open");
  });

  it("결제 프로(unlockAll)는 스트릭 0이어도 첫날부터 open", () => {
    expect(computePlanUnlock({ goalCount: 1, unlockAll: true }).kind).toBe("open");
  });

  it("결제 프로여도 목표·플랜이 없으면 hidden — 잠금이 아니라 그릴 내용이 없다", () => {
    expect(computePlanUnlock({ goalCount: 0, planCount: 0, unlockAll: true })).toEqual({
      kind: "hidden",
    });
  });
});
