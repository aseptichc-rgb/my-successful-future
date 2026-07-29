/**
 * 스텝업 초안 — 순수 함수, AI 호출 없음.
 *
 * 목표 달성 스트릭(goalStreak.count)이 충분히 이어졌을 때, 목표 문장의 첫 수량을
 * STEPUP_MULTIPLIER 배(올림)로 올린 초안을 만든다. "매일 10분 책 읽기" + 8일 →
 * "매일 15분 책 읽기". 숫자가 없으면 null — 올릴 대상이 없으므로 침묵한다(잔소리 금지).
 *
 * 적용 대상은 첫 목표(primaryGoal) 하나뿐이다. goalStreak 은 "하루에 목표를 1개 이상
 * 달성했는가"의 스트릭이라 특정 목표를 지목할 수 없다 — 문구도 목표를 단정하지 않는다.
 *
 * 수량 존재 판정은 lib/goalQuality 의 RE_COUNT(단일 정의)를 그대로 쓴다. 한자 수사만
 * 있는 목표(예: "매일 십 분")는 산술 변환이 정의돼 있지 않으므로 침묵한다.
 */
import { GOAL_TEXT_MAX } from "@/lib/constants/goal";
import { STEPUP_MIN_STREAK, STEPUP_MULTIPLIER } from "@/lib/constants/growth";
import { RE_COUNT } from "@/lib/goalQuality";

/** 첫 아라비아 숫자 연속 구간 — RE_COUNT 는 "수량 존재" 판정, 이건 그 수량의 추출용. */
const RE_FIRST_ARABIC_INT = /\d+/;

/**
 * 스텝업 초안 문자열. 조건 미달(스트릭 부족·수량 없음·추출 불가·결과가 입력 상한 초과)
 * 이면 null — 카드 자체를 그리지 않는 신호다.
 */
export function suggestStepUp(goalText: string, streakCount: number): string | null {
  const streak = Number(streakCount);
  if (!Number.isFinite(streak) || streak < STEPUP_MIN_STREAK) return null;

  const text = typeof goalText === "string" ? goalText.trim() : "";
  if (text.length === 0 || !RE_COUNT.test(text)) return null;

  const match = RE_FIRST_ARABIC_INT.exec(text);
  if (!match) return null; // 한자 수사만 있는 경우 — 침묵.

  const value = parseInt(match[0], 10);
  if (!Number.isFinite(value) || value <= 0) return null;

  const raised = Math.ceil(value * STEPUP_MULTIPLIER);
  if (raised <= value) return null;

  const draft =
    text.slice(0, match.index) + String(raised) + text.slice(match.index + match[0].length);
  // 올린 수량이 목표 입력 상한을 넘기면 저장할 수 없는 초안 — 제안하지 않는다.
  return draft.length <= GOAL_TEXT_MAX ? draft : null;
}
