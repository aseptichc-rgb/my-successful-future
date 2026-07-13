/**
 * 온보딩 진행률 계산 — 단일 정직한 카운터.
 *
 * 기존엔 진행 표시기가 상단 "5단계"와 미래자아 내부 "7문항"으로 쪼개져
 * 분모가 서로 달랐다. 여기서는 언어 선택(1탭 로케일)과 미리보기(보상 화면)를
 * 제외한 실제 입력 화면 = 미래자아 7 + 다짐 + 행동 = 9개를 하나의 분모로 센다.
 *
 * 순수 함수 — UI/저장과 무관하며 (step, futureStep) 조합만으로 결과가 결정된다.
 * 따라서 별도 예외 처리가 필요 없고, (step, futureStep) 표로 자체 검증 가능하다.
 */
import { FUTURE_SELF_DIMENSIONS } from "@/lib/futureSelf";

/** 카운트 대상 입력 화면 수 = 미래자아 질문 수 + 다짐 + 행동. */
export const ONBOARDING_CONTENT_SCREENS = FUTURE_SELF_DIMENSIONS.length + 2;

export interface OnboardingProgress {
  /** 현재 화면 순번 (1-based). */
  current: number;
  /** 전체 입력 화면 수. */
  total: number;
  /** 현재 화면 이후 남은 화면 수. */
  remaining: number;
}

/**
 * (step, futureStep) → 진행률. 진행바를 숨겨야 하는 화면
 * (step 0 언어 선택, step 4 미리보기, 그 외 범위 밖)에서는 null 을 반환한다.
 *
 * @param step       온보딩 매크로 단계 0..4
 * @param futureStep 미래자아 하위 질문 인덱스 0..(FUTURE_SELF_DIMENSIONS.length-1)
 */
export function computeOnboardingProgress(
  step: number,
  futureStep: number,
): OnboardingProgress | null {
  const futureCount = FUTURE_SELF_DIMENSIONS.length;
  let current: number;
  switch (step) {
    case 1: // 미래자아 — 하위 질문 1..futureCount (범위 밖 입력은 방어적으로 클램프)
      current = Math.min(Math.max(futureStep, 0), futureCount - 1) + 1;
      break;
    case 2: // 다짐
      current = futureCount + 1;
      break;
    case 3: // 행동
      current = futureCount + 2;
      break;
    default: // 0(언어) · 4(미리보기) · 범위 밖 → 진행바 미표시
      return null;
  }
  const total = ONBOARDING_CONTENT_SCREENS;
  return { current, total, remaining: Math.max(total - current, 0) };
}
