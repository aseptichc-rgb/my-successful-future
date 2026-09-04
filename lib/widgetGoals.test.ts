/**
 * 위젯 목표 줄 재료 조립 단위 테스트.
 *
 * 회귀 방지 배경: 위젯 "이번 달 목표" 줄이 "n / N 완료" 카운트만 그려서 사용자가 목표가
 * 무엇인지 알 수 없었다. 본문을 함께 내려보내되, 카운트와 **같은 입력**에서 만들어야
 * "카운트는 1/1 인데 본문은 옛 목표" 라는 새 어긋남이 생기지 않는다 — 그 계약을 고정한다.
 * (`dailyMotivations/{ymd}.goalsSnapshot` 은 카드 생성 시점에 얼어붙어 목표 수정 뒤 어긋난다.)
 */
import { describe, expect, it } from "vitest";
import { MAX_WIDGET_GOALS, buildWidgetGoals, normalizeGoalTexts } from "@/lib/widgetGoals";

describe("normalizeGoalTexts", () => {
  it("공백을 다듬고 빈 항목을 걸러낸다", () => {
    expect(normalizeGoalTexts(["  달리기 ", "", "   ", "독서"])).toEqual(["달리기", "독서"]);
  });

  it("배열이 아니거나 문자열이 아닌 항목은 안전하게 버린다", () => {
    expect(normalizeGoalTexts(undefined)).toEqual([]);
    expect(normalizeGoalTexts("달리기")).toEqual([]);
    expect(normalizeGoalTexts([1, null, "독서"])).toEqual(["독서"]);
  });
});

describe("buildWidgetGoals", () => {
  it("본문과 오늘 달성 여부를 함께 돌려준다", () => {
    expect(buildWidgetGoals(["달리기", "독서"], ["독서"])).toEqual([
      { text: "달리기", achieved: false },
      { text: "독서", achieved: true },
    ]);
  });

  it("목표가 없으면 빈 배열 — 위젯이 섹션을 자연 생략한다", () => {
    expect(buildWidgetGoals([], ["독서"])).toEqual([]);
  });

  it("달성 목록에만 있고 목표에는 없는 항목은 무시한다(목표 삭제 후 잔재)", () => {
    expect(buildWidgetGoals(["달리기"], ["독서", "달리기"])).toEqual([
      { text: "달리기", achieved: true },
    ]);
  });

  it("자르지 않는다 — 카운트 근거이므로 상한 초과 목표의 달성 수가 줄면 안 된다", () => {
    const many = Array.from({ length: MAX_WIDGET_GOALS + 3 }, (_, i) => `목표${i}`);
    const built = buildWidgetGoals(many, many);
    expect(built).toHaveLength(many.length);
    expect(built.filter((g) => g.achieved)).toHaveLength(many.length);
  });

  it("카운트와 같은 입력을 쓰면 달성 수가 정확히 일치한다", () => {
    const goals = normalizeGoalTexts([" 달리기 ", "독서", ""]);
    const achieved = normalizeGoalTexts(["독서"]);
    const built = buildWidgetGoals(goals, achieved);
    expect(built.filter((g) => g.achieved)).toHaveLength(
      goals.filter((g) => achieved.includes(g)).length,
    );
  });
});
