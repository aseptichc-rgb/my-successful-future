/**
 * 업로드 파일에서 텍스트를 안전하게 추출.
 * - 화이트리스트 MIME + 매직 바이트 검증
 * - 사이즈/길이 상한
 * - 제어문자 제거
 * - 추출 실패 시 명확한 에러
 */

export const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
export const MAX_TEXT_CHARS = 50_000;          // 단일 문서 텍스트 최대 길이
export const MAX_DOCS_PER_SESSION = 5;         // 세션당 활성 문서 최대 개수

export type SupportedMime = "text/plain" | "text/markdown" | "application/pdf";

export const SUPPORTED_MIMES: SupportedMime[] = [
  "text/plain",
  "text/markdown",
  "application/pdf",
];

export interface ExtractResult {
  text: string;
  truncated: boolean;
  mime: SupportedMime;
  charCount: number;
}

export class ExtractError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ExtractError";
  }
}

/** 매직 바이트로 파일 타입 추정 (확장자/Content-Type 위변조 방지). */
function sniffMime(buffer: Buffer, fallbackMime: string, fileName: string): SupportedMime {
  // PDF: %PDF-
  if (buffer.length >= 5 && buffer.slice(0, 5).toString("ascii") === "%PDF-") {
    return "application/pdf";
  }
  // 텍스트: ASCII/UTF-8로 보이고 NUL이 거의 없으면
  const sampleSize = Math.min(buffer.length, 8192);
  let nulCount = 0;
  for (let i = 0; i < sampleSize; i++) {
    if (buffer[i] === 0) nulCount++;
  }
  const looksText = nulCount / Math.max(sampleSize, 1) < 0.001;

  if (looksText) {
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".md") || fallbackMime === "text/markdown") return "text/markdown";
    return "text/plain";
  }

  throw new ExtractError(415, "지원하지 않는 파일 형식입니다. (.md / .txt / .pdf 만 가능)");
}

/** 제어문자(탭/개행 제외) 제거 + 길이 상한 적용. */
function sanitizeText(raw: string): { text: string; truncated: boolean } {
  // 제어문자 제거 (탭 \t, 개행 \n, 캐리지리턴 \r 제외)
  const cleaned = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  if (cleaned.length <= MAX_TEXT_CHARS) {
    return { text: cleaned.trim(), truncated: false };
  }
  return { text: cleaned.slice(0, MAX_TEXT_CHARS).trim(), truncated: true };
}

/**
 * 파일 버퍼에서 텍스트 추출. 호출 전 사이즈 검증 필수.
 */
export async function extractTextFromFile(
  buffer: Buffer,
  fileName: string,
  contentTypeHeader: string
): Promise<ExtractResult> {
  if (buffer.length === 0) {
    throw new ExtractError(400, "빈 파일입니다.");
  }
  if (buffer.length > MAX_FILE_BYTES) {
    throw new ExtractError(
      413,
      `파일 크기는 ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB 이하여야 합니다.`
    );
  }

  const mime = sniffMime(buffer, contentTypeHeader, fileName);

  let raw: string;
  if (mime === "application/pdf") {
    try {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      try {
        const result = await parser.getText();
        raw = result.text || "";
      } finally {
        await parser.destroy().catch(() => {});
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ExtractError(400, `PDF 파싱 실패: ${msg}`);
    }
  } else {
    // text/plain, text/markdown — UTF-8 강제
    raw = buffer.toString("utf-8");
  }

  if (!raw || raw.trim().length === 0) {
    throw new ExtractError(400, "텍스트를 추출할 수 없습니다.");
  }

  const { text, truncated } = sanitizeText(raw);

  return {
    text,
    truncated,
    mime,
    charCount: text.length,
  };
}
