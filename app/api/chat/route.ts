import { NextRequest, NextResponse } from "next/server";
import { streamChatResponse } from "@/lib/gemini";
import { buildSystemPrompt } from "@/lib/prompts";
import { getAdminDb } from "@/lib/firebase-admin";
import { loadReferenceDocumentsForUser } from "@/lib/googleDocs";
import { getAdminAuth } from "@/lib/firebase-admin";
import { getRecentArticlesForPersona, getRecentDomainTimeline } from "@/lib/personaNewsCollector";
import { isBuiltinPersona, PERSONAS } from "@/lib/personas";
import { mergePersona } from "@/lib/persona-resolver";
import { buildStockContext, detectStockQuery, fetchMarketOverview } from "@/lib/stockSource";
import { buildFinanceNewsContext } from "@/lib/naverFinanceNews";
import { TTLCache } from "@/lib/memoryCache";
import type { PersonaOverride } from "@/types";
import type { BuiltinPersonaId, NewsTopic, PersonaId, MoodKind } from "@/types";

export const maxDuration = 60;

// 빌트인 페르소나 오버라이드는 사용자가 UI 에서 수정할 때만 변경되므로
// 60초 TTL 메모리 캐시로 반복 Firestore 조회를 회피.
// 키 형식: `${uid}|${personaId}`
const personaOverrideCache = new TTLCache<PersonaOverride | null>(60 * 1000);

// 시의성 / 뉴스 의도 감지 키워드 — B: Google Search 게이트 판단용
const WEB_SEARCH_INTENT_KEYWORDS = [
  "오늘", "방금", "최신", "속보", "지금", "현재", "긴급",
  "뉴스", "기사", "보도", "시사", "이슈", "발표",
  "주가", "시세", "환율", "코스피", "코스닥", "지수",
  "어제", "요즘", "이번 주", "이번주",
  // 정보성·사실 확인 신호 (A1 확장)
  "상황", "동향", "추세", "전망", "예상", "관련", "사례",
  "누구", "언제", "어디", "왜", "어떻게", "얼마",
  "알려줘", "설명", "정리", "비교", "소개",
];

/** 사용자 질문이 실시간 웹 검색이 필요한 성격인지 가볍게 추정.
 *  A1 확장: 페르소나 대화에서도 물음표·질문형 신호·일정 길이 이상이면 기본 검색 허용.
 */
function shouldUseWebSearch(
  message: string,
  persona: PersonaId,
  topic: NewsTopic,
  isCouncilFinal: boolean | undefined
): boolean {
  // 뉴스봇(기본) 페르소나는 항상 웹 검색.
  if (persona === "default") return true;
  // 카운슬 최종 종합 발언은 검색 불필요 (이미 각 전문가 의견이 컨텍스트에 있음).
  if (isCouncilFinal) return false;
  // future-self 는 뉴스 브리핑 모드가 아닌 한 기본 꺼둠 (격려·성찰 중심).
  if (persona === "future-self") {
    const lower = message.toLowerCase();
    return WEB_SEARCH_INTENT_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
  }
  // 토픽이 명시적으로 뉴스 분야인 경우 유지
  if (topic !== "전체") return true;

  const lower = message.toLowerCase();
  // 키워드 매칭
  if (WEB_SEARCH_INTENT_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))) return true;
  // 질문형 신호: 물음표가 있고 최소 길이 이상이면 정보성 질문일 가능성 높음
  if (message.includes("?") && message.trim().length >= 8) return true;
  // 한글 질문형 종결어미 ("~까?", "~나요?", "~인가요?", "~야?") 감지
  if (/(까요?|나요?|인가요?|일까요?|었나요?|였나요?|인지|어떨까|어떻게)\??$/.test(message.trim())) return true;
  // 충분히 길고 정보성일 가능성 높은 질문
  if (message.trim().length >= 30) return true;
  return false;
}

interface CustomPersonaPayload {
  id: string;
  name: string;
  icon: string;
  description?: string;
  systemPromptAddition: string;
}

interface ChatApiRequest {
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
  topic?: NewsTopic;
  persona?: PersonaId;
  participants?: PersonaId[];
  userPersona?: string;
  futurePersona?: string;
  userMemory?: string;
  personaMemory?: string;
  councilContext?: { personaName: string; content: string; isUser?: boolean }[];
  isCouncilFinal?: boolean;
  /**
   * 카운슬 토론에서 이번 질문의 1차 담당자 페르소나 ID.
   * useChat.ts 의 sendCouncilQuestion 이 pickPrimaryPersona 결과로 채워 보낸다.
   */
  primaryPersonaId?: PersonaId;
  /** true 이면 서버가 이 페르소나의 최근 자동수집 기사 5건을 시스템 프롬프트에 주입한다. */
  useCollectedNews?: boolean;
  customPersona?: CustomPersonaPayload;
  mood?: MoodKind;
  /** 첨부 문서 컨텍스트를 로드할 세션 ID. 클라이언트는 텍스트를 보내지 않고 ID 만 넘긴다. */
  sessionId?: string;
}

/**
 * 서버에서 직접 활성 세션 문서를 조회한다.
 * 클라이언트가 보낸 텍스트를 신뢰하지 않으므로 (위변조/거대 페이로드 방지)
 * Firestore 에서 active=true 인 문서만 가져와 프롬프트에 주입한다.
 */
async function loadActiveDocuments(
  sessionId: string
): Promise<{ fileName: string; text: string; truncated: boolean }[]> {
  try {
    const db = getAdminDb();
    const snap = await db
      .collection("sessionDocuments")
      .where("sessionId", "==", sessionId)
      .where("active", "==", true)
      .get();
    return snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          fileName: String(data.fileName || ""),
          text: String(data.extractedText || ""),
          truncated: Boolean(data.truncated),
          scope: String(data.scope || "session"),
          createdAt: data.createdAt,
        };
      })
      .filter((d) => d.text.trim().length > 0)
      .map(({ fileName, text, truncated }) => ({ fileName, text, truncated }));
  } catch (err) {
    console.error("loadActiveDocuments failed:", err);
    return [];
  }
}

/**
 * scope=message 인 문서는 1회 사용 후 자동 비활성화.
 * 메시지 응답이 시작된 후 fire-and-forget 으로 호출.
 */
async function consumeOneShotDocuments(sessionId: string): Promise<void> {
  try {
    const db = getAdminDb();
    const snap = await db
      .collection("sessionDocuments")
      .where("sessionId", "==", sessionId)
      .where("active", "==", true)
      .where("scope", "==", "message")
      .get();
    const batch = db.batch();
    snap.docs.forEach((d) => batch.update(d.ref, { active: false }));
    if (snap.size > 0) await batch.commit();
  } catch (err) {
    console.error("consumeOneShotDocuments failed:", err);
  }
}

// 입력 글자수 제한
const MAX_INPUT_LENGTH = 500;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ChatApiRequest;

    if (!body.message) {
      return NextResponse.json(
        { error: "message는 필수입니다." },
        { status: 400 }
      );
    }

    // 입력 글자수 제한 검증
    if (body.message.length > MAX_INPUT_LENGTH) {
      return NextResponse.json(
        { error: `메시지는 ${MAX_INPUT_LENGTH}자 이내로 입력해주세요. (현재 ${body.message.length}자)` },
        { status: 400 }
      );
    }

    const { message, history = [], topic = "전체", persona = "default", participants, userPersona, futurePersona, userMemory, personaMemory, councilContext, isCouncilFinal, primaryPersonaId, useCollectedNews, customPersona, mood, sessionId } = body;

    // 대화 히스토리 + 현재 메시지
    const conversationMessages = [
      ...history,
      { role: "user" as const, content: message },
    ];

    // 선택적 인증 — Authorization 헤더가 있으면 사용자별 참조 문서까지 로드.
    let authedUid: string | null = null;
    try {
      const header = request.headers.get("authorization") || request.headers.get("Authorization");
      if (header && header.startsWith("Bearer ")) {
        const token = header.slice(7).trim();
        if (token) {
          const decoded = await getAdminAuth().verifyIdToken(token);
          authedUid = decoded.uid;
        }
      }
    } catch (err) {
      console.warn("[chat] optional auth 실패 — 전역 참조 문서만 사용:", err);
    }

    // fund-trader 페르소나 여부 판별 (시장 개황 + 금융 뉴스 자동 주입 대상)
    const isFundTrader = persona === "fund-trader";

    // A: 주식 의도 사전 감지 — 사용자 메시지에 주식 키워드가 없으면 NAVER 호출 전체 스킵.
    //    fund-trader 페르소나는 항상 시장 개황을 주입하므로 예외.
    const hasStockIntent = !!detectStockQuery(message);
    const needsStockContext = hasStockIntent || isFundTrader;

    // A: future-self 페르소나는 참조 문서를 사용하지 않는 자기계발 흐름이므로
    //    Google Docs 조회를 스킵해 TTFB 단축.
    const needsReferenceDocs = persona !== "future-self";

    // 모든 외부 조회를 한 번에 병렬 실행 — 순차 대기를 최소화
    const [sessionDocs, referenceDocs, stockContext, marketOverview, financeNewsContext, collectedArticlesRaw, personaOverride, domainTimelineRaw] = await Promise.all([
      sessionId ? loadActiveDocuments(sessionId) : Promise.resolve([]),
      needsReferenceDocs
        ? loadReferenceDocumentsForUser(authedUid, persona as string | undefined)
        : Promise.resolve([]),
      needsStockContext
        ? buildStockContext(message).catch((err) => {
            console.warn("[chat] 주식 시세 조회 실패, 시세 컨텍스트 없이 진행:", err);
            return null;
          })
        : Promise.resolve(null),
      // fund-trader: 주요 지수·환율·대형주 시장 개황 자동 조회
      isFundTrader
        ? fetchMarketOverview().catch((err) => {
            console.warn("[chat] 시장 개황 조회 실패:", err);
            return null;
          })
        : Promise.resolve(null),
      // fund-trader: 네이버 증권 최신 금융 뉴스 자동 조회
      isFundTrader
        ? buildFinanceNewsContext().catch((err) => {
            console.warn("[chat] 금융 뉴스 조회 실패:", err);
            return null;
          })
        : Promise.resolve(null),
      // A2 확장: 빌트인 페르소나(default·future-self 제외) 일반 대화에도 수집 기사 주입.
      //   - 토론 모드면 5건, 일반 대화면 3건.
      //   - personaNews 컬렉션에 사전 수집된 기사를 Firestore read 만으로 불러오므로
      //     외부 API 호출 비용 없음.
      (isBuiltinPersona(persona as string) && persona !== "default" && persona !== "future-self")
        ? getRecentArticlesForPersona(persona as BuiltinPersonaId, useCollectedNews ? 5 : 3).catch(() => [])
        : Promise.resolve([]),
      // 빌트인 페르소나 오버라이드 조회 — E: 메모리 캐시(60s) 로 Firestore 왕복 절감
      (authedUid && isBuiltinPersona(persona as string) && persona !== "future-self")
        ? personaOverrideCache.getOrLoad(`${authedUid}|${persona}`, async () => {
            try {
              const snap = await getAdminDb()
                .collection("users").doc(authedUid)
                .collection("personaOverrides").doc(persona as string)
                .get();
              return snap.exists ? (snap.data() as PersonaOverride) : null;
            } catch (err) {
              console.warn("[chat] personaOverride 조회 실패:", err);
              return null;
            }
          }).catch(() => null)
        : Promise.resolve(null),
      // 누적 도메인 타임라인 — 같은 분야의 다른 페르소나 대비 전문성 격차를 만들기 위해
      // 빌트인 비뉴스봇 페르소나에 한해 최근 7개 흐름을 주입.
      (isBuiltinPersona(persona as string) && persona !== "default" && persona !== "future-self")
        ? getRecentDomainTimeline(persona as BuiltinPersonaId, 7).catch(() => [])
        : Promise.resolve([]),
    ]);
    const attachedDocuments = [...referenceDocs, ...sessionDocs];

    const collectedArticles = collectedArticlesRaw.length > 0
      ? collectedArticlesRaw.map((it) => ({
          title: it.source.title,
          publisher: it.source.publisher,
          url: it.source.url,
          briefing: it.briefing,
        }))
      : undefined;

    let builtinPersonaOverride:
      | { name: string; icon: string; description: string; systemPromptAddition: string }
      | undefined;
    if (personaOverride) {
      const merged = mergePersona(PERSONAS[persona as keyof typeof PERSONAS], personaOverride);
      builtinPersonaOverride = {
        name: merged.name,
        icon: merged.icon,
        description: merged.description,
        systemPromptAddition: merged.systemPromptAddition,
      };
    }

    // 다른 참여자(빌트인) 페르소나의 사용자 오버라이드 로드 — 프롬프트 상의 다른 참여자 이름이 사용자 설정과 일치하도록.
    let participantOverrides: Record<string, { name?: string; icon?: string }> | undefined;
    if (authedUid && Array.isArray(participants) && participants.length > 1) {
      const others = (participants as PersonaId[]).filter(
        (id) => id !== persona && isBuiltinPersona(id as string) && id !== "future-self"
      );
      if (others.length > 0) {
        const entries = await Promise.all(
          others.map(async (id) => {
            try {
              const ov = await personaOverrideCache.getOrLoad(`${authedUid}|${id}`, async () => {
                const snap = await getAdminDb()
                  .collection("users").doc(authedUid)
                  .collection("personaOverrides").doc(id as string)
                  .get();
                return snap.exists ? (snap.data() as PersonaOverride) : null;
              });
              return [id as string, ov] as const;
            } catch {
              return [id as string, null] as const;
            }
          })
        );
        const map: Record<string, { name?: string; icon?: string }> = {};
        for (const [id, ov] of entries) {
          if (ov && (ov.name || ov.icon)) {
            map[id] = { name: ov.name, icon: ov.icon };
          }
        }
        if (Object.keys(map).length > 0) participantOverrides = map;
      }
    }

    // fund-trader: 시세 컨텍스트 병합 — 사용자가 특정 종목을 물었으면(stockContext)
    // 해당 시세 + 시장 개황을 합산. 종목 질문 없으면 시장 개황만 주입.
    let mergedStockContext = stockContext || undefined;
    if (isFundTrader) {
      const parts: string[] = [];
      if (marketOverview) parts.push(marketOverview);
      if (stockContext) parts.push(stockContext);
      if (financeNewsContext) parts.push(financeNewsContext);
      if (parts.length > 0) mergedStockContext = parts.join("\n");
    }

    // D: 주식 환각 방지 규칙을 실제로 프롬프트에 넣을지 결정.
    //    - fund-trader: 항상 필요 (시장 개황 자동 주입)
    //    - 그 외: 사용자 메시지에 주식 의도가 있거나 시세 컨텍스트가 실제로 있을 때만
    const includeStockRules = isFundTrader || hasStockIntent || !!mergedStockContext;

    // 시스템 프롬프트 빌드 (lib/prompts.ts에서만 관리)
    const systemPrompt = buildSystemPrompt(
      topic as NewsTopic,
      persona as PersonaId,
      participants as PersonaId[] | undefined,
      userPersona,
      futurePersona,
      userMemory,
      {
        personaMemory,
        councilContext,
        isCouncilFinal,
        primaryPersonaId,
        collectedArticles,
        domainTimeline: domainTimelineRaw.length > 0 ? domainTimelineRaw : undefined,
        customPersona,
        mood,
        attachedDocuments,
        builtinPersonaOverride,
        participantOverrides,
        stockContext: mergedStockContext,
        includeStockRules,
      }
    );

    // 1회성(scope=message) 문서는 사용 후 자동 비활성 — fire-and-forget
    if (sessionId && attachedDocuments.length > 0) {
      consumeOneShotDocuments(sessionId).catch(() => {});
    }

    // B: 실제 웹 검색이 필요할 때만 Google Search 툴을 활성화해 TTFT 단축.
    const useWebSearch = shouldUseWebSearch(
      message,
      persona as PersonaId,
      topic as NewsTopic,
      isCouncilFinal
    );

    // B7: 심층 분석이 필요한 경로에서만 Gemini thinking 토큰을 할당한다.
    //   - 뉴스봇(default): 빠른 팩트 전달이 우선이라 false.
    //   - 카운슬 최종 종합: 이미 컨텍스트 풍부하고 수렴이 목적이라 false.
    //   - 그 외 페르소나 대화: true (분석 프레임워크 + CoT 지시와 맞물려 효과).
    const enableThinking = persona !== "default" && !isCouncilFinal;

    // Gemini API 스트리밍 호출 (topic 전달하여 폴백 뉴스 소스 활용)
    const stream = streamChatResponse(
      conversationMessages,
      systemPrompt,
      useWebSearch,
      topic as NewsTopic,
      enableThinking,
    );

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const errorDetail = error instanceof Error ? error.message : String(error);
    console.error("Chat API error:", errorDetail, error);
    return NextResponse.json(
      { error: `서버 오류: ${errorDetail}` },
      { status: 500 }
    );
  }
}
