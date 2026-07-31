/**
 * 실행 설계(WOOP) 해금 판정 — 순수 함수.
 *
 * 실행 설계는 첫날부터 열려 있지 않다. 이 앱의 다른 복잡도와 같은 규칙으로,
 * 꾸준함으로 벌어서 연다(lib/goalSlots 와 동일 사상). 판정 기준은 현재 연속일이
 * 아니라 역대 최고(bestStreakCount)라, 스트릭이 한 번 끊겨도 다시 잠기지 않는다.
 *
 * 이미 플랜이 있는 사용자는 무조건 open — 쓰던 기능을 회수하면 그건 처벌이고,
 * 처벌은 재시작을 막는다(computeGoalSlots 의 기존 목표 보존과 같은 규칙).
 */
import { PLAN_UNLOCK_STREAK } from "@/lib/constants/growth";
import { bestStreakCount } from "@/lib/goalSlots";
import type { StreakCounter } from "@/types";

export type PlanUnlockState =
  | { kind: "hidden" }
  | { kind: "locked"; progress: number; threshold: number }
  | { kind: "open" };

export function computePlanUnlock({
  affirmation,
  goal,
  goalCount = 0,
  planCount = 0,
}: {
  /** 다짐 전사 스트릭 (users.affirmationStreak). */
  affirmation?: StreakCounter | null;
  /** 목표 달성 스트릭 (users.goalStreak). */
  goal?: StreakCounter | null;
  /** trim 후 비어있지 않은 목표 수 — 호출부가 cleanGoals 규칙으로 센다. */
  goalCount?: number;
  /** 저장된 실행 설계 수. */
  planCount?: number;
} = {}): PlanUnlockState {
  // 설계할 목표가 없으면 잠금 예고조차 그리지 않는다 (ExecutionPlansSection 과 같은 규칙).
  if (goalCount <= 0 && planCount <= 0) return { kind: "hidden" };
  if (planCount > 0) return { kind: "open" };

  const progress = Math.max(bestStreakCount(affirmation), bestStreakCount(goal));
  if (progress >= PLAN_UNLOCK_STREAK) return { kind: "open" };
  return { kind: "locked", progress, threshold: PLAN_UNLOCK_STREAK };
}
