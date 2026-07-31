/**
 * 스텝업 정책 상수 — 클라이언트 안전 모듈 (lib/constants/goal.ts 와 동일한 이유·패턴).
 *
 * 성장 단계 테이블(임계값·이모지·i18n 라벨 키)은 lib/growthStage.ts 의 GROWTH_STAGES 로
 * 통합돼 있다 — 인덱스로만 묶인 병렬 배열을 두 파일에 나눠 두면 길이 동기화 실수가
 * 조용히 undefined 렌더로 새기 때문에, 단계 정의는 한 행 한 곳에만 둔다.
 */

/** 스텝업 제안을 띄우는 최소 목표 달성 연속일. */
export const STEPUP_MIN_STREAK = 7;

/** 스텝업이 목표의 첫 수량에 곱하는 배율 — 결과는 올림(ceil)한다. */
export const STEPUP_MULTIPLIER = 1.5;

/**
 * 실행 설계(WOOP)를 여는 최소 "역대 최고 연속일" — 다짐 전사·목표 달성 두 축 중 큰 값.
 * GOAL_SLOT_THRESHOLDS[1](7일)과 지금 값이 같지만 서로 다른 정책이라 독립 상수로 둔다 —
 * 배열 인덱스로 묶으면 목표 칸 임계값을 조정할 때 실행 설계 해금이 조용히 따라 움직인다.
 */
export const PLAN_UNLOCK_STREAK = 7;
