/**
 * "만든 사람에게 한마디" 피드백 카드 — 자격 판정(순수)과 1회성 확인 저장소.
 *
 * 왜 있는가: 사용자 수십 명 규모에서는 이벤트 숫자보다 문장 한 줄이 더 많은 걸 알려준다.
 * 스토어 리뷰 카드(lib/storeReview)와 같은 골격이지만 목적이 다르다 — 별점이 아니라
 * "왜 깔았고, 어디서 막히고, 무엇에 돈을 낼지" 를 듣는 통로다.
 *
 * 언제 묻는가: 역대 최고 스트릭이 FEEDBACK_MIN_STREAK 이상일 때. 하루 써본 사람의 첫인상이
 * 아니라 며칠 써본 사람의 의견을 원해서다. 현재 스트릭이 끊겼어도 bestCount 로 판정하므로
 * "며칠 쓰다 그만둔 이유" 도 들을 수 있다.
 *
 * 규칙:
 *  - 평생 1회. [한마디 남기기]로 보냈든 [괜찮아요]로 닫았든 다시 묻지 않는다(localStorage).
 *  - 플랫폼 무관 — 웹에서도 보낼 수 있다(스토어 리뷰와 다른 점).
 *
 * 카드는 components/home/FeedbackCard, 슬롯 배치는 lib/homeNotice(우선순위 6),
 * 저장은 /api/feedback 이 맡는다.
 */
import { createAckStore } from "@/lib/ackStore";
import type { AffirmationStreak } from "@/types";

/** 피드백을 부탁하는 최소 역대 최고 스트릭(일). */
export const FEEDBACK_MIN_STREAK = 3;

/** 피드백 본문 최대 길이 — 클라 입력 가드와 서버 검증이 같은 값을 본다. */
export const FEEDBACK_MAX_LEN = 500;

export const feedbackAckStore = createAckStore<boolean>("anima.feedback.ack", {
  parse: (raw) => raw === "1",
  serialize: (value) => (value ? "1" : "0"),
  serverSnapshot: true,
});

/** 역대 최고 스트릭 — 레거시 문서는 bestCount 가 없으니 count 로 폴백. */
export function bestStreak(streak: AffirmationStreak | undefined): number {
  if (!streak) return 0;
  return Math.max(streak.bestCount ?? 0, streak.count ?? 0);
}

export function shouldShowFeedbackCard({
  streak,
  acked,
}: {
  streak: AffirmationStreak | undefined;
  /** feedbackAckStore 스냅샷 — 이미 한 번 답했는가. */
  acked: boolean;
}): boolean {
  return !acked && bestStreak(streak) >= FEEDBACK_MIN_STREAK;
}
