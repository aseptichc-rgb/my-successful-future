/**
 * 토큰 사용량 / 비용 집계용 모듈.
 *
 * - 모든 LLM 호출 결과를 `tokenUsage` 컬렉션에 기록한다.
 * - 가격은 1M 토큰 기준 USD. 모델별 단가가 바뀌면 PRICING 만 갱신.
 * - 어드민 페이지(/admin) 와 /api/admin/stats 에서 합산해 노출.
 *
 * 보안:
 * - 클라이언트는 절대 이 컬렉션에 직접 쓰지 못한다 (firestore.rules 에서 차단).
 * - 어드민 권한은 ADMIN_EMAILS 환경변수(쉼표 구분) + 인증 토큰 이메일 검증으로 한정.
 */

import { getAdminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export type LlmProvider = "google" | "openai";

/** 1,000,000 토큰 당 USD 단가. */
interface ModelPrice {
  inputPerMTokens: number;
  outputPerMTokens: number;
}

const PRICING: Record<string, ModelPrice> = {
  // Google Gemini (2025 공식 기준 — flash-lite)
  "gemini-2.5-flash-lite": { inputPerMTokens: 0.1, outputPerMTokens: 0.4 },
  "gemini-2.5-flash": { inputPerMTokens: 0.3, outputPerMTokens: 2.5 },
  "gemini-2.5-pro": { inputPerMTokens: 1.25, outputPerMTokens: 10 },
  // OpenAI
  "gpt-4o-mini": { inputPerMTokens: 0.15, outputPerMTokens: 0.6 },
  "gpt-4o": { inputPerMTokens: 2.5, outputPerMTokens: 10 },
};

const FALLBACK_PRICE: ModelPrice = { inputPerMTokens: 0.1, outputPerMTokens: 0.4 };

export function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const price = PRICING[model] || FALLBACK_PRICE;
  const cost =
    (promptTokens / 1_000_000) * price.inputPerMTokens +
    (completionTokens / 1_000_000) * price.outputPerMTokens;
  // 소수 8자리에서 반올림 — 매우 작은 호출이 0 으로 떨어지는 것 방지.
  return Math.round(cost * 1e8) / 1e8;
}

interface LogTokenUsageInput {
  uid: string | null;
  provider: LlmProvider;
  model: string;
  promptTokens: number;
  completionTokens: number;
  feature?: string;
}

/**
 * 사용량 1건을 기록한다. 절대 throw 하지 않음 — 로깅 실패가 사용자 응답을 끊지 않도록.
 */
export async function logTokenUsage(input: LogTokenUsageInput): Promise<void> {
  const { uid, provider, model, promptTokens, completionTokens, feature } = input;
  // 0/0 인 빈 호출은 기록 스킵
  if (promptTokens <= 0 && completionTokens <= 0) return;
  try {
    const totalTokens = promptTokens + completionTokens;
    const costUsd = estimateCostUsd(model, promptTokens, completionTokens);
    await getAdminDb().collection("tokenUsage").add({
      uid: uid || null,
      provider,
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      costUsd,
      feature: feature || "chat",
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.warn("[tokenUsage] 기록 실패:", err);
  }
}

/**
 * 어드민 권한 판정.
 * ADMIN_EMAILS 환경변수에 쉼표로 구분된 이메일 목록을 등록해두고,
 * 인증된 사용자의 이메일이 그 목록에 있으면 true.
 */
export function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return false;
  return list.includes(email.toLowerCase());
}
