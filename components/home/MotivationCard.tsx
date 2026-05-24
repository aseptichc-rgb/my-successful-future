"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DailyMotivation } from "@/types";
import AffirmationCheckin from "@/components/affirmations/AffirmationCheckin";
import { useLanguage } from "@/lib/i18n";

/* ─────────────────────────────────────────────────────────────────
 * Anima MotivationCard — v2 redesign
 * ─────────────────────────────────────────────────────────────────
 * 변경 핵심:
 *  · 보라 그라데이션 배경 제거 — cream 평면 위 hairline 으로만 분리.
 *  · 인용문: 700 sans → 300 italic Fraunces. 외침이 아니라 들림.
 *  · 미션 박스-안-박스-안-박스 → hairline 한 줄.
 *  · 액션 바(잠금화면 받기 / 다시 받기) → 텍스트 링크로 격하.
 *  · tone(dark/light) 분기 전체 제거 — 항상 indigo on cream.
 *
 * 잠금화면 PNG 합성(downloadAsWallpaper)은 그대로 유지 — 카메라 롤에서
 * 다른 사진과 섞이려면 강한 색 그라데이션이 필요하기 때문.
 * ────────────────────────────────────────────────────────────────── */

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
  ymd: string;
}

const RESPONSE_MAX = 60;

const WALLPAPER_W = 1170;
const WALLPAPER_H = 2532;
const QUOTE_LEN_THRESHOLD_LARGE = 80;

/**
 * 카드 상단 날짜를 사용자 locale 에 맞게 포맷 (잠금화면에서는 여전히 사용).
 */
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
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
}

/** Canvas 워드 랩 — 한글/영문 모두 처리. */
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

/**
 * 잠금화면용 PNG (1170×2532) 합성 — 그라데이션은 여기서만 사용.
 * v1 그대로 유지. 카드 UI 와 별개의 export 경로.
 */
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

  // 배경 그라데이션
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

  const FONT_STACK = `"Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif`;
  const FONT_SERIF = `"Fraunces", "Times New Roman", serif`;

  // 날짜 (top)
  ctx.fillStyle = subColor;
  ctx.font = `500 42px ${FONT_STACK}`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText(formatHeader(motivation.ymd, locale), 110, 280);

  // 인용문 — serif italic light 로 잠금화면에서도 톤 통일.
  ctx.fillStyle = textColor;
  const isLong = motivation.quote.length > QUOTE_LEN_THRESHOLD_LARGE;
  const quoteSize = isLong ? 88 : 110;
  ctx.font = `300 italic ${quoteSize}px ${FONT_SERIF}`;
  const quoteLines = wrapLines(ctx, motivation.quote, WALLPAPER_W - 220);
  let y = 460;
  const lineHeight = quoteSize * 1.32;
  for (const line of quoteLines) {
    ctx.fillText(line, 110, y);
    y += lineHeight;
  }

  // 원어 (있을 때만)
  if (motivation.originalText) {
    ctx.fillStyle = subColor;
    const origSize = 38;
    ctx.font = `400 italic ${origSize}px ${FONT_SERIF}`;
    const origLines = wrapLines(ctx, motivation.originalText, WALLPAPER_W - 220);
    y += 20;
    const origLh = origSize * 1.4;
    for (const line of origLines) {
      ctx.fillText(line, 110, y);
      y += origLh;
    }
  }

  // 저자 + 출처
  ctx.fillStyle = subColor;
  ctx.font = `500 42px ${FONT_STACK}`;
  ctx.fillText(`— ${motivation.author}`, 110, y + 30);
  if (motivation.source) {
    ctx.font = `400 32px ${FONT_STACK}`;
    ctx.fillText(`《${motivation.source}》`, 110, y + 30 + 56);
  }

  // 목표 블록 (하단)
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

  // 워터마크
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

/* ───── component ───── */

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
  ymd: _ymd,
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

  /* 항상 indigo on cream — tone 분기 제거 */

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

  /* ───── render — cream 평면, hairline 만으로 분리 ───── */

  // emphasis 단어 강조: motivation.quoteEmphasis 가 있고 quote 의 부분 문자열이면 Soul italic 으로 감싼다.
  // 백엔드가 아직 emphasis 필드를 안 채울 수 있어 optional. 폴백은 plain quote.
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
        <em className="not-italic">
          <span className="font-light italic text-soul">{emphasis}</span>
        </em>
        {after}
      </>
    );
  }, [motivation]);

  return (
    <section
      className="relative flex flex-col gap-7 py-2"
      aria-label={t("motivation.headerTodayLabel")}
    >
      {/* ── 인용 hero ── */}
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-indigo/45">
          {t("motivation.headerTodayLabel")}
        </div>

        {loading && !motivation ? (
          <div className="mt-5 space-y-3">
            <div className="h-7 w-4/5 animate-pulse rounded-full bg-indigo/8" />
            <div className="h-7 w-3/5 animate-pulse rounded-full bg-indigo/8" />
            <div className="h-7 w-2/5 animate-pulse rounded-full bg-indigo/8" />
          </div>
        ) : motivation ? (
          <>
            <p className="mt-4 whitespace-pre-wrap font-display text-[26px] font-light italic leading-[1.3] tracking-[-0.015em] text-indigo sm:text-[30px]">
              {renderedQuote}
            </p>
            {motivation.originalText && (
              <p
                className="mt-3 whitespace-pre-wrap font-display text-[14px] font-light italic leading-[1.5] tracking-[-0.005em] text-indigo/55"
                lang={motivation.originalLang}
              >
                {motivation.originalText}
              </p>
            )}
            <div className="mt-5 font-mono text-[10px] uppercase tracking-[0.14em] text-indigo/45">
              — <b className="font-medium text-indigo/85">{motivation.author}</b>
              {motivation.source && (
                <span className="ml-2 text-indigo/40">《{motivation.source}》</span>
              )}
            </div>
          </>
        ) : (
          <p className="mt-4 font-display text-[16px] font-light italic leading-[1.5] text-indigo/55">
            {errorMessage || t("motivation.preparingCard")}
          </p>
        )}
      </div>

      {/* ── 다짐 따라쓰기 — 다짐이 1개 이상이면 ── */}
      {motivation && affirmations && affirmations.length > 0 && onCheckinAffirmations && (
        <>
          <div className="h-px bg-hairline" />
          <AffirmationCheckin
            affirmations={affirmations}
            tone="light"
            streakCount={affirmationStreakCount}
            alreadyCheckedIn={alreadyCheckedInToday}
            onSubmit={onCheckinAffirmations}
          />
        </>
      )}

      {/* ── 미션 — affirmations 미설정 사용자만 ── */}
      {motivation &&
        (!affirmations || affirmations.length === 0) &&
        motivation.mission &&
        onSubmitResponse && (
          <>
            <div className="h-px bg-hairline" />
            <div>
              <div className="flex items-baseline gap-3">
                <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-indigo/45">
                  {t("motivation.missionLabel")}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-soul">
                  #{motivation.mission.identityTag}
                </span>
              </div>
              <p className="mt-3 font-display text-[17px] font-light italic leading-[1.5] tracking-[-0.005em] text-indigo">
                {motivation.mission.prompt}
              </p>

              {motivation.response && !responseEditing ? (
                <div className="mt-4 border-l-[1.5px] border-soul/60 pl-4">
                  <p className="whitespace-pre-wrap text-[14px] leading-[1.55] tracking-[-0.005em] text-indigo">
                    {motivation.response.text}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setResponseDraft(motivation.response?.text || "");
                      setResponseEditing(true);
                    }}
                    className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-indigo/55 transition-colors hover:text-soul"
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
                    className="w-full resize-none border-b border-hairline bg-transparent pb-2 text-[14px] leading-[1.55] tracking-[-0.005em] text-indigo placeholder:font-display placeholder:font-light placeholder:italic placeholder:text-indigo/35 focus:border-indigo focus:outline-none"
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <span className="font-mono text-[10px] tabular-nums text-indigo/45">
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
                          className="font-mono text-[10px] uppercase tracking-[0.14em] text-indigo/55 transition-colors hover:text-indigo disabled:opacity-40"
                        >
                          {t("common.cancel")}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleSubmitResponse}
                        disabled={responseSaving || !responseDraft.trim()}
                        className="font-mono text-[10px] uppercase tracking-[0.14em] text-soul transition-colors hover:text-soul-press disabled:opacity-30"
                      >
                        {responseSaving ? t("motivation.submitting") : t("motivation.submit")}
                      </button>
                    </div>
                  </div>
                  {responseError && (
                    <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.1em] text-soul">
                      {responseError}
                    </p>
                  )}
                </div>
              )}

              {submitFlash && (
                <p
                  role="status"
                  className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-soul"
                >
                  {submitFlash}
                </p>
              )}
            </div>
          </>
        )}

      {/* ── 메타 액션 — 텍스트 링크 단계 ── */}
      <div className="flex items-center justify-between border-t border-hairline pt-4">
        <button
          type="button"
          onClick={handleDownload}
          disabled={!motivation || downloading}
          className="font-mono text-[10px] uppercase tracking-[0.14em] text-indigo/60 transition-colors hover:text-soul disabled:opacity-40"
        >
          {downloading
            ? t("motivation.wallpaper.downloading")
            : t("motivation.wallpaper.download")}
        </button>
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={loading || regenerating}
          className="font-mono text-[10px] uppercase tracking-[0.14em] text-indigo/55 transition-colors hover:text-soul disabled:opacity-40"
          title={t("motivation.regenerate")}
        >
          {regenerating ? t("motivation.regenerating") : t("motivation.regenerate")}
        </button>
      </div>

      {downloadError && (
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-soul">
          {downloadError}
        </p>
      )}
    </section>
  );
}
