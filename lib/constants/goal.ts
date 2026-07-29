/**
 * 목표·다짐 정책 상수 — 클라이언트 안전 모듈.
 *
 * 온보딩(app/onboarding)·홈(app/home)·설정(app/settings)·순수 계산 모듈
 * (lib/goalSlots, lib/affirmationDerive, lib/goalQuality)이 모두 같은 값을 봐야 한다.
 * lib/firebase.ts 는 Firebase SDK 를 끌고 오므로 순수 모듈이 그쪽을 import 할 수 없어
 * 상수만 여기로 분리했다(lib/constants/streak.ts 와 동일한 이유·패턴).
 */

/** 다짐 1줄 저장 상한. 매일 그대로 따라 적어야 하므로 길면 앵커 행동이 비싸진다. */
export const SUCCESS_AFFIRMATION_MAX_LEN = 60;

/**
 * 목표 1줄 입력 상한.
 * 다짐은 목표 앞에 1인칭 접두사(최대 3자, "나는 "/"Yo ")를 붙여 파생되므로
 * `SUCCESS_AFFIRMATION_MAX_LEN - 4` 로 잡아야 파생 결과가 잘리지 않는다.
 */
export const GOAL_TEXT_MAX = SUCCESS_AFFIRMATION_MAX_LEN - 4;

/** 꾸준함으로 열 수 있는 목표 슬롯 상한. 넘어가면 홈이 다시 할 일 목록이 된다. */
export const GOAL_SLOT_MAX = 3;

/**
 * 슬롯 n(1-based)을 여는 최소 "역대 최고 연속일".
 * 인덱스 0 = 첫 슬롯(조건 없음), 1 = 7일, 2 = 21일.
 * 길이는 항상 GOAL_SLOT_MAX 와 같아야 한다.
 */
export const GOAL_SLOT_THRESHOLDS: ReadonlyArray<number> = [0, 7, 21];

/** 이 점수 미만이면 "조금 더 구체적으로" 힌트를 노출한다 (lib/goalQuality). */
export const GOAL_SPECIFIC_ENOUGH = 2;
