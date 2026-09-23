import { describe, expect, it } from "vitest";
import { GOAL_SLOT_FREE_MAX, GOAL_SLOT_MAX, GOAL_SLOT_THRESHOLDS } from "@/lib/constants/goal";
import { computeGoalSlots } from "@/lib/goalSlots";

describe("computeGoalSlots", () => {
  it("시작 직후(스트릭 없음)는 1칸 — 다음 임계는 두 번째 문턱", () => {
    expect(computeGoalSlots()).toEqual({
      unlocked: 1,
      earned: 1,
      nextThreshold: GOAL_SLOT_THRESHOLDS[1],
      progress: 0,
      source: "affirmation",
      proOnly: false,
      lockedCount: 0,
    });
  });

  it("두 번째 문턱 도달이면 2칸 — 무료 상한이라 다음 문턱은 없고 이용권 전용으로 바뀐다", () => {
    const days = GOAL_SLOT_THRESHOLDS[1];
    const slots = computeGoalSlots({ affirmation: { count: days, bestCount: days } });
    expect(slots.unlocked).toBe(GOAL_SLOT_FREE_MAX);
    expect(slots.earned).toBe(2);
    expect(slots.nextThreshold).toBeNull();
    expect(slots.proOnly).toBe(true);
  });

  it("무료는 스트릭이 아무리 길어도 무료 상한을 넘지 못한다 — earned 는 그대로 보고", () => {
    const days = GOAL_SLOT_THRESHOLDS[GOAL_SLOT_MAX - 1];
    const slots = computeGoalSlots({ affirmation: { count: days, bestCount: days } });
    expect(slots.unlocked).toBe(GOAL_SLOT_FREE_MAX);
    expect(slots.earned).toBe(GOAL_SLOT_MAX);
    expect(slots.proOnly).toBe(true);
  });

  it("체험 때 목표 4개를 만든 계정은 만료 뒤 상한 밖 목표가 잠긴다(회수 없음)", () => {
    const slots = computeGoalSlots({ currentGoalCount: 4 });
    expect(slots.unlocked).toBe(GOAL_SLOT_FREE_MAX);
    expect(slots.lockedCount).toBe(4 - GOAL_SLOT_FREE_MAX);
    expect(slots.earned).toBe(1);
  });

  it("결제 프로(unlockAll)는 스트릭 0이어도 전 칸 개방 — 잠금 문턱 없음", () => {
    const slots = computeGoalSlots({ unlockAll: true });
    expect(slots.unlocked).toBe(GOAL_SLOT_MAX);
    expect(slots.nextThreshold).toBeNull();
    expect(slots.proOnly).toBe(false);
    expect(slots.lockedCount).toBe(0);
    // 배너 축하(earned)는 여전히 스트릭의 몫 — 결제로 부풀리지 않는다.
    expect(slots.earned).toBe(1);
  });

  it("결제 프로도 progress/source 는 실제 스트릭을 그대로 보고한다", () => {
    const slots = computeGoalSlots({
      goal: { count: 9, bestCount: 9 },
      unlockAll: true,
    });
    expect(slots.progress).toBe(9);
    expect(slots.source).toBe("goal");
    expect(slots.unlocked).toBe(GOAL_SLOT_MAX);
  });
});
