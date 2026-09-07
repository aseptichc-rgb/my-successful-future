/**
 * 스토어 리뷰 요청 카드 — 자격 판정(순수)과 1회성 확인 저장소.
 *
 * 언제 묻는가: 사용자가 **7일을 이어 두 번째 목표 칸을 연 뒤**(lib/goalSlots —
 * GOAL_SLOT_THRESHOLDS[1] = 7). "새 기능이 열린 직후" 가 스토어 리뷰를 부탁하기 가장
 * 자연스러운 순간이다 — 앱이 사용자에게 무언가를 막 돌려줬고, 사용자는 일주일치 꾸준함을
 * 스스로 증명한 뒤라서다. 가입일 기준 7일이 아니라 해금 기준인 이유: 드문드문 쓴 사용자에게
 * 달력만 보고 부탁하면 좋은 평가가 나올 리 없다.
 *
 * 규칙:
 *  - 평생 1회. [리뷰 남기기]든 [괜찮아요]든 한 번 답하면 다시 묻지 않는다(localStorage).
 *    스토어는 인앱 리뷰 시트 노출 빈도를 자체적으로 제한하므로 우리 쪽에서도 재요청하지 않는다.
 *  - 스토어가 있는 환경(Android TWA·iOS Capacitor)에서만. 일반 브라우저에는 남길 곳이 없다.
 *  - 이미 7일을 넘긴 기존 사용자도 한 번은 받는다(earned 가 기준 이상이면 충분).
 *
 * 카드 자체는 components/home/StoreReviewCard, 슬롯 배치는 lib/homeNotice(우선순위 5),
 * 네이티브 발화는 lib/storeReviewBridge 가 맡는다.
 */
import { createAckStore } from "@/lib/ackStore";

/**
 * 리뷰를 부탁하는 최소 "꾸준함으로 연 칸 수". 2 = 두 번째 칸 = 7일 해금
 * (lib/constants/goal GOAL_SLOT_THRESHOLDS[1]). 첫 칸은 기본값이라 해금이 아니다.
 */
export const STORE_REVIEW_MIN_EARNED_SLOTS = 2;

/**
 * "리뷰 요청에 답했는가" — 알림 슬롯(components/home/NoticeSlot)이 자격 판정에 같은 값을 읽는다.
 * SSR 스냅샷은 true(이미 답함) — 서버 렌더에서는 항상 숨겼다가 하이드레이션 후에만 판정한다.
 */
export const storeReviewAckStore = createAckStore<boolean>("anima.storeReview.ack", {
  parse: (raw) => raw === "1",
  serialize: (value) => (value ? "1" : "0"),
  serverSnapshot: true,
});

export function shouldShowStoreReview({
  earned,
  acked,
  inApp,
}: {
  /** 꾸준함으로 연 칸 수 (computeGoalSlots().earned). */
  earned: number;
  /** storeReviewAckStore 스냅샷 — 이미 한 번 답했는가. */
  acked: boolean;
  /** 스토어가 있는 네이티브 앱 안인가 (lib/storeReviewBridge isStoreReviewAvailable). */
  inApp: boolean;
}): boolean {
  return inApp && !acked && earned >= STORE_REVIEW_MIN_EARNED_SLOTS;
}
