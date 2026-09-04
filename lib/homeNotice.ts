/**
 * 오늘 탭 상단 알림 슬롯 — 여러 배너 중 **한 장만** 고르는 순수 함수.
 *
 * 예전 홈은 체험 배너·재약속 카드·선언 안내·슬롯 해금·스텝업이 명언 위에 최대 5장 쌓였다.
 * 나쁜 날(스트릭 끊긴 체험 사용자)엔 오늘의 행동이 두 화면 아래로 밀렸다. 이제 자격 있는
 * 배너 가운데 우선순위가 가장 높은 하나만 그린다.
 *
 * 우선순위(높은 순) — 스스로 해소되는 1회성이 영구 상태 배너보다 위:
 *   1. recommit         — 오늘의 필수 행동과 직결(체크인 CTA), 체크인·당일 닫기로 해소
 *   2. slotUnlock       — "칸이 열린 순간" 1회성, 확인하면 사라짐
 *   3. stepUp           — 같은 축의 1회성 제안(해금과 겹치면 다음 날)
 *   4. declarationNudge — 레거시 1회성, 영구 닫기, 시급하지 않음
 *   5. trialExpired     — 구매 전까지 영구(닫기 없음)
 *   6. trial            — 체험 내내 상시(D-day)
 *
 * trialExpired 를 위에 두면 만료 후 미구매 사용자가 슬롯 해금·스텝업을 영영 못 본다.
 * 같은 이유로 "닫았지만 자격 있는" 카드가 아래 카드를 막지 않도록, 닫힘(dismiss) 상태는
 * 호출부가 자격 판정에 포함해서 넘긴다.
 */

export type HomeNoticeKind =
  | "recommit"
  | "slotUnlock"
  | "stepUp"
  | "declarationNudge"
  | "trialExpired"
  | "trial";

export const HOME_NOTICE_PRIORITY: ReadonlyArray<HomeNoticeKind> = [
  "recommit",
  "slotUnlock",
  "stepUp",
  "declarationNudge",
  "trialExpired",
  "trial",
];

/** 자격 맵에서 우선순위가 가장 높은 하나를 고른다. 아무것도 없으면 null. */
export function pickHomeNotice(
  eligible: Partial<Record<HomeNoticeKind, boolean>>,
): HomeNoticeKind | null {
  return HOME_NOTICE_PRIORITY.find((kind) => eligible[kind] === true) ?? null;
}
