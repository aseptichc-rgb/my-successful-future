import { describe, expect, it } from "vitest";
import { PLAN_UNLOCK_STREAK, WINS_UNLOCK_STREAK } from "@/lib/constants/growth";
import { computeWinsUnlock, hasAnyWin } from "@/lib/winsUnlock";

describe("hasAnyWin", () => {
  it("배열이 아니면 false (레거시/손상 문서)", () => {
    expect(hasAnyWin(undefined)).toBe(false);
    expect(hasAnyWin(null)).toBe(false);
    expect(hasAnyWin("한 줄")).toBe(false);
  });

  it("빈 칸/공백만 있으면 false — 저장은 됐지만 기록은 아니다", () => {
    expect(hasAnyWin([])).toBe(false);
    expect(hasAnyWin(["", "", ""])).toBe(false);
    expect(hasAnyWin(["   ", "\n"])).toBe(false);
  });

  it("한 칸이라도 내용이 있으면 true", () => {
    expect(hasAnyWin(["", "산책했다", ""])).toBe(true);
  });

  it("문자열이 아닌 원소가 섞여도 터지지 않는다", () => {
    expect(hasAnyWin([null, 3, { a: 1 }])).toBe(false);
    expect(hasAnyWin([null, "메일 답장"])).toBe(true);
  });
});

describe("computeWinsUnlock", () => {
  it("시작 직후(스트릭 없음)는 locked / progress 0", () => {
    expect(computeWinsUnlock()).toEqual({
      kind: "locked",
      progress: 0,
      threshold: WINS_UNLOCK_STREAK,
    });
  });

  it("실행 설계만 열린 시점(7일)에는 아직 locked — 사다리 한 칸 위다", () => {
    expect(computeWinsUnlock({ affirmation: { count: PLAN_UNLOCK_STREAK } })).toEqual({
      kind: "locked",
      progress: PLAN_UNLOCK_STREAK,
      threshold: WINS_UNLOCK_STREAK,
    });
  });

  it("임계 직전(13일)은 locked", () => {
    expect(computeWinsUnlock({ affirmation: { count: 13, bestCount: 13 } })).toEqual({
      kind: "locked",
      progress: 13,
      threshold: WINS_UNLOCK_STREAK,
    });
  });

  it("임계 도달(14일)은 open", () => {
    expect(
      computeWinsUnlock({ affirmation: { count: 14, bestCount: 14 } }).kind,
    ).toBe("open");
  });

  it("목표 달성 축만 14일이어도 open", () => {
    expect(
      computeWinsUnlock({
        affirmation: { count: 0, bestCount: 0 },
        goal: { count: 14, bestCount: 14 },
      }).kind,
    ).toBe("open");
  });

  it("progress 는 두 축 중 큰 값", () => {
    expect(
      computeWinsUnlock({
        affirmation: { count: 2, bestCount: 5 },
        goal: { count: 1, bestCount: 9 },
      }),
    ).toEqual({ kind: "locked", progress: 9, threshold: WINS_UNLOCK_STREAK });
  });

  it("스트릭이 끊겨도(count 0, best 20) open — 역대 최고 기준", () => {
    expect(
      computeWinsUnlock({ affirmation: { count: 0, bestCount: 20 } }).kind,
    ).toBe("open");
  });

  it("손상 문서(count 15 > bestCount 3)는 큰 값을 채택해 open", () => {
    expect(
      computeWinsUnlock({ affirmation: { count: 15, bestCount: 3 } }).kind,
    ).toBe("open");
  });

  it("레거시 문서(bestCount 없음, count 14)도 open", () => {
    expect(computeWinsUnlock({ affirmation: { count: 14 } }).kind).toBe("open");
  });

  it("스트릭 0이어도 이미 쓰던 계정이면 open — 기존 사용자 보존", () => {
    expect(computeWinsUnlock({ alreadyRecorded: true }).kind).toBe("open");
  });

  it("보존 신호가 없으면 스트릭 판정을 그대로 따른다", () => {
    expect(
      computeWinsUnlock({ affirmation: { count: 3 }, alreadyRecorded: false }).kind,
    ).toBe("locked");
  });
});
