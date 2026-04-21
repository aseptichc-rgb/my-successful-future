import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { withRetry } from "@/lib/gemini";
import { buildAutoNewsPrompt, buildFutureSelfPrompt } from "@/lib/prompts";
import { PERSONA_SPECIALTIES, isBuiltinPersona } from "@/lib/personas";
import { formatDate } from "@/lib/locale";
import { fetchMarketOverview } from "@/lib/stockSource";
import { buildFinanceNewsContext } from "@/lib/naverFinanceNews";
import type { AutoNewsRequest, AutoNewsResponse, BuiltinPersonaId, NewsSource, PersonaId } from "@/types";

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

/**
 * 사용자 futurePersona 텍스트에서 검색 키워드를 단순 추출.
 * 한국어 명사/영문 단어 중 2글자 이상인 것을 추출하고, 흔한 불용어 제외.
 */
function extractKeywordsFromFuturePersona(text: string): string[] {
  if (!text) return [];
  const stopwords = new Set([
    "되어", "되고", "되는", "있다", "있는", "있어", "한다", "하는", "해서",
    "그리고", "그러나", "하지만", "또는", "이다", "이며", "이고", "지만",
    "에서", "으로", "에게", "한테", "까지", "부터", "마다", "처럼", "같이",
    "현재", "지금", "오늘", "내일", "어제", "매일", "매주", "매년", "정도",
    "모든", "어떤", "무엇", "사람", "것은", "것을", "것이", "않는", "않고",
  ]);
  const tokens = text
    .replace(/[^\w가-힣\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !stopwords.has(t));
  // 중복 제거 + 최대 6개
  return Array.from(new Set(tokens)).slice(0, 6);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AutoNewsRequest;
    const { sessionId, personaId, customTopics, futurePersona, currentPersona } = body;

    if (!sessionId || !personaId) {
      return NextResponse.json(
        { error: "sessionId와 personaId는 필수입니다." },
        { status: 400 }
      );
    }

    let systemPrompt: string;
    let searchQuery: string;

    if (personaId === "future-self") {
      // ── 미래의 나 자동 메시지 ────────────────────────
      if (!futurePersona || futurePersona.trim().length === 0) {
        return NextResponse.json(
          { error: "futurePersona가 설정되지 않았습니다. 먼저 '미래의 나'를 정의해주세요." },
          { status: 400 }
        );
      }

      // 사용자 미래 자기소개에서 검색 키워드 추출 + 커스텀 토픽 결합
      const extractedKeywords = extractKeywordsFromFuturePersona(futurePersona);
      const allKeywords = [...extractedKeywords, ...(customTopics || [])];
      const selectedKeywords = allKeywords
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);
      searchQuery = selectedKeywords.length > 0
        ? `오늘 최신 ${selectedKeywords.join(" ")} 관련 뉴스나 이슈`
        : "오늘 자기계발 동기부여 성공 관련 이야기";

      systemPrompt = buildFutureSelfPrompt(
        currentPersona,
        futurePersona,
        `지금 너는 자유 시간이 났어. 위 검색어("${searchQuery}")로 오늘 뉴스를 찾아보고, 그 중 너가 가는 길과 연결된 이야기를 골라 현재의 너에게 자발적으로 메시지를 보내. 미래의 나로서, 격려와 행동 제안과 회고 질문을 모두 자연스럽게 녹여서 4~6 단락으로 작성해.`
      );
    } else {
      // ── 기존 페르소나 자동 뉴스 ──────────────────────
      if (!isBuiltinPersona(personaId as string)) {
        return NextResponse.json(
          { error: "자동 뉴스는 빌트인 페르소나에서만 지원됩니다." },
          { status: 400 }
        );
      }
      const builtinId = personaId as BuiltinPersonaId;
      const specialty = PERSONA_SPECIALTIES[builtinId];
      if (!specialty) {
        return NextResponse.json(
          { error: "유효하지 않은 페르소나입니다." },
          { status: 400 }
        );
      }

      systemPrompt = buildAutoNewsPrompt(
        builtinId,
        specialty.searchKeywords,
        customTopics
      );

      // fund-trader: 자동 브리핑에 실시간 시장 개황 + 금융 뉴스 주입
      if (builtinId === "fund-trader") {
        const [marketCtx, newsCtx] = await Promise.all([
          fetchMarketOverview().catch(() => null),
          buildFinanceNewsContext().catch(() => null),
        ]);
        if (marketCtx) systemPrompt += `\n${marketCtx}`;
        if (newsCtx) systemPrompt += `\n${newsCtx}`;
        systemPrompt += `\n\n위 실시간 시세와 뉴스 데이터를 반드시 브리핑에 반영하세요. 시장 개황을 언급하고, 주요 뉴스를 분석 관점에서 코멘트하세요.`;
      }

      const allKeywords = [...specialty.searchKeywords, ...(customTopics || [])];
      const selectedKeywords = allKeywords
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);
      searchQuery = `오늘 최신 ${selectedKeywords.join(" ")} 뉴스`;
    }

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
    const text = response.text();

    // [NO_NEWS] 체크 - 미래 자아는 항상 메시지를 보내므로 분기 제외
    if (personaId !== "future-self" && text.includes("[NO_NEWS]")) {
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
