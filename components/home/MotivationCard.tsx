"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DailyMotivation } from "@/types";
import AffirmationCheckin from "@/components/affirmations/AffirmationCheckin";
import { useLanguage } from "@/lib/i18n";

interface MotivationCardProps {
  motivation: DailyMotivation | null;
  loading: boolean;
  errorMessage?: string | null;
  /** 사용자가 "↻ 다시 받기" 를 눌렀을 때 호출. POST { force: true } 로 재생성. */
  onRegenerate: () => void | Promise<void>;
  /**
   * 미션 응답 저장 핸들러. 정의되어 있고 affirmations 가 비었을 때만 레거시 미션 영역 표시.
   */
  onSubmitResponse?: (text: string) => Promise<{ isFirst: boolean; identityTag: string }>;
  /**
   * "성공한 나의 모습" 다짐 배열. 1개 이상이면 미션 영역이 다짐 따라쓰기 UI 로 대체된다.
   */
  affirmations?: string[];
  /** 다짐 따라쓰기 연속일. */
  affirmationStreakCount?: number;
  /** 오늘 이미 체크인했는지 — true 면 입력창 잠금. */
  alreadyCheckedInToday?: boolean;
  /** 다짐 N개를 서버로 제출. matched=true 면 스트릭이 갱신된다. */
  onCheckinAffirmations?: (
    texts: string[],
  ) => Promise<{ matched: boolean; streakCount: number; mismatchedIndices?: number[] }>;
  /** 화면 헤더 표기용 KST YYYY-MM-DD (모르면 비워둠) */
  ymd: string;
}

const RESPONSE_MAX = 60;

const WALLPAPER_W = 1170;
const WALLPAPER_H = 2532; // iPhone-ish portrait — 폭은 가로 1170px 기준
const QUOTE_LEN_THRESHOLD_LARGE = 80;

/**
 * 카드 상단 날짜를 사용자 locale 에 맞게 포맷.
 * - ko: "2026년 5월 7일"  · en: "May 7, 2026"  · es: "7 may 2026"  · zh: "2026年5月7日"
 * - Intl.DateTimeFormat 가 brand-safe 한 표기를 골라준다.
 */
function formatHeader(ymd: string, locale: string): string {
  const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return ymd;
  try {
    const date = new Date(Date.UTC(y, m - 1, d));
    return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : locale === "es" ? "es-ES" : locale === "zh" ? "zh-CN" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    }).format(date);
  } catch {
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
}

/** Canvas 워드 랩 — 한글/영문 모두 처리. 너비 초과 시 어절 단위로 줄바꿈. */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/(\s+)/); // 공백을 보존
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
  // 그래도 한 줄이 너무 길면 글자 단위로 강제 줄바꿈
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
 * 카드 내용을 잠금화면용 PNG (1170×2532) 로 합성해 다운로드한다.
 * 외부 이미지 의존이 없도록 그라데이션 + 텍스트만 그린다.
 */
/**
 * 잠금화면 PNG 합성 시 카드와 동일한 locale 로 날짜/라벨을 그려야 톤이 일관된다.
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

  // ── 배경 그라데이션 ──
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

  // 톤에 따른 색상
  const tone = motivation.gradient.tone;
  const textColor = tone === "dark" ? "rgba(255,255,255,0.96)" : "rgba(20,20,40,0.92)";
  const subColor = tone === "dark" ? "rgba(255,255,255,0.66)" : "rgba(20,20,40,0.55)";
  const goalColor = tone === "dark" ? "rgba(255,255,255,0.85)" : "rgba(20,20,40,0.78)";

  // 폰트 패밀리 — 시스템 한글 폴백 우선
  const FONT_STACK = `"Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif`;

  // ── 상단 라벨: 날짜 ──
  ctx.fillStyle = subColor;
  ctx.font = `500 42px ${FONT_STACK}`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText(formatHeader(motivation.ymd, locale), 110, 280);

  // ── 큰 인용문 ──
  ctx.fillStyle = textColor;
  const isLong = motivation.quote.length > QUOTE_LEN_THRESHOLD_LARGE;
  const quoteSize = isLong ? 88 : 110;
  ctx.font = `700 ${quoteSize}px ${FONT_STACK}`;
  const quoteLines = wrapLines(ctx, motivation.quote, WALLPAPER_W - 220);
  let y = 460;
  const lineHeight = quoteSize * 1.32;
  for (const line of quoteLines) {
    ctx.fillText(line, 110, y);
    y += lineHeight;
  }

  // ── 원어 원문 (외국인 명언일 때만) ──
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

  // ── 인용 출처 ──
  ctx.fillStyle = subColor;
  ctx.font = `500 42px ${FONT_STACK}`;
  ctx.fillText(`— ${motivation.author}`, 110, y + 30);
  if (motivation.source) {
    ctx.font = `400 32px ${FONT_STACK}`;
    ctx.fillText(`《${motivation.source}》`, 110, y + 30 + 56);
  }

  // ── 목표 블록 (하단) ──
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

  // ── 우하단 워터마크 ──
  ctx.fillStyle = subColor;
  ctx.font = `500 32px ${FONT_STACK}`;
  ctx.textAlign = "right";
  ctx.fillText(labels.watermark, WALLPAPER_W - 110, WALLPAPER_H - 130);

  // ── 다운로드 ──
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
  ymd,
}: MotivationCardProps) {
  const { t, locale } = useLanguage();
  const [downloading, setDownloading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // 미션 입력 상태
  const [responseDraft, setResponseDraft] = useState("");
  const [responseEditing, setResponseEditing] = useState(false);
  const [responseSaving, setResponseSaving] = useState(false);
  const [responseError, setResponseError] = useState<string | null>(null);
  const [submitFlash, setSubmitFlash] = useState<string | null>(null);

  // 카드가 바뀔 때마다(다시 받기·날짜 변경) 입력 상태를 그 카드의 응답으로 초기화한다.
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

  const cardStyle = useMemo(() => {
    if (!motivation) {
      return {
        background: "linear-gradient(135deg, #1E1B4B 0%, #7C3AED 100%)",
      } as React.CSSProperties;
    }
    const { from, to, angle } = motivation.gradient;
    return {
      background: `linear-gradient(${angle}deg, ${from} 0%, ${to} 100%)`,
    } as React.CSSProperties;
  }, [motivation]);

  const tone = motivation?.gradient.tone ?? "dark";
  const headerColor = tone === "dark" ? "text-white/70" : "text-black/55";
  const quoteColor = tone === "dark" ? "text-white" : "text-[#1E1B4B]";
  const authorColor = tone === "dark" ? "text-white/75" : "text-black/60";
  const goalLabelColor = tone === "dark" ? "text-white/65" : "text-black/55";
  const goalColor = tone === "dark" ? "text-white/95" : "text-[#1E1B4B]";

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

  return (
    <section
      className="relative overflow-hidden rounded-[22px] shadow-apple-lg"
      style={cardStyle}
      aria-label={t("motivation.headerTodayLabel")}
    >
      {/* 카드 본문 (16:20-ish 비율). 모바일에서도 본문이 충분히 보이도록 min-height 보장. */}
      <div className="relative flex min-h-[420px] flex-col px-6 py-7 sm:min-h-[480px] sm:px-8 sm:py-9">
        <div className={`text-[12px] font-medium tracking-[-0.01em] ${headerColor}`}>
          {formatHeader(ymd, locale)} · {t("motivation.headerTodayLabel")}
        </div>

        {/* 인용 영역 */}
        <div className="mt-4 flex-1">
          {loading && !motivation ? (
            <div className="space-y-3">
              <div className={`h-7 w-4/5 animate-pulse rounded-full ${tone === "dark" ? "bg-white/15" : "bg-black/10"}`} />
              <div className={`h-7 w-3/5 animate-pulse rounded-full ${tone === "dark" ? "bg-white/15" : "bg-black/10"}`} />
              <div className={`h-7 w-2/5 animate-pulse rounded-full ${tone === "dark" ? "bg-white/15" : "bg-black/10"}`} />
            </div>
          ) : motivation ? (
            <>
              <p
                className={`whitespace-pre-wrap text-[24px] font-bold leading-[1.4] tracking-[-0.025em] sm:text-[28px] ${quoteColor}`}
              >
                {motivation.quote}
              </p>
              {motivation.originalText && (
                <p
                  className={`mt-3 whitespace-pre-wrap text-[14px] italic leading-[1.5] tracking-[-0.01em] ${authorColor}`}
                  lang={motivation.originalLang}
                >
                  {motivation.originalText}
                </p>
              )}
            </>
          ) : (
            <p className={`text-[16px] leading-[1.5] ${authorColor}`}>
              {errorMessage || t("motivation.preparingCard")}
            </p>
          )}
          {motivation && (
            <div className={`mt-4 ${authorColor}`}>
              <p className="text-[14px] font-medium tracking-[-0.01em]">
                — {motivation.author}
              </p>
              {motivation.source && (
                <p className="mt-0.5 text-[12px] tracking-[-0.01em] opacity-85">
                  《{motivation.source}》
                </p>
              )}
            </div>
          )}
        </div>

        {/* 미션 영역 — 다짐이 1개 이상 설정돼 있으면 따라쓰기 UI, 아니면 레거시 Gemini 미션. */}
        {motivation && affirmations && affirmations.length > 0 && onCheckinAffirmations && (
          <AffirmationCheckin
            affirmations={affirmations}
            tone={tone}
            streakCount={affirmationStreakCount}
            alreadyCheckedIn={alreadyCheckedInToday}
            onSubmit={onCheckinAffirmations}
          />
        )}

        {motivation &&
          (!affirmations || affirmations.length === 0) &&
          motivation.mission &&
          onSubmitResponse && (
          <div
            className={`mt-6 rounded-[14px] px-4 py-3.5 ${
              tone === "dark" ? "bg-white/10" : "bg-black/[0.04]"
            }`}
          >
            <div className="flex items-center gap-2">
              <p className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${goalLabelColor}`}>
                {t("motivation.missionLabel")}
              </p>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-[-0.005em] ${
                  tone === "dark" ? "bg-white/15 text-white/85" : "bg-[#1E1B4B]/8 text-[#1E1B4B]/80"
                }`}
              >
                {t("motivation.identityPrefix")} {motivation.mission.identityTag}
              </span>
            </div>
            <p
              className={`mt-2 text-[15px] font-semibold leading-[1.45] tracking-[-0.015em] ${quoteColor}`}
            >
              {motivation.mission.prompt}
            </p>

            {motivation.response && !responseEditing ? (
              <div
                className={`mt-3 rounded-[10px] px-3 py-2.5 ${
                  tone === "dark" ? "bg-white/10" : "bg-white/70"
                }`}
              >
                <p
                  className={`whitespace-pre-wrap text-[14px] leading-[1.5] tracking-[-0.01em] ${
                    tone === "dark" ? "text-white" : "text-[#1E1B4B]"
                  }`}
                >
                  {motivation.response.text}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setResponseDraft(motivation.response?.text || "");
                    setResponseEditing(true);
                  }}
                  className={`mt-1.5 text-[11px] font-medium tracking-[-0.005em] underline-offset-2 hover:underline ${
                    tone === "dark" ? "text-white/65" : "text-black/55"
                  }`}
                >
                  {t("motivation.editResponse")}
                </button>
              </div>
            ) : (
              <div className="mt-2.5">
                <textarea
                  value={responseDraft}
                  onChange={(e) =>
                    setResponseDraft(e.target.value.slice(0, RESPONSE_MAX))
                  }
                  rows={2}
                  maxLength={RESPONSE_MAX}
                  placeholder={t("motivation.responsePlaceholder")}
                  className={`w-full resize-none rounded-[10px] border px-3 py-2 text-[14px] leading-[1.45] tracking-[-0.01em] focus:outline-none ${
                    tone === "dark"
                      ? "border-white/20 bg-white/15 text-white placeholder:text-white/40 focus:border-white/55"
                      : "border-black/10 bg-white text-[#1E1B4B] placeholder:text-black/40 focus:border-[#1E1B4B]"
                  }`}
                />
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className={`text-[11px] tabular-nums ${authorColor}`}>
                    {responseDraft.length}/{RESPONSE_MAX}
                  </span>
                  <div className="flex gap-1.5">
                    {motivation.response && (
                      <button
                        type="button"
                        onClick={() => {
                          setResponseEditing(false);
                          setResponseDraft(motivation.response?.text || "");
                          setResponseError(null);
                        }}
                        disabled={responseSaving}
                        className={`rounded-pill px-3 py-1.5 text-[11px] font-medium tracking-[-0.005em] transition-colors disabled:opacity-50 ${
                          tone === "dark" ? "text-white/75 hover:bg-white/10" : "text-black/60 hover:bg-black/[0.04]"
                        }`}
                      >
                        {t("common.cancel")}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSubmitResponse}
                      disabled={responseSaving || !responseDraft.trim()}
                      className={`rounded-pill px-3.5 py-1.5 text-[11px] font-semibold tracking-[-0.005em] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        tone === "dark"
                          ? "bg-white text-[#1E1B4B] hover:bg-white/90"
                          : "bg-[#1E1B4B] text-white hover:bg-[#2A2766]"
                      }`}
                    >
                      {responseSaving ? t("motivation.submitting") : t("motivation.submit")}
                    </button>
                  </div>
                </div>
                {responseError && (
                  <p
                    className={`mt-1.5 text-[11px] tracking-[-0.005em] ${
                      tone === "dark" ? "text-rose-100/95" : "text-rose-700"
                    }`}
                  >
                    {responseError}
                  </p>
                )}
              </div>
            )}

            {submitFlash && (
              <p
                role="status"
                className={`mt-2 text-[12px] font-semibold tracking-[-0.005em] ${
                  tone === "dark" ? "text-white" : "text-[#1E1B4B]"
                }`}
              >
                {submitFlash}
              </p>
            )}
          </div>
        )}
      </div>

      {/* 액션 바 */}
      <div className={`flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 sm:px-5 ${
        tone === "dark" ? "border-white/15 bg-black/15" : "border-black/8 bg-white/40"
      }`}>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleDownload}
            disabled={!motivation || downloading}
            className={`inline-flex items-center gap-1.5 rounded-pill px-3.5 py-2 text-[12px] font-semibold tracking-[-0.01em] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              tone === "dark"
                ? "bg-white text-[#1E1B4B] hover:bg-white/90"
                : "bg-[#1E1B4B] text-white hover:bg-[#2A2766]"
            }`}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
              <path d="M5 21h14" />
            </svg>
            {downloading ? t("motivation.wallpaper.downloading") : t("motivation.wallpaper.download")}
          </button>
        </div>
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={loading || regenerating}
          className={`inline-flex items-center gap-1 rounded-pill px-2.5 py-1.5 text-[11px] font-medium tracking-[-0.01em] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            tone === "dark" ? "text-white/80 hover:bg-white/10" : "text-black/60 hover:bg-black/[0.04]"
          }`}
          title={t("motivation.regenerate")}
        >
          <svg className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 0 1 15.5-6.4L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-15.5 6.4L3 16" />
            <path d="M3 21v-5h5" />
          </svg>
          {regenerating ? t("motivation.regenerating") : t("motivation.regenerate")}
        </button>
      </div>

      {downloadError && (
        <div className="px-4 pb-3 text-[11px] tracking-[-0.01em] text-rose-100/95 sm:px-5">
          {downloadError}
        </div>
      )}
    </section>
  );
}
