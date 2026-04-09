import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildAutoNewsPrompt } from "@/lib/prompts";
import { PERSONA_SPECIALTIES } from "@/lib/personas";
import { formatDate } from "@/lib/locale";
import type { AutoNewsRequest, AutoNewsResponse, NewsSource, PersonaId } from "@/types";

export const maxDuration = 60;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const MODEL = "gemini-2.0-flash";

/** Gemini grounding metadata 타입 */
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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AutoNewsRequest;
    const { sessionId, personaId, customTopics } = body;

    if (!sessionId || !personaId) {
      return NextResponse.json(
        { error: "sessionId와 personaId는 필수입니다." },
        { status: 400 }
      );
    }

    const specialty = PERSONA_SPECIALTIES[personaId as PersonaId];
    if (!specialty) {
      return NextResponse.json(
        { error: "유효하지 않은 페르소나입니다." },
        { status: 400 }
      );
    }

    // 자동 뉴스 프롬프트 생성
    const systemPrompt = buildAutoNewsPrompt(
      personaId as PersonaId,
      specialty.searchKeywords,
      customTopics
    );

    // 검색 쿼리 생성: 키워드 중 2~3개 선택 + 커스텀 토픽
    const allKeywords = [...specialty.searchKeywords, ...(customTopics || [])];
    const selectedKeywords = allKeywords
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    const searchQuery = `오늘 최신 ${selectedKeywords.join(" ")} 뉴스`;

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
    const text = response.text();

    // [NO_NEWS] 체크 - 주요 뉴스 없음
    if (text.includes("[NO_NEWS]")) {
      const res: AutoNewsResponse = { hasNews: false };
      return NextResponse.json(res);
    }

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
            title: (chunkTitles.get(i) || `${extractPublisher(domain)} 관련 기사`)
              .replace(/\*\*/g, "").replace(/\*/g, "").replace(/#{1,6}\s*/g, "").trim(),
            publisher: extractPublisher(domain),
            url: uri,
            publishedAt: formatDate(new Date()),
          });
        }
      }
    } catch {
      // grounding 추출 실패 무시
    }

    const res: AutoNewsResponse = {
      hasNews: true,
      content: text,
      sources,
      personaId: personaId as PersonaId,
    };
    return NextResponse.json(res);
  } catch (error) {
    const errorDetail = error instanceof Error ? error.message : String(error);
    console.error("Auto-news API error:", errorDetail);
    return NextResponse.json(
      { error: `자동 뉴스 오류: ${errorDetail}` },
      { status: 500 }
    );
  }
}
