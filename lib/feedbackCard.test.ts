import { describe, expect, it } from "vitest";
import { FEEDBACK_MIN_STREAK, bestStreak, shouldShowFeedbackCard } from "./feedbackCard";
import type { AffirmationStreak } from "@/types";

const streak = (count: number, bestCount?: number): AffirmationStreak =>
  ({ count, lastYmd: "2026-09-23", bestCount }) as AffirmationStreak;

describe("bestStreak", () => {
  it("스트릭이 없으면 0", () => {
    expect(bestStreak(undefined)).toBe(0);
  });
  it("bestCount 가 없는 레거시 문서는 count 로 폴백", () => {
    expect(bestStreak(streak(4))).toBe(4);
  });
  it("count 와 bestCount 중 큰 값", () => {
    expect(bestStreak(streak(1, 9))).toBe(9);
    expect(bestStreak(streak(5, 2))).toBe(5);
  });
});

describe("shouldShowFeedbackCard", () => {
  it("최고 스트릭이 기준 미만이면 숨김", () => {
    expect(
      shouldShowFeedbackCard({ streak: streak(FEEDBACK_MIN_STREAK - 1), acked: false }),
    ).toBe(false);
    expect(shouldShowFeedbackCard({ streak: undefined, acked: false })).toBe(false);
  });
  it("기준 이상이고 아직 답하지 않았으면 표시", () => {
    expect(shouldShowFeedbackCard({ streak: streak(FEEDBACK_MIN_STREAK), acked: false })).toBe(
      true,
    );
  });
  it("스트릭이 끊겼어도 역대 최고가 기준 이상이면 표시", () => {
    expect(shouldShowFeedbackCard({ streak: streak(0, FEEDBACK_MIN_STREAK), acked: false })).toBe(
      true,
    );
  });
  it("한 번 답했으면 영구 숨김", () => {
    expect(shouldShowFeedbackCard({ streak: streak(30, 30), acked: true })).toBe(false);
  });
});
