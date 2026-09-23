"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { renderShareCard, shareStreakCard } from "@/lib/shareCard";
import { track } from "@/lib/track";
import { APP_URL } from "@/lib/constants/storeLinks";

/* ─────────────────────────────────────────────────────────────────
 * ShareStreakButton — 성장 탭 스트릭 히어로의 "공유" 버튼.
 *
 * 탭 한 번에 카드 이미지를 만들고(lib/shareCard) OS 공유 시트를 연다. 어떤 경로로 열렸는지만
 * streak_shared 이벤트로 남긴다 — 실제로 어디에 올렸는지는 OS 가 알려주지 않는다.
 * 연속 0일이면 그리지 않는다: 자랑할 숫자가 없는 카드는 공유되지 않고, 버튼만 어색하다.
 * ───────────────────────────────────────────────────────────────── */

export default function ShareStreakButton({
  count,
  best,
  declaration,
}: {
  count: number;
  best: number;
  /** 성공 선언 1줄(successAffirmations[0]). 없으면 빈 문자열. */
  declaration: string;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);

  if (count <= 0) return null;

  const handleShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const blob = await renderShareCard({
        count,
        best,
        countLabel: t("share.card.countLabel"),
        bestLabel: t("progress.streak.best", { count: best }),
        declaration,
        brandLine: t("share.card.brand"),
      });
      const text = `${t("share.text", { count })} ${APP_URL}`;
      const method = await shareStreakCard(blob, text);
      if (method) track("streak_shared", { method, count });
    } catch (err) {
      // lib/shareCard 가 삼키지만, 혹시 모를 예외도 화면을 깨지 않게 한다.
      console.warn("[share] 실패:", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={busy}
      aria-label={t("share.cta")}
      className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold disabled:opacity-50"
      style={{ background: "rgba(216,90,48,0.10)", color: "#D85A30" }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3v12" />
        <path d="M7 8l5-5 5 5" />
        <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
      </svg>
      {busy ? t("share.preparing") : t("share.cta")}
    </button>
  );
}
