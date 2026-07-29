/**
 * 온보딩 진행률 계산 — 단일 정직한 카운터.
 *
 * 입력 화면은 두 개뿐이다: "10년 뒤 나의 하루"(1문항) 와 "딱 하나의 목표"(1칸).
 * 언어 선택(1탭 로케일)과 미리보기(보상 화면)는 입력이 아니므로 분모에서 제외한다.
 *
 * 이전에는 미래자아 7문항이 각각 한 화면이라 분모가 9였다. 입력 부담 피드백에 따라
 * 미래 서술을 1문항으로 줄이면서 분모도 함께 2로 내려갔다 —
 * 나머지 6개 차원은 삭제하지 않고 설정(원하는 사람만)으로 옮겼다.
 *
 * 순수 함수 — step 값만으로 결과가 결정되므로 (step → 결과) 표로 자체 검증 가능하다.
 */

/** 카운트 대상 입력 화면 수 = 미래 서술 1 + 목표 1. */
export const ONBOARDING_CONTENT_SCREENS = 2;

export interface OnboardingProgress {
  /** 현재 화면 순번 (1-based). */
  current: number;
  /** 전체 입력 화면 수. */
  total: number;
  /** 현재 화면 이후 남은 화면 수. */
  remaining: number;
}

/**
 * step → 진행률. 진행바를 숨겨야 하는 화면
 * (step 0 언어 선택, step 3 미리보기, 그 외 범위 밖)에서는 null 을 반환한다.
 *
 * @param step 온보딩 단계 0..3 (0 언어 · 1 미래 서술 · 2 목표 · 3 미리보기)
 */
export function computeOnboardingProgress(step: number): OnboardingProgress | null {
  if (step !== 1 && step !== 2) return null;
  const current = step; // step 1 → 1/2, step 2 → 2/2
  const total = ONBOARDING_CONTENT_SCREENS;
  return { current, total, remaining: Math.max(total - current, 0) };
}
