import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const MODEL = "gemini-2.5-flash-lite";

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 2000;

export interface GeminiUsage {
  model: string;
  promptTokens: number;
  completionTokens: number;
}

/**
 * 429 Rate Limit 에러를 지수 백오프로 재시도하는 헬퍼.
 * 429가 아닌 에러는 즉시 throw 한다.
 */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      const is429 = msg.includes("429") || msg.includes("Resource exhausted");
      if (!is429 || attempt === MAX_RETRIES) {
        if (is429) {
          throw new Error(
            "현재 AI 서버 요청이 많아 일시적으로 응답할 수 없습니다. 잠시 후 다시 시도해 주세요.",
          );
        }
        throw error;
      }
      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("withRetry: unreachable");
}

/**
 * 단발성 텍스트 응답 — 동기부여 카드의 명언 큐레이션처럼
 * 짧은 분석/선택 작업용. 스트리밍/도구 사용 없음.
 */
export async function generateText(prompt: string, maxTokens: number = 800): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.3,
    },
  });
  const result = await withRetry(() => model.generateContent(prompt));
  return result.response.text();
}
