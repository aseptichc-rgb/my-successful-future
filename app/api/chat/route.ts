import { NextRequest, NextResponse } from "next/server";
import { streamChatResponse } from "@/lib/gemini";
import { buildSystemPrompt } from "@/lib/prompts";
import { getAdminDb } from "@/lib/firebase-admin";
import type { NewsTopic, PersonaId, GoalSnapshot, DailyTaskSnapshot, MoodKind } from "@/types";

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
  councilContext?: { personaName: string; content: string }[];
  isCouncilFinal?: boolean;
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

    const { message, history = [], topic = "전체", persona = "default", participants, userPersona, futurePersona, userMemory, activeGoals, dailyTasks, personaMemory, councilContext, isCouncilFinal, customPersona, mood, sessionId } = body;

    // 대화 히스토리 + 현재 메시지
    const conversationMessages = [
      ...history,
      { role: "user" as const, content: message },
    ];

    // 활성 첨부 문서 로드 (서버에서 직접 — 클라이언트 텍스트 신뢰 X)
    const attachedDocuments = sessionId ? await loadActiveDocuments(sessionId) : [];

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
        customPersona,
        mood,
        attachedDocuments,
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
