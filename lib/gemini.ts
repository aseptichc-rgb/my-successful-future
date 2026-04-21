import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ChatStreamEvent, NewsSource, NewsTopic } from "@/types";
import { formatDate } from "@/lib/locale";
import { fetchFromNewsAPI, fetchFromRSS } from "@/lib/newsSource";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const MODEL = "gemini-2.0-flash";

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 2000;

/**
 * 429 Rate Limit 에러를 지수 백오프로 재시도하는 헬퍼.
 * 429가 아닌 에러는 즉시 throw 한다.
 * 최대 5회 재시도, 대기: 2s → 4s → 8s → 16s → 32s
 */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      const is429 = msg.includes("429") || msg.includes("Resource exhausted");
      if (!is429 || attempt === MAX_RETRIES) {
        // 429 최종 실패 시 사용자 친화적 메시지로 변환
        if (is429) {
          throw new Error(
            "현재 AI 서버 요청이 많아 일시적으로 응답할 수 없습니다. 잠시 후 다시 시도해 주세요."
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
 * 메시지에서 `@페르소나이름` 형태의 멘션 토큰을 제거한다.
 * 멘션이 검색 쿼리에 그대로 포함되면 NewsAPI/RSS/Google Search가
 * 이를 리터럴 검색어로 취급해 결과가 비는 문제를 방지한다.
 */
function stripMentions(text: string): string {
  return text.replace(/@[\p{L}\p{N}_]+/gu, "").replace(/\s{2,}/g, " ").trim();
}

/** Gemini grounding metadata 타입 (SDK 타입이 불완전하므로 직접 정의) */
interface GroundingMeta {
  groundingChunks?: { web?: { uri?: string; title?: string } }[];
  groundingSupports?: {
    segment?: { startIndex?: number; endIndex?: number; text?: string };
    groundingChunkIndices?: number[];
    confidenceScores?: number[];
  }[];
}

interface MessageParam {
  role: "user" | "assistant";
  content: string;
}

export function streamChatResponse(
  messages: MessageParam[],
  systemPrompt: string,
  useWebSearch: boolean = true,
  topic: NewsTopic = "전체"
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        const model = genAI.getGenerativeModel({
          model: MODEL,
          systemInstruction: systemPrompt,
          generationConfig: {
            maxOutputTokens: 1024,
          },
          ...(useWebSearch && {
            tools: [{ googleSearch: {} } as never],
          }),
        });

        // Gemini 형식으로 대화 히스토리 변환 (반드시 "user"로 시작해야 함)
        const rawHistory = messages.slice(0, -1).map((msg) => ({
          role: msg.role === "assistant" ? ("model" as const) : ("user" as const),
          parts: [{ text: msg.content }],
        }));
        // Gemini API는 첫 메시지가 user여야 하므로 앞쪽 model 메시지 제거
        const history = rawHistory.slice(
          rawHistory.findIndex((m) => m.role === "user")
        );
        // user 메시지가 아예 없으면 빈 배열 사용
        if (history.length > 0 && history[0].role !== "user") {
          history.length = 0;
        }

        const lastMessage = messages[messages.length - 1];

        // 사용자 메시지에 오늘 날짜 컨텍스트 추가 (Google Search가 최신 결과를 반환하도록)
        const now = new Date();
        const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
        const todayStr = `${kst.getUTCFullYear()}년 ${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`;
        const sanitizedContent = stripMentions(lastMessage.content);
        const messageWithDate = `[오늘 날짜: ${todayStr}] ${sanitizedContent}`;

        const chat = model.startChat({ history });
        const result = await withRetry(() => chat.sendMessageStream(messageWithDate));

        let fullText = "";

        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) {
            fullText += text;
            const sseData: ChatStreamEvent = { type: "text", content: text };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(sseData)}\n\n`)
            );
          }
        }

        // Grounding metadata에서 실제 기사 URL 추출
        const sources: NewsSource[] = [];
        try {
          const response = await result.response;
          const metadata = response.candidates?.[0]?.groundingMetadata as
            | GroundingMeta
            | undefined;
          const chunks = metadata?.groundingChunks;
          const supports = metadata?.groundingSupports;

          if (chunks) {
            // groundingSupports에서 각 chunk에 해당하는 텍스트 추출
            const chunkTitles = new Map<number, string>();
            if (supports) {
              for (const sup of supports) {
                const text = sup.segment?.text;
                if (text && sup.groundingChunkIndices) {
                  for (const idx of sup.groundingChunkIndices) {
                    if (!chunkTitles.has(idx)) {
                      chunkTitles.set(idx, text.slice(0, 100));
                    }
                  }
                }
              }
            }

            const seen = new Set<string>();
            for (let i = 0; i < chunks.length; i++) {
              const chunk = chunks[i];
              const uri = chunk.web?.uri;
              if (!uri) continue;

              // 중복 도메인 제거 (같은 사이트 여러 건 방지)
              const domain = chunk.web?.title || uri;
              if (seen.has(domain)) continue;
              seen.add(domain);

              const publisher = extractPublisher(domain);
              const supportText = chunkTitles.get(i);

              sources.push({
                title: stripMarkdown(supportText || `${publisher} 관련 기사`),
                publisher,
                url: uri,
                publishedAt: formatDate(new Date()),
              });
            }
          }
        } catch {
          // grounding metadata 추출 실패 시 무시
        }

        // Gemini grounding에서 출처를 못 찾은 경우 NewsAPI/RSS 폴백
        if (sources.length === 0 && useWebSearch) {
          const userQuery = stripMentions(messages[messages.length - 1]?.content || "");
          try {
            const newsApiResults = await fetchFromNewsAPI(userQuery, topic);
            if (newsApiResults.length > 0) {
              sources.push(...newsApiResults.slice(0, 5));
            } else {
              const rssResults = await fetchFromRSS(userQuery);
              sources.push(...rssResults.slice(0, 5));
            }
          } catch {
            // 폴백 실패 시 무시
          }
        }

        // 소스를 먼저 전송 (OG 이미지 없이) → done 이벤트 → 클라이언트가 즉시 표시
        if (sources.length > 0) {
          const sourcesData: ChatStreamEvent = {
            type: "sources",
            sources,
          };
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(sourcesData)}\n\n`)
          );
        }

        const doneData: ChatStreamEvent = {
          type: "done",
          content: fullText,
        };
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(doneData)}\n\n`)
        );

        // OG 이미지를 후속 이벤트로 전송 — 본문 응답을 블로킹하지 않음
        if (sources.length > 0) {
          try {
            await fetchOgImages(sources);
            const updatedSourcesData: ChatStreamEvent = {
              type: "sources",
              sources,
            };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(updatedSourcesData)}\n\n`)
            );
          } catch {
            // OG 이미지 실패 시 무시 — 소스는 이미 전송됨
          }
        }

        controller.close();
      } catch (error) {
        const raw =
          error instanceof Error ? error.message : String(error);
        const is429 = raw.includes("429") || raw.includes("Resource exhausted");
        const errorMessage = is429
          ? "현재 AI 서버 요청이 많아 일시적으로 응답할 수 없습니다. 잠시 후 다시 시도해 주세요."
          : raw || "알 수 없는 오류가 발생했습니다.";
        const errorData: ChatStreamEvent = {
          type: "error",
          error: errorMessage,
        };
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`)
        );
        controller.close();
      }
    },
  });
}

/**
 * 단발성 텍스트 응답 (스트리밍 X, 도구 X).
 * 사용자 메모리 추출 등 짧은 분석 작업용.
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

/** 텍스트에서 마크다운 형식 제거 */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*/g, "")    // **굵게**
    .replace(/\*/g, "")      // *기울임*
    .replace(/#{1,6}\s*/g, "") // # 헤딩
    .replace(/`/g, "")        // `코드`
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // [텍스트](링크) → 텍스트
    .trim();
}

/** URL에서 OG 이미지 추출 */
async function fetchOgImage(url: string): Promise<string | undefined> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NewsBot/1.0)" },
    });
    clearTimeout(timeout);

    if (!res.ok) return undefined;

    // 전체 HTML을 읽지 않고 앞부분만 확인 (성능)
    const html = await res.text();
    const head = html.slice(0, 30000);

    // og:image 메타 태그 추출
    const ogMatch = head.match(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
    ) || head.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i
    );

    if (ogMatch?.[1]) {
      const imgUrl = ogMatch[1];
      // 상대 경로를 절대 경로로 변환
      if (imgUrl.startsWith("http")) return imgUrl;
      try {
        return new URL(imgUrl, url).href;
      } catch {
        return undefined;
      }
    }

    return undefined;
  } catch {
    return undefined;
  }
}

/** 여러 URL에서 OG 이미지를 병렬로 추출 */
async function fetchOgImages(
  sources: NewsSource[]
): Promise<void> {
  const promises = sources.map(async (source) => {
    const imageUrl = await fetchOgImage(source.url);
    if (imageUrl) {
      source.imageUrl = imageUrl;
    }
  });
  await Promise.allSettled(promises);
}

/** 도메인 문자열 또는 URL에서 언론사 이름 추출 */
function extractPublisher(domainOrUrl: string): string {
  const KNOWN: Record<string, string> = {
    "ytn.co.kr": "YTN",
    "yna.co.kr": "연합뉴스",
    "joongang.co.kr": "중앙일보",
    "joins.com": "중앙일보",
    "donga.com": "동아일보",
    "chosun.com": "조선일보",
    "hani.co.kr": "한겨레",
    "khan.co.kr": "경향신문",
    "mk.co.kr": "매일경제",
    "hankyung.com": "한국경제",
    "sedaily.com": "서울경제",
    "mt.co.kr": "머니투데이",
    "edaily.co.kr": "이데일리",
    "sbs.co.kr": "SBS",
    "kbs.co.kr": "KBS",
    "mbc.co.kr": "MBC",
    "jtbc.co.kr": "JTBC",
    "news.naver.com": "네이버뉴스",
    "n.news.naver.com": "네이버뉴스",
    "reuters.com": "Reuters",
    "bbc.com": "BBC",
    "cnn.com": "CNN",
    "apnews.com": "AP News",
    "nytimes.com": "NYT",
    "bloomberg.com": "Bloomberg",
    "tistory.com": "티스토리",
    "samsungpop.com": "삼성증권",
    "benzinga.com": "Benzinga",
  };

  // 입력이 도메인 문자열인 경우 (e.g. "joongang.co.kr")
  const cleaned = domainOrUrl.replace(/^www\./, "").toLowerCase();
  for (const [domain, name] of Object.entries(KNOWN)) {
    if (cleaned.includes(domain)) return name;
  }

  // URL인 경우 hostname 추출 시도
  try {
    const hostname = new URL(domainOrUrl).hostname.replace("www.", "");
    return KNOWN[hostname] || hostname;
  } catch {
    return cleaned || "기사 출처";
  }
}
