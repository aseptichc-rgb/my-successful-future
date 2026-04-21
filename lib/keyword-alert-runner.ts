/**
 * 키워드 기반 뉴스 검색 핵심 로직.
 * 클라이언트 폴링 API(/api/keyword-alert)와 서버 크론(/api/collect-news)이
 * 동일하게 호출하도록 추출됨.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { withRetry } from "./gemini";
import { buildKeywordAlertPrompt } from "./prompts";
import { formatDate } from "./locale";
import type { NewsSource } from "@/types";

const MODEL = "gemini-2.0-flash";

interface GroundingMeta {
  groundingChunks?: { web?: { uri?: string; title?: string } }[];
  groundingSupports?: {
    segment?: { startIndex?: number; endIndex?: number; text?: string };
    groundingChunkIndices?: number[];
  }[];
}

const KNOWN_PUBLISHERS: Record<string, string> = {
  "ytn.co.kr": "YTN", "yna.co.kr": "연합뉴스", "joongang.co.kr": "중앙일보",
  "joins.com": "중앙일보", "donga.com": "동아일보", "chosun.com": "조선일보",
  "hani.co.kr": "한겨레", "khan.co.kr": "경향신문", "mk.co.kr": "매일경제",
  "hankyung.com": "한국경제", "reuters.com": "Reuters", "bbc.com": "BBC",
  "cnn.com": "CNN", "bloomberg.com": "Bloomberg", "nytimes.com": "NYT",
};

const MAX_KEYWORD_PICK = 3;

function extractPublisher(domainOrUrl: string): string {
  const cleaned = domainOrUrl.replace(/^www\./, "").toLowerCase();
  for (const [domain, name] of Object.entries(KNOWN_PUBLISHERS)) {
    if (cleaned.includes(domain)) return name;
  }
  try {
    return new URL(domainOrUrl).hostname.replace("www.", "");
  } catch {
    return cleaned || "기사 출처";
  }
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/#{1,6}\s*/g, "")
    .replace(/`/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .trim();
}

export interface KeywordAlertResult {
  hasNews: boolean;
  content?: string;
  sources?: NewsSource[];
  matchedKeyword?: string;
}

/**
 * 등록 키워드 중 일부를 선택해 Gemini Google Search 로 오늘자 뉴스를 가져온다.
 * 결과가 없으면 hasNews:false. 모든 비동기는 try/catch 로 감싸고, 실패 시
 * KeywordAlertResult.hasNews=false 로 폴백한다.
 */
export async function runKeywordAlert(
  keywords: string[]
): Promise<KeywordAlertResult> {
  if (!keywords || keywords.length === 0) {
    return { hasNews: false };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[keyword-alert-runner] GEMINI_API_KEY 미설정");
    return { hasNews: false };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);

    const shuffled = [...keywords].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(MAX_KEYWORD_PICK, shuffled.length));
    const searchQuery = `오늘 최신 ${selected.join(" ")} 관련 뉴스`;

    const systemPrompt = buildKeywordAlertPrompt(keywords);

    const model = genAI.getGenerativeModel({
      model: MODEL,
      systemInstruction: systemPrompt,
      tools: [{ googleSearch: {} } as never],
    });

    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const todayStr = `${kst.getUTCFullYear()}년 ${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`;
    const messageWithDate = `[오늘 날짜: ${todayStr}] ${searchQuery}`;

    const result = await withRetry(() => model.generateContent(messageWithDate));
    const response = result.response;
    const rawText = response.text();

    if (rawText.includes("[NO_NEWS]")) {
      return { hasNews: false };
    }

    let matchedKeyword: string | undefined;
    const keywordMatch = rawText.match(/\[KEYWORD:\s*([^\]]+)\]/);
    if (keywordMatch) {
      matchedKeyword = keywordMatch[1].trim();
    }
    const text = rawText.replace(/\[KEYWORD:[^\]]+\]\s*\n?/, "").trim();

    const sources: NewsSource[] = [];
    try {
      const metadata = response.candidates?.[0]?.groundingMetadata as GroundingMeta | undefined;
      const chunks = metadata?.groundingChunks;
      const supports = metadata?.groundingSupports;

      if (chunks) {
        const chunkTitles = new Map<number, string>();
        if (supports) {
          for (const sup of supports) {
            const segText = sup.segment?.text;
            if (segText && sup.groundingChunkIndices) {
              for (const idx of sup.groundingChunkIndices) {
                if (!chunkTitles.has(idx)) {
                  chunkTitles.set(idx, segText.slice(0, 100));
                }
              }
            }
          }
        }

        const seen = new Set<string>();
        for (let i = 0; i < chunks.length; i++) {
          const uri = chunks[i].web?.uri;
          if (!uri) continue;
          const domain = chunks[i].web?.title || uri;
          if (seen.has(domain)) continue;
          seen.add(domain);

          sources.push({
            title: stripMarkdown(chunkTitles.get(i) || `${extractPublisher(domain)} 관련 기사`),
            publisher: extractPublisher(domain),
            url: uri,
            publishedAt: formatDate(new Date()),
          });
        }
      }
    } catch {
      // grounding 추출 실패 — 본문만 사용
    }

    return { hasNews: true, content: text, sources, matchedKeyword };
  } catch (error) {
    console.error("[keyword-alert-runner] 실패:", error);
    return { hasNews: false };
  }
}
