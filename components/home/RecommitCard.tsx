"use client";

import { useSyncExternalStore } from "react";
import { createAckStore } from "@/lib/ackStore";
import { computeRecommitVariant } from "@/lib/recommit";
import { useT } from "@/lib/i18n";
import type { AffirmationStreak } from "@/types";

/* ─────────────────────────────────────────────────────────────────
 * RecommitCard — 스트릭 공백 감지 시 오늘 탭 알림 슬롯에 뜨는 복귀 카드.
 *
 * 두 가지 변형 (판정은 lib/recommit 순수 함수 — 알림 슬롯과 같은 결과를 본다):
 *  · freezeChip: 놓친 날 수 <= 남은 프리즈 → "체크인하면 얼음이 이어줘요" 안내 칩.
 *  · recommit  : 프리즈로도 못 막는 공백 → 자기연민 재약속 카드
 *    (Breines & Chen 2012 — 자기연민이 자존감 부양보다 개선 동기를 높인다).
 *    X 로 닫으면 오늘 날짜를 기록해 당일 재노출을 막는다(자정이 지나면 다시 뜬다).
 * ───────────────────────────────────────────────────────────────── */

/** SSR 스냅샷 — 어떤 날짜와도 같지 않은 "닫힘" 센티널. 서버 렌더에서는 항상 숨긴다. */
const DISMISSED_SENTINEL = "*";

/** 재약속 카드를 닫은 날짜(KST YYYY-MM-DD). 하루 1키씩 쌓이던 옛 `anima.recommit.<ymd>` 를 대체한다. */
export const recommitDismissStore = createAckStore<string>("anima.recommit.dismissedYmd", {
  parse: (raw) => raw ?? "",
  serialize: (value) => value,
  serverSnapshot: DISMISSED_SENTINEL,
});

export function isRecommitDismissed(ack: string, todayYmd: string): boolean {
  return ack === DISMISSED_SENTINEL || ack === todayYmd;
}

export default function RecommitCard({
  streak,
  todayYmd,
  alreadyCheckedInToday,
  onCheckinCta,
}: {
  streak: AffirmationStreak | undefined;
  todayYmd: string;
  /** 오늘 이미 체크인했다면 카드를 띄울 이유가 없다. */
  alreadyCheckedInToday: boolean;
  /** "지금 체크인하기" CTA — 오늘 탭이 체크인 카드로 스크롤/포커스를 담당. */
  onCheckinCta: () => void;
}) {
  const t = useT();
  const ack = useSyncExternalStore(
    recommitDismissStore.subscribe,
    recommitDismissStore.getSnapshot,
    recommitDismissStore.getServerSnapshot,
  );

  const variant = computeRecommitVariant({ streak, todayYmd, alreadyCheckedInToday });
  if (variant.kind === "none") return null;

  // ── 변형 1: 프리즈로 이어지는 공백 — 가벼운 안내 칩 ──
  if (variant.kind === "freezeChip") {
    return (
      <div className="mx-4 mt-4 flex items-center gap-2.5 rounded-[12px] px-4 py-3"
        style={{ background: "rgba(0,122,255,0.08)" }}>
        <span aria-hidden className="text-[15px]">🧊</span>
        <p className="flex-1 text-[13px] leading-[18px] tracking-[-0.08px] text-[var(--label)]">
          {t("recommit.freezeChip", { count: variant.missed })}
        </p>
        <button
          type="button"
          onClick={onCheckinCta}
          className="text-[13px] font-semibold text-[var(--soul)] whitespace-nowrap"
        >
          {t("recommit.cta")}
        </button>
      </div>
    );
  }

  // ── 변형 2: 끊긴 공백 — 자기연민 재약속 카드 (당일 dismiss 가능) ──
  if (isRecommitDismissed(ack, todayYmd)) return null;

  return (
    <div
      className="mx-4 mt-4 rounded-[12px] bg-[var(--bg-grouped-2)] px-5 py-4"
      role="status"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[17px] font-semibold leading-[22px] tracking-[-0.43px] text-[var(--label)]">
          {t("recommit.title")}
        </p>
        <button
          type="button"
          aria-label={t("recommit.dismissAria")}
          onClick={() => recommitDismissStore.acknowledge(todayYmd)}
          className="w-7 h-7 -mr-1 flex items-center justify-center text-[var(--label-3)] hover:opacity-70 transition-opacity"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <p className="mt-1 text-[15px] leading-[21px] tracking-[-0.24px] text-[var(--label-2)]">
        {t("recommit.body", { prev: variant.prev, best: variant.best })}
      </p>
      <button
        type="button"
        onClick={onCheckinCta}
        className="mt-3 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[15px] font-semibold text-white"
        style={{ background: "#D85A30" }}
      >
        {t("recommit.cta")}
      </button>
    </div>
  );
}
