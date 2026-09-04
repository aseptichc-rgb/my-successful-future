/**
 * 위젯 "목표" 줄 재료 조립 — 순수 모듈(Firestore/Firebase SDK 비의존).
 *
 * 왜 별도 모듈인가:
 *   - 위젯은 목표를 "n / N 완료" 카운트로만 그려서 사용자가 **무슨 목표인지 알 수 없었다**.
 *     본문을 함께 내려보내되, 카운트와 반드시 같은 입력에서 만들어야 한다.
 *   - 카드에 얼어붙은 `dailyMotivations/{ymd}.goalsSnapshot` 을 대신 쓰면 안 된다 —
 *     그 값은 카드 생성 시점에 고정되고 설정에서 목표를 고쳐도 갱신되지 않아
 *     "카운트는 새 목표 기준인데 본문은 옛 목표" 라는 새 어긋남을 만든다.
 *   - Next.js route 파일은 핸들러 외 export 를 허용하지 않으므로 여기 둔다(단위 테스트도 가능).
 */
import type { WidgetGoalProgress } from "@/types";

/**
 * 위젯에 실어 보낼 목표 최대 개수 — lib/firebase.ts MAX_USER_GOALS 와 동기화.
 * (저장 시점에 이미 컷되지만, 옛 문서 방어를 위해 응답에서도 한 번 더 제한)
 */
export const MAX_WIDGET_GOALS = 10;

/**
 * 목표/달성 목록 정규화 — 공백 trim, 빈 항목 제거.
 * 목표와 달성 목록 **양쪽에 같은 규칙**을 적용해야 문자열 대조가 어긋나지 않는다.
 * 배열이 아니거나 문자열이 아닌 항목은 조용히 버린다(옛 문서·부분 손상 방어).
 */
export function normalizeGoalTexts(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((g) => (typeof g === "string" ? g.trim() : ""))
    .filter((g) => g.length > 0);
}

/**
 * 위젯 목표 줄 재료 — 본문 + 오늘 달성 여부. **자르지 않고 전부** 돌려준다:
 * 카운트("n / N")의 근거가 이 목록이므로, 여기서 자르면 옛 문서(상한 초과 목표)의
 * 달성 수가 조용히 줄어든다. 표시용 컷은 응답 조립 시점에 [MAX_WIDGET_GOALS] 로 한다.
 *
 * @param goals 사용자가 설정한 목표(정규화 완료본). 이 순서가 위젯 표시 순서다.
 * @param achievedGoals 오늘 달성 처리된 목표(정규화 완료본). 목표에 없는 항목은 무시된다.
 */
export function buildWidgetGoals(
  goals: string[],
  achievedGoals: string[],
): WidgetGoalProgress[] {
  const achieved = new Set(achievedGoals);
  return goals.map((text) => ({ text, achieved: achieved.has(text) }));
}
