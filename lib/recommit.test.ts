import { describe, expect, it } from "vitest";
import { computeRecommitVariant } from "./recommit";
import { FREEZES_PER_MONTH } from "./constants/streak";
import type { AffirmationStreak } from "@/types";

const TODAY = "2026-09-04";

function streakOf(over: Partial<AffirmationStreak> = {}): AffirmationStreak {
  return { count: 5, lastYmd: "2026-09-03", ...over };
}

function variant(streak: AffirmationStreak | undefined, alreadyCheckedInToday = false) {
  return computeRecommitVariant({ streak, todayYmd: TODAY, alreadyCheckedInToday });
}

describe("computeRecommitVariant", () => {
  it("스트릭이 없거나 0이면 none", () => {
    expect(variant(undefined)).toEqual({ kind: "none" });
    expect(variant(streakOf({ count: 0 }))).toEqual({ kind: "none" });
    expect(variant(streakOf({ lastYmd: "" }))).toEqual({ kind: "none" });
  });

  it("오늘 이미 체크인했으면 none", () => {
    expect(variant(streakOf({ lastYmd: "2026-08-20" }), true)).toEqual({ kind: "none" });
  });

  it("어제 체크인(gap=1)까지는 정상 흐름 — none", () => {
    expect(variant(streakOf({ lastYmd: "2026-09-03" }))).toEqual({ kind: "none" });
    expect(variant(streakOf({ lastYmd: TODAY }))).toEqual({ kind: "none" });
  });

  it("놓친 날 수가 남은 프리즈 이하면 freezeChip", () => {
    expect(variant(streakOf({ lastYmd: "2026-09-02" }))).toEqual({ kind: "freezeChip", missed: 1 });
    expect(variant(streakOf({ lastYmd: "2026-09-01" }))).toEqual({
      kind: "freezeChip",
      missed: FREEZES_PER_MONTH,
    });
  });

  it("프리즈로 못 막는 공백이면 recommit — best 는 bestCount 와 count 중 큰 값", () => {
    expect(variant(streakOf({ lastYmd: "2026-08-31" }))).toEqual({
      kind: "recommit",
      prev: 5,
      best: 5,
    });
    expect(variant(streakOf({ lastYmd: "2026-08-31", bestCount: 9 }))).toEqual({
      kind: "recommit",
      prev: 5,
      best: 9,
    });
    // 어긋난 문서(bestCount < count)도 count 를 보존한다.
    expect(variant(streakOf({ lastYmd: "2026-08-31", bestCount: 3 }))).toEqual({
      kind: "recommit",
      prev: 5,
      best: 5,
    });
  });

  it("이번 달 프리즈를 다 썼으면 하루만 놓쳐도 recommit", () => {
    expect(
      variant(streakOf({ lastYmd: "2026-09-02", freezeMonth: "2026-09", freezesLeft: 0 })),
    ).toEqual({ kind: "recommit", prev: 5, best: 5 });
  });

  it("지난달 프리즈 기록은 월초 리필로 간주해 freezeChip", () => {
    expect(
      variant(streakOf({ lastYmd: "2026-09-02", freezeMonth: "2026-08", freezesLeft: 0 })),
    ).toEqual({ kind: "freezeChip", missed: 1 });
  });

  it("형식이 깨진 날짜는 none", () => {
    expect(variant(streakOf({ lastYmd: "bad" }))).toEqual({ kind: "none" });
  });
});
