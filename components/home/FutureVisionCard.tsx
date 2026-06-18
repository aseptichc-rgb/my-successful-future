"use client";

import { useCallback, useEffect, useState } from "react";
import type { FutureVision } from "@/types";
import { useLanguage } from "@/lib/i18n";

/* ─────────────────────────────────────────────────────────────────
 * FutureVisionCard — "꿈이 실현된 하루"를 매일 1인칭 현재형으로 보여주는 카드.
 *  · vision.gradient 를 배경으로 쓰는 몰입형 hero 카드 (동기부여 카드와 톤만 다름)
 *  · title → 시간대별 scenes(moment + 단락) → closing 순서로 렌더
 *  · "또 다른 하루 보기" 재생성 버튼 (하루 5회 쿼터)
 *  · futurePersona 미작성 시 → 작성 유도 CTA
 * ───────────────────────────────────────────────────────────────── */

interface FutureVisionCardProps {
  vision: FutureVision | null;
  loading: boolean;
  errorMessage?: string | null;
  onRegenerate: () => void | Promise<void>;
  /** 사용자가 미래의 나를 적었는지 — false 면 작성 유도 CTA 를 표시. */
  hasFuturePersona: boolean;
  /** CTA 클릭 시 설정으로 이동. */
  onWriteFuturePersona: () => void;
}

function gradientCss(v: FutureVision): string {
  const { from, to, angle } = v.gradient;
  return `linear-gradient(${angle}deg, ${from} 0%, ${to} 100%)`;
}

export default function FutureVisionCard({
  vision,
  loading,
  errorMessage,
  onRegenerate,
  hasFuturePersona,
  onWriteFuturePersona,
}: FutureVisionCardProps) {
  const { t } = useLanguage();
  const [regenerating, setRegenerating] = useState(false);
  // 점진적 공개: 기본은 접힘(호기심 hook 한 줄) → 탭하면 하루 전체가 펼쳐진다.
  const [expanded, setExpanded] = useState(false);

  // 새 하루(ymd 변경)가 오면 다시 접어 호기심 갭을 살린다.
  //   재생성("또 다른 하루")은 ymd 가 그대로라 펼친 상태를 유지한다.
  const ymd = vision?.ymd;
  useEffect(() => {
    setExpanded(false);
  }, [ymd]);

  const handleRegenerate = useCallback(async () => {
    if (regenerating || loading) return;
    setRegenerating(true);
    try {
      await onRegenerate();
      // 재생성한 새 하루는 바로 보여준다(다시 접지 않음).
      setExpanded(true);
    } finally {
      setRegenerating(false);
    }
  }, [onRegenerate, regenerating, loading]);

  // ── futurePersona 미작성 → 작성 유도 CTA (Gemini 호출 없이) ──
  if (!hasFuturePersona) {
    return (
      <section className="flex flex-col gap-4" aria-label={t("futureVision.headerLabel")}>
        <div
          className="relative overflow-hidden rounded-[18px] border border-[var(--sep)] px-5 py-6"
          style={{
            background: "linear-gradient(135deg, var(--cream-soft) 0%, var(--mist-soft) 100%)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <div className="text-[11px] font-semibold tracking-[1.6px] uppercase text-[#D85A30] mb-2.5">
            {t("futureVision.headerLabel")}
          </div>
          <h3 className="text-[19px] font-semibold tracking-[-0.4px] text-[var(--label)]">
            {t("futureVision.empty.title")}
          </h3>
          <p className="mt-2 text-[15px] leading-[22px] text-[var(--label-2)]">
            {t("futureVision.empty.body")}
          </p>
          <button
            type="button"
            onClick={onWriteFuturePersona}
            className="mt-4 inline-flex h-10 items-center rounded-full bg-[#1E1B4B] px-5 text-[15px] font-semibold text-white"
          >
            {t("futureVision.empty.cta")}
          </button>
        </div>
      </section>
    );
  }

  const tone = vision?.gradient.tone ?? "dark";
  const isDark = tone === "dark";
  const labelColor = isDark ? "rgba(255,255,255,0.92)" : "var(--label)";
  const subColor = isDark ? "rgba(255,255,255,0.74)" : "var(--label-2)";
  const momentColor = isDark ? "rgba(255,255,255,0.62)" : "var(--label-3)";
  const accentColor = isDark ? "rgba(255,255,255,0.85)" : "#D85A30";

  return (
    <section className="flex flex-col gap-4" aria-label={t("futureVision.headerLabel")}>
      <div
        className="relative overflow-hidden rounded-[18px]"
        style={{
          background: vision ? gradientCss(vision) : "linear-gradient(135deg, #1E1B4B 0%, #7C3AED 100%)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div className="relative px-5 pt-5 pb-5">
          <div
            className="text-[11px] font-semibold tracking-[1.6px] uppercase mb-3"
            style={{ color: accentColor }}
          >
            {t("futureVision.headerLabel")}
          </div>

          {loading && !vision ? (
            <div className="space-y-3">
              <div className="h-6 w-3/5 animate-pulse rounded-full bg-white/20" />
              <div className="h-4 w-full animate-pulse rounded-full bg-white/15" />
              <div className="h-4 w-4/5 animate-pulse rounded-full bg-white/15" />
              <div className="h-4 w-5/6 animate-pulse rounded-full bg-white/15" />
            </div>
          ) : vision && !expanded ? (
            // ── 접힘: 호기심 한 줄(hook) + 펼쳐보기 affordance ──
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="block w-full text-left"
              aria-expanded={false}
            >
              <p
                className="text-[20px] font-bold leading-[28px] tracking-[-0.4px] whitespace-pre-wrap"
                style={{ color: labelColor }}
              >
                {vision.hook || vision.title}
              </p>
              <span
                className="mt-4 inline-flex items-center gap-1 text-[14px] font-semibold"
                style={{ color: accentColor }}
              >
                {t("futureVision.reveal")} →
              </span>
            </button>
          ) : vision ? (
            <>
              <h3
                className="text-[22px] font-bold leading-[28px] tracking-[-0.5px]"
                style={{ color: labelColor }}
              >
                {vision.title}
              </h3>

              <div className="mt-4 flex flex-col gap-3.5">
                {vision.scenes.map((scene, idx) => (
                  <div key={idx}>
                    {scene.moment && (
                      <div
                        className="text-[11px] font-semibold tracking-[1.2px] uppercase mb-1"
                        style={{ color: momentColor }}
                      >
                        {scene.moment}
                      </div>
                    )}
                    <p
                      className="whitespace-pre-wrap text-[16px] leading-[24px] tracking-[-0.2px]"
                      style={{ color: subColor }}
                    >
                      {scene.text}
                    </p>
                  </div>
                ))}
              </div>

              {vision.closing && (
                <p
                  className="mt-4 whitespace-pre-wrap text-[17px] font-semibold leading-[24px] tracking-[-0.3px]"
                  style={{ color: labelColor }}
                >
                  {vision.closing}
                </p>
              )}

              {/* 비전이 이미 떠 있는 상태에서 재생성이 실패(쿼터 초과/네트워크)하면
                  과거엔 아무 변화도 오류도 없이 조용히 묻혔다 → 사용자에게 보이도록 노출. */}
              {errorMessage && (
                <p
                  className="mt-4 rounded-xl px-3 py-2 text-[13px] leading-[18px] tracking-[-0.1px]"
                  style={{
                    color: isDark ? "rgba(255,255,255,0.96)" : "#9A3412",
                    background: isDark ? "rgba(0,0,0,0.22)" : "rgba(216,90,48,0.10)",
                  }}
                  role="alert"
                >
                  {errorMessage}
                </p>
              )}

              <div className="mt-5 flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={loading || regenerating}
                  className="text-[14px] font-semibold disabled:opacity-40"
                  style={{ color: accentColor }}
                >
                  {regenerating ? t("futureVision.regenerating") : `↻ ${t("futureVision.regenerate")}`}
                </button>
              </div>
            </>
          ) : (
            <p className="text-[16px] leading-[22px]" style={{ color: subColor }}>
              {errorMessage || t("futureVision.loading")}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
