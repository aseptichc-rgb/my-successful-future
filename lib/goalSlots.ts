/**
 * 목표 슬롯 해금 계산 — 순수 함수.
 *
 * 설계 의도: 앱은 목표 1개로 시작한다. 화면을 처음부터 복잡하게 만들지 않고,
 * **꾸준함으로 복잡도를 벌어서 열게** 한다(1개 → 7일 → 21일 → 45일 → 66일, 상한 5개).
 *
 * 해금 축은 둘이다 — 다짐 전사 스트릭(affirmationStreak)과 목표 달성 스트릭(goalStreak).
 * "목표를 달성하면 칸이 열린다"는 성장 루프의 축과, 기존 사용자가 이미 쌓아 온 전사
 * 축을 모두 인정해 **두 축 중 큰 값**으로 게이지를 채운다. 어느 축이 게이지를 끌고
 * 있는지(source)를 함께 돌려줘 해금 배너가 축에 맞는 문구를 고를 수 있게 한다.
 *
 * 판정 기준을 현재 연속일이 아니라 `bestCount`(역대 최고)로 두는 것이 핵심이다.
 * 스트릭이 한 번 끊겼다고 이미 얻은 슬롯을 뺏으면 그건 처벌이고, 처벌은 재시작을
 * 막는다. 레거시 문서(bestCount 없음)는 count 로 폴백한다 —
 * lib/affirmationCheckin.ts 의 `prevBest` 백필과 같은 규칙이라 판정이 어긋나지 않는다.
 *
 * 기존 사용자 보존: 이미 목표 N개를 쓰던 사람에게서 슬롯을 회수하지 않는다.
 * unlocked = max(벌어서 연 수, 지금 가진 목표 수).
 */
import {
  GOAL_SLOT_MAX,
  GOAL_SLOT_THRESHOLDS,
} from "@/lib/constants/goal";
import { toCount } from "@/lib/counters";
import type { StreakCounter } from "@/types";

/** 게이지를 끌고 있는 해금 축. */
export type GoalSlotSource = "affirmation" | "goal";

export interface GoalSlotState {
  /** 지금 사용자가 실제로 쓸 수 있는 목표 칸 수. */
  unlocked: number;
  /** 꾸준함만으로 연 칸 수 (기존 목표 보존분 제외) — 해금 배너 판정에 쓴다. */
  earned: number;
  /** 다음 칸을 열기 위해 필요한 최고 연속일. 더 열 칸이 없으면 null. */
  nextThreshold: number | null;
  /** 두 축 중 큰 "역대 최고 연속일" (진행도 표시용). */
  progress: number;
  /** progress 를 만든 축 — 해금 배너가 문구("지켰어요"/"이어왔어요")를 고르는 데 쓴다. */
  source: GoalSlotSource;
}

/**
 * 역대 최고 연속일. 정상 문서는 bestCount >= count 라 `bestCount ?? count` 폴백과 같고,
 * 어긋난 문서(bestCount < count)에서도 큰 쪽을 취해 이미 연 슬롯이 잠기지 않는다 —
 * 서버 백필(Math.max(prevBest, nextCount))·normalizeGoalStreak 와 같은 규칙.
 */
export function bestStreakCount(streak?: StreakCounter | null): number {
  if (!streak) return 0;
  return Math.max(toCount(streak.bestCount), toCount(streak.count));
}

export function computeGoalSlots({
  affirmation,
  goal,
  currentGoalCount = 0,
  unlockAll = false,
}: {
  /** 다짐 전사 스트릭 (users.affirmationStreak). */
  affirmation?: StreakCounter | null;
  /** 목표 달성 스트릭 (users.goalStreak). */
  goal?: StreakCounter | null;
  /** 지금 가진 목표 수 — 기존 사용자 보존용. */
  currentGoalCount?: number;
  /**
   * 결제 프로(lib/entitlement isPaidPro) — 첫날부터 전 칸 개방.
   * earned(꾸준함으로 번 칸)는 그대로 둔다 — 해금 배너/축하는 여전히 스트릭의 몫이고,
   * 구독 만료 시에도 벌어둔 칸과 기존 목표 보존 규칙이 그대로 이어받는다.
   */
  unlockAll?: boolean;
} = {}): GoalSlotState {
  const affirmationBest = bestStreakCount(affirmation);
  const goalBest = bestStreakCount(goal);
  // 동률이면 기존 축(전사)을 유지한다 — 레거시 문구가 바뀔 이유가 없다.
  const source: GoalSlotSource = goalBest > affirmationBest ? "goal" : "affirmation";
  const progress = Math.max(affirmationBest, goalBest);

  // 임계값 배열을 앞에서부터 훑어 통과한 마지막 인덱스 + 1 이 벌어서 연 칸 수.
  let earned = 1;
  for (let i = 1; i < GOAL_SLOT_THRESHOLDS.length; i += 1) {
    if (progress >= GOAL_SLOT_THRESHOLDS[i]) earned = i + 1;
  }
  earned = Math.min(earned, GOAL_SLOT_MAX);

  const existing = toCount(currentGoalCount);

  if (unlockAll) {
    return {
      unlocked: Math.max(GOAL_SLOT_MAX, existing),
      earned,
      nextThreshold: null,
      progress,
      source,
    };
  }

  return {
    unlocked: Math.max(earned, existing),
    earned,
    nextThreshold: earned >= GOAL_SLOT_MAX ? null : GOAL_SLOT_THRESHOLDS[earned],
    progress,
    source,
  };
}
