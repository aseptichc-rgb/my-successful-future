/**
 * "오늘 잘한 일" 기록 해금 판정 — 순수 함수.
 *
 * 기록은 첫날부터 열려 있지 않다. 실행 설계(lib/planUnlock)와 같은 규칙으로 꾸준함으로
 * 벌어서 연다 — 다짐 전사 · 목표 달성 두 축 중 **역대 최고**(bestStreakCount)가 기준이라
 * 스트릭이 한 번 끊겨도 다시 잠기지 않는다.
 *
 * 이미 쓰고 있던 사람은 무조건 open — 쓰던 기능을 회수하면 그건 처벌이고, 처벌은
 * 재시작을 막는다(computeGoalSlots 의 기존 목표 보존, computePlanUnlock 의 planCount 와
 * 같은 규칙). 다만 잘한 일에는 실행 설계의 `planCount` 처럼 "지금까지 몇 개 썼나"를
 * 알려주는 상위 문서가 없다. 그래서 보존 신호를 호출부가 `alreadyRecorded` 로 넘긴다:
 * 홈은 (1) 계정에 한 번 찍힌 보존 표식(users.winsUnlockedAt) 과
 * (2) 이미 메모리에 있는 어제·오늘 문서의 기록 유무를 OR 로 묶어 넘기고, (2)가 참인데
 * 표식이 없으면 그때 표식을 한 번 남긴다 — 게이트 도입 전부터 쓰던 계정이 하루 만에
 * 영구 승계된다.
 */
import { WINS_UNLOCK_STREAK } from "@/lib/constants/growth";
import { bestStreakCount } from "@/lib/goalSlots";
import type { StreakCounter } from "@/types";

/**
 * 일일 문서(dailyEntries/{ymd})의 wins 배열에 내용이 하나라도 있는가.
 * 보존 신호를 오늘·어제 두 곳에서 같은 규칙으로 읽기 위한 단일 정의 —
 * 빈 문자열만 든 배열은 "기록 없음"이다(getDailyWinsHistory 의 필터와 같은 규칙).
 */
export function hasAnyWin(wins?: unknown): boolean {
  if (!Array.isArray(wins)) return false;
  return wins.some((w) => typeof w === "string" && w.trim().length > 0);
}

export type WinsUnlockState =
  | { kind: "locked"; progress: number; threshold: number }
  | { kind: "open" };

export function computeWinsUnlock({
  affirmation,
  goal,
  alreadyRecorded = false,
  unlockAll = false,
}: {
  /** 다짐 전사 스트릭 (users.affirmationStreak). */
  affirmation?: StreakCounter | null;
  /** 목표 달성 스트릭 (users.goalStreak). */
  goal?: StreakCounter | null;
  /** 이미 잘한 일을 쓰던 계정인가 — 기존 사용자 보존(호출부가 판단해 넘긴다). */
  alreadyRecorded?: boolean;
  /** 결제 프로(lib/entitlement isPaidPro) — 스트릭 없이도 첫날부터 open. */
  unlockAll?: boolean;
} = {}): WinsUnlockState {
  if (unlockAll || alreadyRecorded) return { kind: "open" };

  const progress = Math.max(bestStreakCount(affirmation), bestStreakCount(goal));
  if (progress >= WINS_UNLOCK_STREAK) return { kind: "open" };
  return { kind: "locked", progress, threshold: WINS_UNLOCK_STREAK };
}
