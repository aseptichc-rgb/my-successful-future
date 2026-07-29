/**
 * 홈의 시간대 모드 — **무엇을 보여줄지만** 정한다.
 *
 * ⚠️ 절대 "어디에 둘지"는 정하지 않는다. 시간대에 따라 카드를 재배치하면 같은 버튼이
 * 매일 다른 자리에 오고, 습관이 학습하는 위치 단서(context cue)가 깨진다.
 *
 * 홈 페이지와 접힘 섹션(components/home/MoreSection)이 같은 판정을 공유해야 해서
 * 순수 모듈로 분리했다 — 컴포넌트가 페이지를 import 하는 역방향 의존을 만들지 않는다.
 */
import { kstHour } from "@/lib/kstDate";

/**
 * 아침(<12): "오늘의 if-then" 을 펼쳐 보여준다(compact=false).
 * 저녁(>=18): 기록 섹션에 "내일 첫 행동 1개" 를 추가하고, 일요일이면 주간 회고를 띈다.
 * 사이(12~17): 중립.
 */
export const MORNING_END_HOUR = 12;
export const EVENING_START_HOUR = 18;

/** 주간 회고를 띄우는 요일 (0=일요일) — 한 주를 닫는 시점. */
export const WEEKLY_REVIEW_WEEKDAY = 0;

export type HomeMode = "morning" | "neutral" | "evening";

export function currentHomeMode(): HomeMode {
  const h = kstHour();
  return h < MORNING_END_HOUR ? "morning" : h >= EVENING_START_HOUR ? "evening" : "neutral";
}
