/**
 * 목표·다짐 정책 상수 — 클라이언트 안전 모듈.
 *
 * 온보딩(app/onboarding)·홈(app/home)·설정(app/settings)·순수 계산 모듈
 * (lib/goalSlots, lib/goalText, lib/goalQuality)이 모두 같은 값을 봐야 한다.
 * lib/firebase.ts 는 Firebase SDK 를 끌고 오므로 순수 모듈이 그쪽을 import 할 수 없어
 * 상수만 여기로 분리했다(lib/constants/streak.ts 와 동일한 이유·패턴).
 */

/** 성공 선언 1줄 저장 상한. 매일 그대로 따라 적어야 하므로 길면 앵커 행동이 비싸진다. */
export const SUCCESS_AFFIRMATION_MAX_LEN = 60;

/**
 * 옛 파생 로직이 목표 앞에 붙였던 1인칭 접두사의 최대 길이("나는 " / "Yo " / "I ").
 *
 * 파생 자체는 사라졌지만(성공 선언과 목표는 이제 각각 입력받는다) 이 값은 두 곳에서
 * 여전히 의미가 있다:
 *  · GOAL_TEXT_MAX 의 여유분 — 기존 사용자의 목표 길이 상한을 바꾸지 않기 위해 유지.
 *  · 홈의 DeclarationNudgeCard — "선언이 목표의 파생본인가" 를 접두사 길이로 판정한다.
 */
export const LEGACY_AFFIRMATION_PREFIX_MAX = 4;

/**
 * 목표 1줄 입력 상한.
 * 파생 시절의 값을 그대로 유지한다 — 상한을 올리면 이미 저장된 목표와 새 목표의
 * 허용 길이가 갈려 "왜 어제는 됐는데" 류의 혼란만 생긴다.
 */
export const GOAL_TEXT_MAX = SUCCESS_AFFIRMATION_MAX_LEN - LEGACY_AFFIRMATION_PREFIX_MAX;

/**
 * 꾸준함으로 열 수 있는 목표 슬롯 상한.
 * 과거 3으로 잠근 이유는 "넘어가면 홈이 다시 할 일 목록이 된다"였는데, 지금은 구조가
 * 그 우려를 해소한다 — 첫 목표만 오늘 카드의 필수 행동이고, 2번 이후 목표는 그 아래
 * 원탭 체크 행(components/home/ExtraGoalRows)으로만 그려진다(입력칸 없음). 편집은 내 꿈 탭.
 * 상한을 올려도 오늘 탭의 필수 행동은 여전히 하나다.
 */
export const GOAL_SLOT_MAX = 5;

/**
 * 슬롯 n(1-based)을 여는 최소 "역대 최고 연속일"(다짐 전사·목표 달성 두 축 중 큰 값).
 * 인덱스 0 = 첫 슬롯(조건 없음), 1 = 7일, 2 = 21일, 3 = 45일, 4 = 66일.
 * 66일은 습관 자동화 중앙값(Lally 2010 — lib/constants/streak.ts 가 인용하는 그 문헌).
 * 길이는 항상 GOAL_SLOT_MAX 와 같아야 한다.
 */
export const GOAL_SLOT_THRESHOLDS: ReadonlyArray<number> = [0, 7, 21, 45, 66];

/** 이 점수 미만이면 "조금 더 구체적으로" 힌트를 노출한다 (lib/goalQuality). */
export const GOAL_SPECIFIC_ENOUGH = 2;
