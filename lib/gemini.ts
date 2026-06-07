import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const MODEL = "gemini-2.5-flash-lite";

/**
 * 호출당 하드 타임아웃.
 * Gemini 가 느리거나 응답을 안 주면(행) 이 시간 안에 끊고 호출부가 결정론적 폴백으로
 * 전환하게 한다. 카드 한 장 생성 경로(/api/widget/today, /api/daily-motivation)는
 * 클라(OkHttp readTimeout 20s)·Vercel(maxDuration 30s) 한도가 있고, 한 요청에서
 * 정체성 라벨 + 명언으로 generateText 가 최대 2회 직렬 호출될 수 있으므로
 * (6s×2 + Firestore 왕복) 충분히 한도 안에 들어오도록 보수적으로 잡는다.
 * flash-lite 정상 응답은 보통 1~2초라 성공 호출을 자르지 않는다.
 */
const PER_ATTEMPT_TIMEOUT_MS = 6000;
/**
 * 429(레이트리밋) 1회 재시도 사이 대기.
 * 일일 쿼터 소진형 429 는 같은 요청 안에서 재시도해도 회복되지 않으므로 길게 기다리지 않는다.
 * 순간적 RPM 초과만 1회 짧게 흡수하고, 그래도 막히면 즉시 폴백.
 */
const RETRY_DELAY_MS = 800;

export interface GeminiUsage {
  model: string;
  promptTokens: number;
  completionTokens: number;
}

/** Gemini 가 호출당 시간 안에 응답하지 못해 끊었음을 나타낸다. */
export class GeminiTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Gemini 응답이 ${timeoutMs}ms 안에 오지 않아 중단했습니다.`);
    this.name = "GeminiTimeoutError";
  }
}

/** 429 / Resource exhausted 계열인지 판별 — 이때만 짧게 재시도한다. */
function isRateLimit(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("429") || msg.includes("Resource exhausted");
}

/**
 * 한 번의 Gemini 호출을 호출당 타임아웃과 함께 실행.
 *
 * 타임아웃 메커니즘은 단일 setTimeout → Promise.race 패턴 하나로 통일했다(과거엔
 * AbortController·SDK timeout·별도 deadline race 가 모두 걸려 있어 정상 응답 후에도
 * sleep 타이머가 6초 동안 살아 unhandled rejection 으로 떨어지는 누수가 있었다).
 * 데드라인 만료 시 GeminiTimeoutError 로 throw, 정상 응답 시 clearTimeout 으로 정리.
 */
async function generateOnce(prompt: string, maxTokens: number): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.3,
    },
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new GeminiTimeoutError(PER_ATTEMPT_TIMEOUT_MS)),
      PER_ATTEMPT_TIMEOUT_MS,
    );
  });
  try {
    const result = await Promise.race([model.generateContent(prompt), deadline]);
    return result.response.text();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 단발성 텍스트 응답 — 동기부여 카드의 명언 큐레이션처럼
 * 짧은 분석/선택 작업용. 스트리밍/도구 사용 없음.
 *
 * 정책: 429(Rate Limit) 만 [RETRY_DELAY_MS] 후 1회 짧게 재시도하고, 그 외 에러는 즉시 throw.
 * 모든 호출부는 try-catch 로 결정론적 폴백을 갖추고 있어, 여기서 throw 되면 카드/라벨/추천이
 * 폴백으로 안전하게 떨어진다.
 *
 * NOTE: 과거에는 최대 5회·지수 백오프(2→4→8→16→32s, 합 62s)였으나, 이 누적 대기가
 * 클라/서버 타임아웃을 넘겨 "오늘의 한 마디 = Failed to fetch" 회귀를 만들었다.
 * 폴백 명언은 Gemini 없이도 즉시 만들 수 있으므로, 오래 기다리기보다 빨리 폴백하는 게 낫다.
 */
export async function generateText(prompt: string, maxTokens: number = 800): Promise<string> {
  try {
    return await generateOnce(prompt, maxTokens);
  } catch (err) {
    if (!isRateLimit(err)) throw err;
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    return generateOnce(prompt, maxTokens);
  }
}
