import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getBotById } from "@/lib/externalBots";
import type { ChatStreamEvent } from "@/types";

export const maxDuration = 60;

interface ExternalBotApiRequest {
  botId: string;
  message: string;
  history?: { role: "user" | "assistant"; content: string }[];
}

const MAX_INPUT_LENGTH = 500;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ExternalBotApiRequest;

    if (!body.botId || !body.message) {
      return NextResponse.json(
        { error: "botId와 message는 필수입니다." },
        { status: 400 }
      );
    }

    if (body.message.length > MAX_INPUT_LENGTH) {
      return NextResponse.json(
        { error: `메시지는 ${MAX_INPUT_LENGTH}자 이내로 입력해주세요.` },
        { status: 400 }
      );
    }

    const bot = getBotById(body.botId);
    if (!bot) {
      return NextResponse.json(
        { error: `등록되지 않은 외부 봇입니다: ${body.botId}` },
        { status: 400 }
      );
    }

    const apiKey = process.env[bot.apiKeyEnv];
    if (!apiKey) {
      return NextResponse.json(
        { error: `${bot.apiKeyEnv} 환경 변수가 설정되지 않았습니다.` },
        { status: 500 }
      );
    }

    if (bot.provider !== "openai") {
      return NextResponse.json(
        { error: `지원하지 않는 프로바이더: ${bot.provider}` },
        { status: 400 }
      );
    }

    const client = new OpenAI({ apiKey });

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: bot.systemPrompt },
      ...(body.history ?? []).map((m) => ({
        role: m.role,
        content: m.content,
      })),
      { role: "user", content: body.message },
    ];

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: ChatStreamEvent) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };

        try {
          const completion = await client.chat.completions.create({
            model: bot.model,
            messages,
            stream: true,
          });

          let fullText = "";
          for await (const chunk of completion) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              send({ type: "text", content: delta });
            }
          }

          send({ type: "done", content: fullText });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("External bot stream error:", msg);
          send({ type: "error", error: `외부 봇 호출 실패: ${msg}` });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const errorDetail = error instanceof Error ? error.message : String(error);
    console.error("External bot API error:", errorDetail);
    return NextResponse.json(
      { error: `서버 오류: ${errorDetail}` },
      { status: 500 }
    );
  }
}
