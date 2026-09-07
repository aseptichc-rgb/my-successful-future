"use client";

import { useSyncExternalStore } from "react";
import { useT } from "@/lib/i18n";
import { shouldShowStoreReview, storeReviewAckStore } from "@/lib/storeReview";
import { isStoreReviewAvailable, requestStoreReview } from "@/lib/storeReviewBridge";

/* ─────────────────────────────────────────────────────────────────
 * StoreReviewCard — 7일 해금(두 번째 목표 칸) 뒤 한 번만 뜨는 스토어 리뷰 부탁.
 *
 * "새 기능이 열린 직후" 는 사용자가 일주일치 꾸준함을 스스로 증명한 뒤라 별점을 부탁하기
 * 가장 자연스러운 순간이다. 자격 판정은 lib/storeReview(순수), 네이티브 시트 발화는
 * lib/storeReviewBridge — 이 카드는 문구와 두 버튼만 맡는다.
 *
 *   [리뷰 남기기]  → 같은 탭 제스처 안에서 인앱 리뷰 시트 요청 후 영구 종료
 *   [괜찮아요]     → 영구 종료 (다시 묻지 않는다)
 *
 * 시트를 실제로 띄울지는 스토어가 정한다(빈도 제한). 그래서 어느 쪽을 눌러도 카드는 즉시 사라지고,
 * 요청 결과에 따라 문구를 바꾸거나 재요청하지 않는다.
 *
 * SSR 스냅샷은 "이미 답함"(true) — 서버 렌더에서는 항상 숨겨졌다가 하이드레이션 후에만
 * 실제 값으로 판정된다(SlotUnlockBanner·StepUpCard 와 같은 규칙).
 * ───────────────────────────────────────────────────────────────── */

export default function StoreReviewCard({
  earned,
}: {
  /** 꾸준함으로 연 칸 수 (computeGoalSlots().earned). */
  earned: number;
}) {
  const t = useT();
  const acked = useSyncExternalStore(
    storeReviewAckStore.subscribe,
    storeReviewAckStore.getSnapshot,
    storeReviewAckStore.getServerSnapshot,
  );

  if (!shouldShowStoreReview({ earned, acked, inApp: isStoreReviewAvailable() })) return null;

  const dismiss = () => storeReviewAckStore.acknowledge(true);

  const handleReview = () => {
    // Android 인텐트는 이 탭의 user activation 안에서만 발화된다 — await 없이 먼저 부른다.
    // 결과는 스토어 몫이라 기다리지 않는다(실패도 브릿지가 삼킨다).
    void requestStoreReview();
    dismiss();
  };

  return (
    <div className="mx-4 mt-4 rounded-[12px] bg-[var(--bg-grouped-2)] px-5 py-4">
      <p className="text-[17px] font-semibold tracking-[-0.43px] text-[var(--label)]">
        {t("storeReview.title")}
      </p>
      <p className="mt-1.5 text-[13px] leading-[18px] tracking-[-0.08px] text-[var(--label-2)]">
        {t("storeReview.body")}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleReview}
          className="rounded-full bg-[#1E1B4B] px-4 py-2 text-[15px] font-semibold text-white"
        >
          {t("storeReview.cta")}
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="ml-auto text-[15px] font-medium text-[var(--label-3)]"
        >
          {t("storeReview.later")}
        </button>
      </div>
    </div>
  );
}
