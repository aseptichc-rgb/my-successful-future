import { describe, expect, it } from "vitest";
import { GOAL_SLOT_MAX, GOAL_SLOT_THRESHOLDS } from "@/lib/constants/goal";
import { computeGoalSlots } from "@/lib/goalSlots";

describe("computeGoalSlots", () => {
  it("시작 직후(스트릭 없음)는 1칸 — 다음 임계는 두 번째 문턱", () => {
    expect(computeGoalSlots()).toEqual({
      unlocked: 1,
      earned: 1,
      nextThreshold: GOAL_SLOT_THRESHOLDS[1],
      progress: 0,
      source: "affirmation",
    });
  });

  it("두 번째 문턱 도달이면 2칸", () => {
    const days = GOAL_SLOT_THRESHOLDS[1];
    const slots = computeGoalSlots({ affirmation: { count: days, bestCount: days } });
    expect(slots.unlocked).toBe(2);
    expect(slots.earned).toBe(2);
    expect(slots.nextThreshold).toBe(GOAL_SLOT_THRESHOLDS[2]);
  });

  it("이미 목표 4개를 쓰던 계정은 스트릭 0이어도 4칸 보존", () => {
    const slots = computeGoalSlots({ currentGoalCount: 4 });
    expect(slots.unlocked).toBe(4);
    expect(slots.earned).toBe(1);
  });

  it("결제 프로(unlockAll)는 스트릭 0이어도 전 칸 개방 — 잠금 문턱 없음", () => {
    const slots = computeGoalSlots({ unlockAll: true });
    expect(slots.unlocked).toBe(GOAL_SLOT_MAX);
    expect(slots.nextThreshold).toBeNull();
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
