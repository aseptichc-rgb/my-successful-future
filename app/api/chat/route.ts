import { NextRequest, NextResponse } from "next/server";
import { streamChatResponse } from "@/lib/gemini";
import { buildSystemPrompt } from "@/lib/prompts";
import { getAdminDb } from "@/lib/firebase-admin";
import { loadReferenceDocumentsForUser } from "@/lib/googleDocs";
import { getAdminAuth } from "@/lib/firebase-admin";
import { getRecentArticlesForPersona } from "@/lib/personaNewsCollector";
import { isBuiltinPersona, PERSONAS } from "@/lib/personas";
import { mergePersona } from "@/lib/persona-resolver";
import { buildStockContext, fetchMarketOverview } from "@/lib/stockSource";
import { buildFinanceNewsContext } from "@/lib/naverFinanceNews";
import type { PersonaOverride } from "@/types";
import type { BuiltinPersonaId, NewsTopic, PersonaId, GoalSnapshot, DailyTaskSnapshot, MoodKind } from "@/types";

export const maxDuration = 60;

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
  activeGoals?: GoalSnapshot[];
  dailyTasks?: DailyTaskSnapshot[];
  personaMemory?: string;
  councilContext?: { personaName: string; content: string; isUser?: boolean }[];
  isCouncilFinal?: boolean;
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

    const { message, history = [], topic = "전체", persona = "default", participants, userPersona, futurePersona, userMemory, activeGoals, dailyTasks, personaMemory, councilContext, isCouncilFinal, useCollectedNews, customPersona, mood, sessionId } = body;

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

    // 모든 외부 조회를 한 번에 병렬 실행 — 순차 대기를 최소화
    const [sessionDocs, referenceDocs, stockContext, marketOverview, financeNewsContext, collectedArticlesRaw, personaOverrideSnap] = await Promise.all([
      sessionId ? loadActiveDocuments(sessionId) : Promise.resolve([]),
      loadReferenceDocumentsForUser(authedUid, persona as string | undefined),
      buildStockContext(message).catch((err) => {
        console.warn("[chat] 주식 시세 조회 실패, 시세 컨텍스트 없이 진행:", err);
        return null;
      }),
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
      // 토론 모드: 페르소나 자동수집 기사 조회
      (useCollectedNews && isBuiltinPersona(persona as string))
        ? getRecentArticlesForPersona(persona as BuiltinPersonaId, 5).catch(() => [])
        : Promise.resolve([]),
      // 빌트인 페르소나 오버라이드 조회
      (authedUid && isBuiltinPersona(persona as string) && persona !== "future-self")
        ? getAdminDb().collection("users").doc(authedUid).collection("personaOverrides").doc(persona as string).get().catch(() => null)
        : Promise.resolve(null),
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
    if (personaOverrideSnap && personaOverrideSnap.exists) {
      const ov = personaOverrideSnap.data() as PersonaOverride;
      const merged = mergePersona(PERSONAS[persona as keyof typeof PERSONAS], ov);
      builtinPersonaOverride = {
        name: merged.name,
        icon: merged.icon,
        description: merged.description,
        systemPromptAddition: merged.systemPromptAddition,
      };
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

    // 시스템 프롬프트 빌드 (lib/prompts.ts에서만 관리)
    const systemPrompt = buildSystemPrompt(
      topic as NewsTopic,
      persona as PersonaId,
      participants as PersonaId[] | undefined,
      userPersona,
      futurePersona,
      userMemory,
      activeGoals,
      {
        dailyTasks,
        personaMemory,
        councilContext,
        isCouncilFinal,
        collectedArticles,
        customPersona,
        mood,
        attachedDocuments,
        builtinPersonaOverride,
        stockContext: mergedStockContext,
      }
    );

    // 1회성(scope=message) 문서는 사용 후 자동 비활성 — fire-and-forget
    if (sessionId && attachedDocuments.length > 0) {
      consumeOneShotDocuments(sessionId).catch(() => {});
    }

    // Gemini API 스트리밍 호출 (topic 전달하여 폴백 뉴스 소스 활용)
    const stream = streamChatResponse(conversationMessages, systemPrompt, true, topic as NewsTopic);

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
