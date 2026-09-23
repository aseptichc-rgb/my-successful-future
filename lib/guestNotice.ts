/**
 * 게스트(익명 계정) 안내 카드 — 당일 닫기 저장소와 판정.
 *
 * 게스트는 로그인 없이 온보딩·체크인을 먼저 경험한 사용자다(lib/firebase signInAsGuest).
 * 기록이 이 기기의 익명 계정에만 있어서, 앱을 지우거나 기기를 바꾸면 사라진다.
 * 카드는 그 사실과 "계정 연결" 진입점(/signup)을 알린다.
 *
 * 닫기는 재약속 카드와 같은 규칙 — 오늘 날짜를 저장해 당일만 숨기고 자정이 지나면 다시 뜬다.
 * 영구 닫기를 두지 않는 이유: 데이터 손실 위험은 사용자가 잊을수록 커진다.
 */
import { createAckStore } from "@/lib/ackStore";

/** SSR 스냅샷 — 어떤 날짜와도 같지 않은 "닫힘" 센티널. 서버 렌더에서는 항상 숨긴다. */
const DISMISSED_SENTINEL = "*";

export const guestLinkDismissStore = createAckStore<string>("anima.guestLink.dismissedYmd", {
  parse: (raw) => raw ?? "",
  serialize: (value) => value,
  serverSnapshot: DISMISSED_SENTINEL,
});

export function isGuestLinkDismissed(ack: string, todayYmd: string): boolean {
  return ack === DISMISSED_SENTINEL || ack === todayYmd;
}
