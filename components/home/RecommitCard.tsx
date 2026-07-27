"use client";

import { useEffect, useState } from "react";
import { diffKstDays, kstMonth } from "@/lib/kstDate";
import { FREEZES_PER_MONTH } from "@/lib/constants/streak";
import { useT } from "@/lib/i18n";
import type { AffirmationStreak } from "@/types";

/* ─────────────────────────────────────────────────────────────────
 * RecommitCard — 스트릭 공백 감지 시 홈 최상단에 뜨는 복귀 카드.
 *
 * 두 가지 변형 (클라이언트 gap 판정 — 실제 스트릭 갱신은 서버 트랜잭션에서만):
 *  · freezeSave: 놓친 날 수 <= 남은 프리즈 → "체크인하면 얼음이 이어줘요" 안내 칩.
 *  · recommit : 프리즈로도 못 막는 공백 → 자기연민 재약속 카드
 *    (Breines & Chen 2012 — 자기연민이 자존감 부양보다 개선 동기를 높인다).
 *    X 로 닫으면 localStorage 에 오늘 날짜로 기록해 당일 재노출을 막는다.
 * ───────────────────────────────────────────────────────────────── */

const DISMISS_KEY_PREFIX = "anima.recommit.";

function readDismissed(ymd: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DISMISS_KEY_PREFIX + ymd) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(ymd: string): void {
  try {
    window.localStorage.setItem(DISMISS_KEY_PREFIX + ymd, "1");
  } catch {
    /* localStorage 불가 환경(사파리 시크릿 등) — 이번 세션만 닫힌 상태 유지 */
  }
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
  /** "지금 체크인하기" CTA — 홈이 체크인 카드로 스크롤/탭 전환을 담당. */
  onCheckinCta: () => void;
}) {
  const t = useT();
  const [dismissed, setDismissed] = useState<boolean>(() => readDismissed(todayYmd));

  // 자정 롤오버(ymd 변경) 시 dismiss 상태를 새 날짜 기준으로 재평가.
  useEffect(() => {
    setDismissed(readDismissed(todayYmd));
  }, [todayYmd]);

  const count = streak?.count ?? 0;
  const lastYmd = streak?.lastYmd ?? "";
  if (count <= 0 || !lastYmd || alreadyCheckedInToday) return null;

  const gap = diffKstDays(lastYmd, todayYmd);
  if (!Number.isFinite(gap) || gap < 2) return null; // 어제 체크인(gap=1)까지는 정상 흐름

  const missed = gap - 1;
  const freezesLeft =
    streak?.freezeMonth === kstMonth(todayYmd)
      ? Math.max(0, streak?.freezesLeft ?? FREEZES_PER_MONTH)
      : FREEZES_PER_MONTH;

  // ── 변형 1: 프리즈로 이어지는 공백 — 가벼운 안내 칩 ──
  if (missed <= freezesLeft) {
    return (
      <div className="mx-4 mt-4 flex items-center gap-2.5 rounded-[12px] px-4 py-3"
        style={{ background: "rgba(0,122,255,0.08)" }}>
        <span aria-hidden className="text-[15px]">🧊</span>
        <p className="flex-1 text-[13px] leading-[18px] tracking-[-0.08px] text-[var(--label)]">
          {t("recommit.freezeChip", { count: missed })}
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
  if (dismissed) return null;
  const best = Math.max(streak?.bestCount ?? count, count);

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
          onClick={() => {
            writeDismissed(todayYmd);
            setDismissed(true);
          }}
          className="w-7 h-7 -mr-1 flex items-center justify-center text-[var(--label-3)] hover:opacity-70 transition-opacity"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <p className="mt-1 text-[15px] leading-[21px] tracking-[-0.24px] text-[var(--label-2)]">
        {t("recommit.body", { prev: count, best })}
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
