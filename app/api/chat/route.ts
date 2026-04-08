import { NextRequest, NextResponse } from "next/server";
import { streamChatResponse } from "@/lib/gemini";
import { buildSystemPrompt } from "@/lib/prompts";
import type { NewsTopic, PersonaId } from "@/types";

export const maxDuration = 60;

interface ChatApiRequest {
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
  topic?: NewsTopic;
  persona?: PersonaId;
  participants?: PersonaId[];
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ChatApiRequest;

    if (!body.message) {
      return NextResponse.json(
        { error: "message는 필수입니다." },
        { status: 400 }
      );
    }

    const { message, history = [], topic = "전체", persona = "default", participants } = body;

    // 대화 히스토리 + 현재 메시지
    const conversationMessages = [
      ...history,
      { role: "user" as const, content: message },
    ];

    // 시스템 프롬프트 빌드 (lib/prompts.ts에서만 관리)
    const systemPrompt = buildSystemPrompt(
      topic as NewsTopic,
      persona as PersonaId,
      participants as PersonaId[] | undefined
    );

    // Gemini API 스트리밍 호출
    const stream = streamChatResponse(conversationMessages, systemPrompt, true);

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
