"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DailyMotivation } from "@/types";
import AffirmationCheckin from "@/components/affirmations/AffirmationCheckin";
import { useLanguage } from "@/lib/i18n";

/* ─────────────────────────────────────────────────────────────────
 * MotivationCard — Apple iOS native redesign
 *  · Warm gradient hero card (Apple Music / Books inspired)
 *  · iOS Headline + Subhead type
 *  · 잠금화면 PNG export 유지 (Canvas 그라데이션 그대로)
 *  · 미션 입력 — bordered separator + inline buttons
 * ───────────────────────────────────────────────────────────────── */

interface MotivationCardProps {
  motivation: DailyMotivation | null;
  loading: boolean;
  errorMessage?: string | null;
  onRegenerate: () => void | Promise<void>;
  onSubmitResponse?: (text: string) => Promise<{ isFirst: boolean; identityTag: string }>;
  affirmations?: string[];
  affirmationStreakCount?: number;
  alreadyCheckedInToday?: boolean;
  onCheckinAffirmations?: (
    texts: string[],
  ) => Promise<{ matched: boolean; streakCount: number; mismatchedIndices?: number[] }>;
}

const RESPONSE_MAX = 60;
const WALLPAPER_W = 1170;
const WALLPAPER_H = 2532;
const QUOTE_LEN_THRESHOLD_LARGE = 80;

function formatHeader(ymd: string, locale: string): string {
  const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return ymd;
  try {
    const date = new Date(Date.UTC(y, m - 1, d));
    return new Intl.DateTimeFormat(
      locale === "ko" ? "ko-KR" : locale === "es" ? "es-ES" : locale === "zh" ? "zh-CN" : "en-US",
      { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" },
    ).format(date);
  } catch {
    return ymd;
  }
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/(\s+)/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line + w;
    if (ctx.measureText(next).width > maxWidth && line.trim().length > 0) {
      lines.push(line.trimEnd());
      line = w.trimStart();
    } else {
      line = next;
    }
  }
  if (line.trim().length > 0) lines.push(line.trimEnd());
  const final: string[] = [];
  for (const l of lines) {
    if (ctx.measureText(l).width <= maxWidth) {
      final.push(l);
      continue;
    }
    let buf = "";
    for (const ch of l) {
      if (ctx.measureText(buf + ch).width > maxWidth && buf.length > 0) {
        final.push(buf);
        buf = ch;
      } else {
        buf += ch;
      }
    }
    if (buf.length > 0) final.push(buf);
  }
  return final;
}

async function downloadAsWallpaper(
  motivation: DailyMotivation,
  locale: string,
  labels: { goalsLabel: string; watermark: string },
): Promise<void> {
  if (typeof document === "undefined") return;
  const canvas = document.createElement("canvas");
  canvas.width = WALLPAPER_W;
  canvas.height = WALLPAPER_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D 컨텍스트를 가져오지 못했습니다.");

  const angleRad = ((motivation.gradient.angle - 90) * Math.PI) / 180;
  const cx = WALLPAPER_W / 2;
  const cy = WALLPAPER_H / 2;
  const r = Math.hypot(WALLPAPER_W, WALLPAPER_H) / 2;
  const x0 = cx - Math.cos(angleRad) * r;
  const y0 = cy - Math.sin(angleRad) * r;
  const x1 = cx + Math.cos(angleRad) * r;
  const y1 = cy + Math.sin(angleRad) * r;
  const grad = ctx.createLinearGradient(x0, y0, x1, y1);
  grad.addColorStop(0, motivation.gradient.from);
  grad.addColorStop(1, motivation.gradient.to);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WALLPAPER_W, WALLPAPER_H);

  const tone = motivation.gradient.tone;
  const textColor = tone === "dark" ? "rgba(255,255,255,0.96)" : "rgba(20,20,40,0.92)";
  const subColor = tone === "dark" ? "rgba(255,255,255,0.66)" : "rgba(20,20,40,0.55)";
  const goalColor = tone === "dark" ? "rgba(255,255,255,0.85)" : "rgba(20,20,40,0.78)";

  const FONT_STACK = `-apple-system, "SF Pro Text", "Pretendard", "Apple SD Gothic Neo", system-ui, sans-serif`;

  ctx.fillStyle = subColor;
  ctx.font = `500 42px ${FONT_STACK}`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText(formatHeader(motivation.ymd, locale), 110, 280);

  ctx.fillStyle = textColor;
  const isLong = motivation.quote.length > QUOTE_LEN_THRESHOLD_LARGE;
  const quoteSize = isLong ? 88 : 110;
  ctx.font = `700 ${quoteSize}px ${FONT_STACK}`;
  const quoteLines = wrapLines(ctx, motivation.quote, WALLPAPER_W - 220);
  let y = 460;
  const lineHeight = quoteSize * 1.28;
  for (const line of quoteLines) {
    ctx.fillText(line, 110, y);
    y += lineHeight;
  }

  if (motivation.originalText) {
    ctx.fillStyle = subColor;
    const origSize = 38;
    ctx.font = `400 italic ${origSize}px ${FONT_STACK}`;
    const origLines = wrapLines(ctx, motivation.originalText, WALLPAPER_W - 220);
    y += 20;
    const origLh = origSize * 1.4;
    for (const line of origLines) {
      ctx.fillText(line, 110, y);
      y += origLh;
    }
  }

  ctx.fillStyle = subColor;
  ctx.font = `500 42px ${FONT_STACK}`;
  ctx.fillText(`— ${motivation.author}`, 110, y + 30);
  if (motivation.source) {
    ctx.font = `400 32px ${FONT_STACK}`;
    ctx.fillText(`《${motivation.source}》`, 110, y + 30 + 56);
  }

  if (motivation.goalsSnapshot.length > 0) {
    ctx.fillStyle = subColor;
    ctx.font = `600 36px ${FONT_STACK}`;
    const baseY = WALLPAPER_H - 540 - motivation.goalsSnapshot.length * 88;
    ctx.fillText(labels.goalsLabel, 110, baseY);

    ctx.fillStyle = goalColor;
    ctx.font = `600 56px ${FONT_STACK}`;
    motivation.goalsSnapshot.forEach((g, i) => {
      const lineY = baseY + 70 + i * 88;
      ctx.fillText(`${i + 1}. ${g}`, 110, lineY);
    });
  }

  ctx.fillStyle = subColor;
  ctx.font = `500 32px ${FONT_STACK}`;
  ctx.textAlign = "right";
  ctx.fillText(labels.watermark, WALLPAPER_W - 110, WALLPAPER_H - 130);

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png"),
  );
  if (!blob) throw new Error("이미지 변환에 실패했습니다.");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `anima-${motivation.ymd}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function MotivationCard({
  motivation,
  loading,
  errorMessage,
  onRegenerate,
  onSubmitResponse,
  affirmations,
  affirmationStreakCount = 0,
  alreadyCheckedInToday = false,
  onCheckinAffirmations,
}: MotivationCardProps) {
  const { t, locale } = useLanguage();
  const [downloading, setDownloading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [responseDraft, setResponseDraft] = useState("");
  const [responseEditing, setResponseEditing] = useState(false);
  const [responseSaving, setResponseSaving] = useState(false);
  const [responseError, setResponseError] = useState<string | null>(null);
  const [submitFlash, setSubmitFlash] = useState<string | null>(null);

  useEffect(() => {
    setResponseDraft(motivation?.response?.text || "");
    setResponseEditing(false);
    setResponseError(null);
  }, [motivation?.ymd, motivation?.quote, motivation?.response?.text]);

  useEffect(() => {
    if (!submitFlash) return;
    const t = setTimeout(() => setSubmitFlash(null), 2400);
    return () => clearTimeout(t);
  }, [submitFlash]);

  const handleDownload = useCallback(async () => {
    if (!motivation || downloading) return;
    setDownloadError(null);
    setDownloading(true);
    try {
      await downloadAsWallpaper(motivation, locale, {
        goalsLabel: t("motivation.wallpaper.goalsLabel"),
        watermark: t("motivation.wallpaper.watermark"),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("motivation.wallpaper.downloadFailed");
      setDownloadError(msg);
    } finally {
      setDownloading(false);
    }
  }, [motivation, downloading, locale, t]);

  const handleRegenerate = useCallback(async () => {
    if (regenerating || loading) return;
    setRegenerating(true);
    try {
      await onRegenerate();
    } finally {
      setRegenerating(false);
    }
  }, [onRegenerate, regenerating, loading]);

  const handleSubmitResponse = useCallback(async () => {
    if (!onSubmitResponse || !motivation?.mission) return;
    const text = responseDraft.trim().slice(0, RESPONSE_MAX);
    if (!text) {
      setResponseError(t("motivation.responseEmpty"));
      return;
    }
    setResponseSaving(true);
    setResponseError(null);
    try {
      const { isFirst, identityTag } = await onSubmitResponse(text);
      setResponseEditing(false);
      setSubmitFlash(
        isFirst
          ? t("motivation.responseToast", { tag: identityTag })
          : t("motivation.responseEdited"),
      );
    } catch (err) {
      setResponseError(err instanceof Error ? err.message : String(err));
    } finally {
      setResponseSaving(false);
    }
  }, [onSubmitResponse, motivation, responseDraft, t]);

  const renderedQuote = useMemo(() => {
    if (!motivation) return null;
    const emphasis = (motivation as DailyMotivation & { quoteEmphasis?: string }).quoteEmphasis;
    if (!emphasis || !motivation.quote.includes(emphasis)) {
      return <>{motivation.quote}</>;
    }
    const [before, ...rest] = motivation.quote.split(emphasis);
    const after = rest.join(emphasis);
    return (
      <>
        {before}
        <span className="text-[#D85A30] font-bold">{emphasis}</span>
        {after}
      </>
    );
  }, [motivation]);

  return (
    <section className="flex flex-col gap-4" aria-label={t("motivation.headerTodayLabel")}>
      {/* ── 인용 hero card — cream tonal (Anima 차분한 톤) ── */}
      <div
        className="relative overflow-hidden rounded-[18px] border border-[var(--sep)]"
        style={{
          background: "linear-gradient(135deg, var(--cream-soft) 0%, var(--mist-soft) 100%)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        {/* 장식용 따옴표 — soul 톤 12% 알파로 미세하게 */}
        <div
          aria-hidden
          className="absolute top-[-12px] right-[14px] pointer-events-none"
          style={{
            fontSize: 120,
            fontWeight: 700,
            color: "rgba(216,90,48,0.12)",
            lineHeight: 1,
            fontFamily: "var(--font-display)",
          }}
        >
          “
        </div>
        <div className="relative px-5 pt-5 pb-5">
          <div className="text-[11px] font-semibold tracking-[1.6px] uppercase text-[#D85A30] mb-2.5">
            {t("motivation.headerTodayLabel")}
          </div>

          {loading && !motivation ? (
            <div className="space-y-3">
              <div className="h-7 w-4/5 animate-pulse rounded-full bg-black/10" />
              <div className="h-7 w-3/5 animate-pulse rounded-full bg-black/10" />
              <div className="h-7 w-2/5 animate-pulse rounded-full bg-black/10" />
            </div>
          ) : motivation ? (
            <>
              <p className="whitespace-pre-wrap text-[23px] leading-[30px] font-semibold tracking-[-0.4px] text-[var(--label)]">
                {renderedQuote}
              </p>
              {motivation.originalText && (
                <p
                  className="mt-3 whitespace-pre-wrap text-[14px] italic leading-[20px] tracking-[-0.08px] text-[var(--label-2)]"
                  lang={motivation.originalLang}
                >
                  {motivation.originalText}
                </p>
              )}
              <div className="mt-4 flex items-center justify-between">
                <div className="text-[15px] tracking-[-0.24px] text-[var(--label-2)]">
                  — {motivation.author}
                  {motivation.source && (
                    <span className="ml-2 text-[13px] text-[var(--label-3)]">《{motivation.source}》</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={!motivation || downloading}
                    className="text-[15px] font-semibold text-[#D85A30] disabled:opacity-40"
                  >
                    {downloading
                      ? t("motivation.wallpaper.downloading")
                      : t("motivation.wallpaper.download")}
                  </button>
                  <button
                    type="button"
                    onClick={handleRegenerate}
                    disabled={loading || regenerating}
                    className="text-[15px] text-[var(--label-2)] disabled:opacity-40"
                    title={t("motivation.regenerate")}
                  >
                    {regenerating ? t("motivation.regenerating") : "↻"}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className="text-[16px] leading-[22px] text-[var(--label-2)]">
              {errorMessage || t("motivation.preparingCard")}
            </p>
          )}
        </div>
      </div>

      {/* ── 다짐 따라쓰기 — Affirmation card ── */}
      {motivation && affirmations && affirmations.length > 0 && onCheckinAffirmations && (
        <AffirmationCheckin
          affirmations={affirmations}
          tone="light"
          streakCount={affirmationStreakCount}
          alreadyCheckedIn={alreadyCheckedInToday}
          onSubmit={onCheckinAffirmations}
        />
      )}

      {/* ── 미션 — affirmations 미설정 사용자만 ── */}
      {motivation &&
        (!affirmations || affirmations.length === 0) &&
        motivation.mission &&
        onSubmitResponse && (
          <div className="bg-[var(--bg-grouped-2)] rounded-[12px] p-5">
            <div className="flex items-center gap-3">
              <span className="text-[13px] uppercase tracking-[-0.08px] text-[var(--label-2)] font-medium">
                {t("motivation.missionLabel")}
              </span>
              <span className="text-[11px] font-bold uppercase tracking-[1px] text-[#1E1B4B]">
                #{motivation.mission.identityTag}
              </span>
            </div>
            <p className="mt-2 text-[17px] leading-[24px] font-semibold tracking-[-0.43px] text-[var(--label)]">
              {motivation.mission.prompt}
            </p>

            {motivation.response && !responseEditing ? (
              <div
                className="mt-3 pl-4 border-l-[3px] rounded-l-[2px]"
                style={{ borderColor: "#D85A30" }}
              >
                <p className="whitespace-pre-wrap text-[15px] leading-[20px] tracking-[-0.24px] text-[var(--label)]">
                  {motivation.response.text}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setResponseDraft(motivation.response?.text || "");
                    setResponseEditing(true);
                  }}
                  className="mt-2 text-[13px] font-medium text-[var(--soul)]"
                >
                  {t("motivation.editResponse")}
                </button>
              </div>
            ) : (
              <div className="mt-3">
                <textarea
                  value={responseDraft}
                  onChange={(e) => setResponseDraft(e.target.value.slice(0, RESPONSE_MAX))}
                  rows={2}
                  maxLength={RESPONSE_MAX}
                  placeholder={t("motivation.responsePlaceholder")}
                  className="w-full resize-none rounded-[10px] border border-[var(--sep)] bg-[var(--bg-grouped)] px-3 py-2 text-[15px] leading-[20px] tracking-[-0.24px] text-[var(--label)] placeholder:text-[var(--label-3)] focus:outline-none focus:border-[var(--soul)]"
                />
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[12px] text-[var(--label-3)] tabular-nums">
                    {responseDraft.length}/{RESPONSE_MAX}
                  </span>
                  <div className="flex gap-4">
                    {motivation.response && (
                      <button
                        type="button"
                        onClick={() => {
                          setResponseEditing(false);
                          setResponseDraft(motivation.response?.text || "");
                          setResponseError(null);
                        }}
                        disabled={responseSaving}
                        className="text-[15px] text-[var(--label-2)] disabled:opacity-40"
                      >
                        {t("common.cancel")}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSubmitResponse}
                      disabled={responseSaving || !responseDraft.trim()}
                      className="text-[15px] font-semibold text-[var(--soul)] disabled:opacity-30"
                    >
                      {responseSaving ? t("motivation.submitting") : t("motivation.submit")}
                    </button>
                  </div>
                </div>
                {responseError && (
                  <p className="mt-2 text-[13px] text-[#FF3B30]">{responseError}</p>
                )}
              </div>
            )}

            {submitFlash && (
              <p role="status" className="mt-3 text-[13px] font-semibold text-[#D85A30]">
                {submitFlash}
              </p>
            )}
          </div>
        )}

      {downloadError && <p className="text-[13px] text-[#FF3B30]">{downloadError}</p>}
    </section>
  );
}
