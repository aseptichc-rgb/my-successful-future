import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ChatStreamEvent, NewsSource } from "@/types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const MODEL = "gemini-2.0-flash";

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
  useWebSearch: boolean = true
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        const model = genAI.getGenerativeModel({
          model: MODEL,
          systemInstruction: systemPrompt,
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

        const chat = model.startChat({ history });
        const result = await chat.sendMessageStream(lastMessage.content);

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
                title: supportText || `${publisher} 관련 기사`,
                publisher,
                url: uri,
                publishedAt: new Date().toLocaleDateString("ko-KR"),
              });
            }
          }
        } catch {
          // grounding metadata 추출 실패 시 무시
        }

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
        controller.close();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
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
