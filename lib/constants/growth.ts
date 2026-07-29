/**
 * 성장 단계·스텝업 정책 상수 — 클라이언트 안전 모듈.
 *
 * 성장 단계는 새 화폐가 아니다 — 이미 돌고 있는 정체성 증거 표(lib/identityEvidence,
 * 하루 최대 4표)의 누적 총합(users/{uid}.growth.votes)을 눈에 보이는 단계로 승격한 것.
 * 순수 계산(lib/growthStage)·체크인 트랜잭션(lib/affirmationCheckin)·UI 가 같은 값을 봐야
 * 하므로 lib/constants/goal.ts 와 동일한 이유로 상수만 분리했다.
 */

/**
 * 성장 단계 임계값(누적 증거 표). 인덱스 = 단계(0=씨앗 … 5=숲).
 * 하루 평균 ~2표 기준 약 1년 서사 — 마지막 단계(600표)가 대략 10개월~1년이다.
 */
export const GROWTH_STAGE_THRESHOLDS: ReadonlyArray<number> = [0, 20, 60, 140, 300, 600];

/**
 * 단계별 표시 이모지 (씨앗→새싹→줄기→가지→나무→숲).
 * 단계 이름은 i18n(growth.stage.N)에 있고, 이모지는 언어 무관이라 여기 둔다.
 * 길이는 항상 GROWTH_STAGE_THRESHOLDS 와 같아야 한다.
 */
export const GROWTH_STAGE_EMOJI: ReadonlyArray<string> = ["🌰", "🌱", "🌿", "🍃", "🌳", "🌲"];

/** 스텝업 제안을 띄우는 최소 목표 달성 연속일. */
export const STEPUP_MIN_STREAK = 7;

/** 스텝업이 목표의 첫 수량에 곱하는 배율 — 결과는 올림(ceil)한다. */
export const STEPUP_MULTIPLIER = 1.5;
