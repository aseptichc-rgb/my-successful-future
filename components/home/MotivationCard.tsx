"use client";

import { useCallback, useMemo, useState } from "react";
import type { DailyMotivation } from "@/types";

interface MotivationCardProps {
  motivation: DailyMotivation | null;
  loading: boolean;
  errorMessage?: string | null;
  /** 사용자가 "↻ 다시 받기" 를 눌렀을 때 호출. POST { force: true } 로 재생성. */
  onRegenerate: () => void | Promise<void>;
  /** "10년 후의 나와 대화" 버튼. 부모가 future-self 세션으로 라우팅. */
  onChatWithFuture: () => void;
  /** 화면 헤더 표기용 KST YYYY-MM-DD (모르면 비워둠) */
  ymd: string;
}

const WALLPAPER_W = 1170;
const WALLPAPER_H = 2532; // iPhone-ish portrait — 폭은 가로 1170px 기준
const QUOTE_LEN_THRESHOLD_LARGE = 80;

function formatHeader(ymd: string): string {
  const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return ymd;
  return `${y}년 ${m}월 ${d}일`;
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
async function downloadAsWallpaper(motivation: DailyMotivation): Promise<void> {
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
  ctx.fillText(formatHeader(motivation.ymd), 110, 280);

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
    ctx.fillText("나의 목표", 110, baseY);

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
  ctx.fillText("Anima · 미래의 나", WALLPAPER_W - 110, WALLPAPER_H - 130);

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
  onChatWithFuture,
  ymd,
}: MotivationCardProps) {
  const [downloading, setDownloading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

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
      await downloadAsWallpaper(motivation);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "이미지 저장에 실패했습니다.";
      setDownloadError(msg);
    } finally {
      setDownloading(false);
    }
  }, [motivation, downloading]);

  const handleRegenerate = useCallback(async () => {
    if (regenerating || loading) return;
    setRegenerating(true);
    try {
      await onRegenerate();
    } finally {
      setRegenerating(false);
    }
  }, [onRegenerate, regenerating, loading]);

  return (
    <section
      className="relative overflow-hidden rounded-[22px] shadow-apple-lg"
      style={cardStyle}
      aria-label="오늘의 동기부여 카드"
    >
      {/* 카드 본문 (16:20-ish 비율). 모바일에서도 본문이 충분히 보이도록 min-height 보장. */}
      <div className="relative flex min-h-[420px] flex-col px-6 py-7 sm:min-h-[480px] sm:px-8 sm:py-9">
        <div className={`text-[12px] font-medium tracking-[-0.01em] ${headerColor}`}>
          {formatHeader(ymd)} · 오늘의 한 마디
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
              {errorMessage || "동기부여 카드를 준비 중이에요. 잠시만요…"}
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

        {/* 목표 스냅샷 */}
        {motivation && motivation.goalsSnapshot.length > 0 && (
          <div className="mt-6">
            <p className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${goalLabelColor}`}>
              나의 목표
            </p>
            <ul className="mt-2 space-y-1">
              {motivation.goalsSnapshot.map((g, i) => (
                <li
                  key={i}
                  className={`flex items-start gap-2 text-[14px] font-medium leading-[1.4] tracking-[-0.01em] ${goalColor}`}
                >
                  <span className={`mt-[2px] shrink-0 text-[12px] tabular-nums ${authorColor}`}>
                    {i + 1}.
                  </span>
                  <span className="break-words">{g}</span>
                </li>
              ))}
            </ul>
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
            {downloading ? "저장 중…" : "배경화면으로 저장"}
          </button>
          <button
            type="button"
            onClick={onChatWithFuture}
            className={`inline-flex items-center gap-1.5 rounded-pill px-3.5 py-2 text-[12px] font-semibold tracking-[-0.01em] transition-colors ${
              tone === "dark"
                ? "border border-white/30 text-white hover:bg-white/10"
                : "border border-black/15 text-[#1E1B4B] hover:bg-black/[0.04]"
            }`}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a8 8 0 1 1-3.2-6.4L21 4v5h-5" />
            </svg>
            10년 후의 나와 대화
          </button>
        </div>
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={loading || regenerating}
          className={`inline-flex items-center gap-1 rounded-pill px-2.5 py-1.5 text-[11px] font-medium tracking-[-0.01em] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            tone === "dark" ? "text-white/80 hover:bg-white/10" : "text-black/60 hover:bg-black/[0.04]"
          }`}
          title="새 메시지로 다시 받기"
        >
          <svg className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 0 1 15.5-6.4L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-15.5 6.4L3 16" />
            <path d="M3 21v-5h5" />
          </svg>
          {regenerating ? "다시 받는 중…" : "다시 받기"}
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
