import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildKeywordAlertPrompt } from "@/lib/prompts";
import { formatDate } from "@/lib/locale";
import type { KeywordAlertRequest, KeywordAlertResponse, NewsSource } from "@/types";

export const maxDuration = 60;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as KeywordAlertRequest;
    const { sessionId, keywords } = body;

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId는 필수입니다." }, { status: 400 });
    }
    if (!keywords || keywords.length === 0) {
      return NextResponse.json({ error: "키워드를 1개 이상 등록해주세요." }, { status: 400 });
    }

    // 키워드 중 하나를 무작위 선택해서 검색 쿼리 구성 (다양성 확보)
    const shuffled = [...keywords].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(3, shuffled.length));
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

    const result = await model.generateContent(messageWithDate);
    const response = result.response;
    const rawText = response.text();

    if (rawText.includes("[NO_NEWS]")) {
      const res: KeywordAlertResponse = { hasNews: false };
      return NextResponse.json(res);
    }

    // [KEYWORD: xxx] 마커 추출
    let matchedKeyword: string | undefined;
    const keywordMatch = rawText.match(/\[KEYWORD:\s*([^\]]+)\]/);
    if (keywordMatch) {
      matchedKeyword = keywordMatch[1].trim();
    }
    const text = rawText.replace(/\[KEYWORD:[^\]]+\]\s*\n?/, "").trim();

    // 뉴스 소스 추출
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
      // grounding 추출 실패 무시
    }

    const res: KeywordAlertResponse = {
      hasNews: true,
      content: text,
      sources,
      matchedKeyword,
    };
    return NextResponse.json(res);
  } catch (error) {
    const errorDetail = error instanceof Error ? error.message : String(error);
    console.error("Keyword-alert API error:", errorDetail);
    return NextResponse.json(
      { error: `키워드 알림 오류: ${errorDetail}` },
      { status: 500 }
    );
  }
}
