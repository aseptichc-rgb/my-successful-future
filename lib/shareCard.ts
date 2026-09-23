"use client";

/**
 * 스트릭 공유 카드 — 캔버스로 1080×1350(인스타 세로 규격) 이미지를 만들고 OS 공유 시트로 넘긴다.
 *
 * 왜 이미지인가: 이 앱의 결과물(연속일·최고 기록·오늘의 다짐)은 시각적이라 그대로 바이럴 소재가 된다.
 * 공유·초대 기능이 하나도 없던 앱에 넣는 첫 번째 획득 경로다. 링크가 아니라 이미지를 보내는 이유는
 * 인스타 스토리·카톡 프로필 같은 곳은 이미지만 받기 때문이다. 앱 이름과 URL 을 카드 안에 굽는다.
 *
 * 경로(우선순위):
 *   1. navigator.share({ files })   — 파일 공유 가능(안드로이드 Chrome·iOS 15+ 일부)
 *   2. navigator.share({ text })    — 텍스트만(구형 WebView)
 *   3. 이미지 다운로드               — 데스크톱/공유 API 없음
 *
 * 개인 텍스트(다짐 본문)는 사용자가 직접 공유하는 이미지에만 들어가고, 이벤트 props 엔 싣지 않는다.
 */
import { APP_URL } from "@/lib/constants/storeLinks";

export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1350;

const BG = "#1E1B4B";
const ACCENT = "#D85A30";
const INK = "#F5F1E8";
const INK_DIM = "rgba(245,241,232,0.62)";
/** 다짐 한 줄을 캔버스에 그릴 때의 최대 줄 수 — 넘치면 말줄임. */
const MAX_DECLARATION_LINES = 3;

export interface ShareCardInput {
  /** 현재 연속일. */
  count: number;
  /** 최고 연속일. */
  best: number;
  /** 카드 상단 라벨 (예: "N일 연속"). i18n 은 호출부 몫 — 이 모듈은 문자열만 그린다. */
  countLabel: string;
  bestLabel: string;
  /** 오늘의 다짐 한 줄(없으면 빈 문자열). */
  declaration: string;
  /** 카드 하단 브랜드 줄 (예: "Anima — 꿈을 이루는 하루"). */
  brandLine: string;
}

export type ShareMethod = "files" | "text" | "download";

/** 긴 문장을 폭에 맞춰 줄바꿈한다(단어 경계 우선, 없으면 글자 단위). */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  const push = (s: string) => {
    if (lines.length < maxLines) lines.push(s);
  };
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) push(current);
    // 단어 하나가 폭을 넘으면 글자 단위로 자른다(한국어·중국어는 공백이 드물다).
    let chunk = "";
    for (const ch of word) {
      if (ctx.measureText(chunk + ch).width > maxWidth) {
        push(chunk);
        chunk = ch;
      } else {
        chunk += ch;
      }
    }
    current = chunk;
  }
  if (current) push(current);
  if (lines.length === maxLines && (words.length > 0 || current)) {
    const last = lines[maxLines - 1];
    if (ctx.measureText(last).width > maxWidth - 40) lines[maxLines - 1] = `${last.slice(0, -2)}…`;
  }
  return lines;
}

/** 카드를 그려 PNG Blob 으로 돌려준다. 캔버스를 못 만드는 환경이면 null. */
export async function renderShareCard(input: ShareCardInput): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = SHARE_CARD_WIDTH;
    canvas.height = SHARE_CARD_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // 배경
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);
    // 은은한 원광 — 앱 아이콘의 링 모티프
    const ring = ctx.createRadialGradient(540, 520, 60, 540, 520, 520);
    ring.addColorStop(0, "rgba(216,90,48,0.28)");
    ring.addColorStop(1, "rgba(216,90,48,0)");
    ctx.fillStyle = ring;
    ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);

    const font = (weight: number, size: number) =>
      `${weight} ${size}px -apple-system, "Pretendard", "Noto Sans KR", "Segoe UI", Roboto, sans-serif`;

    // 상단 라벨
    ctx.fillStyle = INK_DIM;
    ctx.font = font(600, 40);
    ctx.textAlign = "center";
    ctx.fillText(input.countLabel, 540, 300);

    // 큰 숫자
    ctx.fillStyle = INK;
    ctx.font = font(800, 320);
    ctx.fillText(String(input.count), 540, 600);

    // 최고 기록
    ctx.fillStyle = ACCENT;
    ctx.font = font(700, 44);
    ctx.fillText(input.bestLabel, 540, 690);

    // 다짐
    if (input.declaration.trim()) {
      ctx.fillStyle = INK;
      ctx.font = font(500, 52);
      const lines = wrapLines(ctx, input.declaration.trim(), 880, MAX_DECLARATION_LINES);
      const startY = 860;
      lines.forEach((line, i) => ctx.fillText(line, 540, startY + i * 74));
    }

    // 브랜드 줄 + URL
    ctx.fillStyle = INK_DIM;
    ctx.font = font(600, 36);
    ctx.fillText(input.brandLine, 540, 1210);
    ctx.font = font(400, 30);
    ctx.fillText(APP_URL.replace(/^https?:\/\//, ""), 540, 1262);

    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  } catch (err) {
    console.warn("[shareCard] 렌더 실패:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * 공유 시트를 연다. 어떤 경로를 썼는지 돌려주고, 사용자가 시트를 닫은 경우(AbortError)는 null.
 * 절대 throw 하지 않는다 — 공유 실패가 화면을 깨면 안 된다.
 */
export async function shareStreakCard(
  blob: Blob | null,
  text: string,
  filename = "anima-streak.png",
): Promise<ShareMethod | null> {
  if (typeof navigator === "undefined") return null;
  try {
    if (blob && typeof navigator.share === "function") {
      const file = new File([blob], filename, { type: "image/png" });
      const canFiles =
        typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
      if (canFiles) {
        await navigator.share({ files: [file], text });
        return "files";
      }
    }
    if (typeof navigator.share === "function") {
      await navigator.share({ text });
      return "text";
    }
    if (blob && typeof document !== "undefined") {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return "download";
    }
    return null;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return null;
    console.warn("[shareCard] 공유 실패:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
