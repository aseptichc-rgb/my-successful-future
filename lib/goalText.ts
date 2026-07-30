/**
 * 목표 텍스트 정규화 — 순수 모듈, Firebase/DOM 의존 없음.
 *
 * 원래 lib/affirmationDerive.ts 안에 있었다. 그 파일은 "목표 1줄 → 다짐 1줄" 파생을
 * 담당했지만, 성공 선언(successAffirmations)과 오늘의 목표(goals)를 각각 받도록
 * 바뀌면서 파생 자체가 사라졌다. 남은 정규화 함수는 목표 텍스트의 관심사이므로
 * lib/constants/goal.ts 와 같은 자리로 옮겼다.
 *
 * 저장 직전과 비교 시점이 같은 결과를 내야 "같은 목표인가" 판정이 흔들리지 않는다 —
 * 온보딩·설정·홈의 제안 배너가 모두 이 함수 하나를 공유하는 이유다.
 */
import { GOAL_TEXT_MAX } from "@/lib/constants/goal";

/** trim + 연속 공백 축약 + 길이 클램프. 문자열이 아니면 빈 문자열. */
export function normalizeGoalText(raw: string): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\s+/g, " ").slice(0, GOAL_TEXT_MAX);
}
