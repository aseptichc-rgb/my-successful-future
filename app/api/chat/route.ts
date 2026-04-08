import { NextRequest, NextResponse } from "next/server";
import { streamChatResponse } from "@/lib/gemini";
import { buildSystemPrompt } from "@/lib/prompts";
import { addMessage, getMessages, updateSessionTitle, getSessionById } from "@/lib/firebase";
import type { ChatRequest, NewsTopic } from "@/types";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ChatRequest;

    if (!body.message || !body.sessionId) {
      return NextResponse.json(
        { error: "message와 sessionId는 필수입니다." },
        { status: 400 }
      );
    }

    const { message, sessionId, topic = "전체" } = body;

    // 사용자 메시지 Firestore 저장
    await addMessage(sessionId, "user", message);

    // 기존 대화 히스토리 조회 (컨텍스트용)
    const history = await getMessages(sessionId);
    const conversationMessages = history.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // 첫 메시지인 경우 세션 제목 자동 생성
    if (history.length <= 1) {
      const title = message.length > 50 ? message.slice(0, 50) + "..." : message;
      await updateSessionTitle(sessionId, title);
    }

    // 시스템 프롬프트 빌드 (lib/prompts.ts에서만 관리)
    const systemPrompt = buildSystemPrompt(topic as NewsTopic);

    // Gemini API 스트리밍 호출
    const stream = streamChatResponse(conversationMessages, systemPrompt, true);

    // 스트리밍 응답 반환 + 완료 후 Firestore 저장
    const [browserStream, saveStream] = stream.tee();

    // 백그라운드에서 전체 응답 수집 후 Firestore에 저장
    collectAndSave(saveStream, sessionId);

    return new Response(browserStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

async function collectAndSave(stream: ReadableStream<Uint8Array>, sessionId: string) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n\n");

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "done" && data.content) {
            fullText = data.content;
          }
        } catch {
          // JSON 파싱 실패 무시
        }
      }
    }

    if (fullText) {
      await addMessage(sessionId, "assistant", fullText);
    }
  } catch (error) {
    console.error("Failed to save assistant message:", error);
  }
}
