/**
 * 트라이얼 배너 표시 상태 — entitlement + 원시 trialEndsAt 을 화면이 그릴 4가지 상태로 압축한다.
 *
 * readEntitlement 는 만료된 trial 을 'free' 로 접어버리므로(게이트 판정엔 그게 맞다), 배너는
 * "체험이 끝났다(만료)" 와 "체험을 받은 적 없다(none)" 를 구분하기 위해 원시 trialEndsAt 을
 * 함께 본다. 이 판정을 순수 함수로 떼어내 홈 배너 컴포넌트와 단위 테스트가 공유한다.
 *
 *   pro     — 결제 완료(평생/구독). 배너 없음.
 *   trial   — 체험 중. "남은 N일" 카운트다운.
 *   expired — 체험이 만료됨(trialEndsAt 이 과거). "체험이 끝났어요" + 업그레이드.
 *   none    — 체험 정보 없음(미시작 등). 배너 없음.
 */
import type { Entitlement } from "@/lib/entitlement";

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type TrialStatus =
  | { kind: "pro" }
  | { kind: "trial"; daysLeft: number }
  | { kind: "expired" }
  | { kind: "none" };

function isPositiveNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/**
 * 배너 상태를 계산한다.
 *
 * @param entitlement readEntitlement() 결과 (게이트와 동일한 권한 판정을 재사용).
 * @param trialEndsAt custom claim 의 원시 trialEndsAt(ms). 없으면 null.
 * @param now         기준 시각(ms). 테스트에서 주입, 기본은 현재 시각.
 */
export function computeTrialStatus(
  entitlement: Entitlement,
  trialEndsAt: number | null,
  now: number = Date.now(),
): TrialStatus {
  if (entitlement.kind === "lifetime" || entitlement.kind === "subscription") {
    return { kind: "pro" };
  }

  if (entitlement.kind === "trial") {
    // entitlement.kind === "trial" 은 trialEndsAt > now 가 보장된 상태이므로 daysLeft >= 1.
    // 남은 시간을 "일" 로 올림해 마지막 하루도 "1일 남음" 으로 보이게 한다.
    const remainingMs = entitlement.trialEndsAt - now;
    const daysLeft = Math.max(1, Math.ceil(remainingMs / MS_PER_DAY));
    return { kind: "trial", daysLeft };
  }

  // 여기부터 entitlement 는 'free' — 트라이얼이 있었고 지났으면 만료, 아니면 정보 없음.
  if (isPositiveNumber(trialEndsAt) && trialEndsAt <= now) {
    return { kind: "expired" };
  }

  return { kind: "none" };
}
