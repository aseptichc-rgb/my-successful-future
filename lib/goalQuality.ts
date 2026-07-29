/**
 * 목표 문장의 "구체성" 채점 — 순수 함수, AI 호출 없음.
 *
 * 왜 필요한가: "운동하기" 같은 목표는 실행 여부를 판정할 수 없어 체크가 무의미해진다.
 * 실행의도 연구가 말하는 구체성은 결국 세 가지다 — **얼마나(수량) · 언제/얼마나 자주(주기) ·
 * 무엇으로 세는가(단위)**. 셋 중 몇 개가 들어 있는지만 세면 규칙 기반으로 충분히 유용하다.
 *
 * 정확한 자연어 이해가 목적이 아니다. 이 점수는 오직 "조금 더 구체적으로 써볼까요?" 힌트를
 * 띄울지 말지를 정하는 데만 쓰이므로, 오탐(예: '충분히'의 '분')은 힌트 한 번 덜 뜨는 정도의
 * 비용밖에 없다. 절대 목표 저장을 막거나 사용자를 평가하지 않는다.
 *
 * 4개 로케일의 신호를 한 정규식에 모아둔 이유: 사용자가 앱 언어와 다른 언어로 목표를
 * 적는 일이 흔하고(한국어 UI + 영어 목표), 로케일별로 분기하면 그 경우를 놓친다.
 */
import { GOAL_SPECIFIC_ENOUGH } from "@/lib/constants/goal";

export { GOAL_SPECIFIC_ENOUGH };

/** 구체성 신호 3종. UI 는 "빠진 신호"만 칩으로 제안한다. */
export type GoalSignal = "count" | "cadence" | "unit";

/** 신호 검사 순서 = 힌트 칩 노출 순서. */
export const GOAL_SIGNALS: ReadonlyArray<GoalSignal> = ["count", "cadence", "unit"];

/** 수량 — 아라비아 숫자 또는 한자 수사. 스텝업 초안(lib/goalStepUp)도 이 정의를 공유한다. */
export const RE_COUNT = /[0-9]|[一二三四五六七八九十百千萬万]/;

/** 주기·시점 — 매일/every day/cada día/每天, 그리고 "~까지" 류의 기한. */
const RE_CADENCE =
  /매일|매주|매달|매월|하루|이번\s*[달주]|까지|아침|점심|저녁|밤|새벽|주말|평일|주\s*[0-9一二三四五六七八九]|every|daily|weekly|monthly|each\s|per\s|by\s|before|morning|evening|night|weekday|weekend|cada|diari[ao]|semanal|mensual|todos\s+los|antes\s+de|por\s+la|每天|每週|每周|每日|每月|之前|以前|早上|晚上|週末|周末/i;

/** 단위 — 무엇으로 세는지. 셀 수 있어야 "했다/안 했다"가 판정된다. */
const RE_UNIT =
  /분|시간|회|번|쪽|페이지|권|잔|걸음|세트|칼로리|킬로|미터|min|minute|hour|time|page|word|rep|set|glass|step|mile|km|kg|lb|minuto|hora|vez|veces|p[áa]gina|palabra|vaso|paso|分鐘|分钟|小时|小時|次|页|頁|公里|公斤|杯|步|组|組/i;

const SIGNAL_TESTS: Readonly<Record<GoalSignal, RegExp>> = {
  count: RE_COUNT,
  cadence: RE_CADENCE,
  unit: RE_UNIT,
};

/** 목표에 들어 있지 않은 구체성 신호 목록 (GOAL_SIGNALS 순서 유지). */
export function missingGoalSignals(text: string): GoalSignal[] {
  const value = typeof text === "string" ? text.trim() : "";
  if (value.length === 0) return [...GOAL_SIGNALS];
  return GOAL_SIGNALS.filter((signal) => !SIGNAL_TESTS[signal].test(value));
}

/** 0~3점. GOAL_SPECIFIC_ENOUGH(2) 이상이면 힌트를 띄우지 않는다. */
export function scoreGoalSpecificity(text: string): number {
  return GOAL_SIGNALS.length - missingGoalSignals(text).length;
}

/** 힌트를 띄워야 하는가. 빈 목표는 아직 쓰는 중이므로 잔소리하지 않는다. */
export function needsMoreSpecificGoal(text: string): boolean {
  const value = typeof text === "string" ? text.trim() : "";
  if (value.length === 0) return false;
  return scoreGoalSpecificity(value) < GOAL_SPECIFIC_ENOUGH;
}
