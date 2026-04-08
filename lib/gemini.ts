import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ChatStreamEvent } from "@/types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const MODEL = "gemini-2.0-flash";

interface MessageParam {
  role: "user" | "assistant";
  content: string;
}

export function streamChatResponse(
  messages: MessageParam[],
  systemPrompt: string,
  useWebSearch: boolean = true
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        const model = genAI.getGenerativeModel({
          model: MODEL,
          systemInstruction: systemPrompt,
          ...(useWebSearch && {
            tools: [{ googleSearch: {} } as never],
          }),
        });

        // Gemini 형식으로 대화 히스토리 변환
        const history = messages.slice(0, -1).map((msg) => ({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content }],
        }));

        const lastMessage = messages[messages.length - 1];

        const chat = model.startChat({ history });
        const result = await chat.sendMessageStream(lastMessage.content);

        let fullText = "";

        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) {
            fullText += text;
            const sseData: ChatStreamEvent = { type: "text", content: text };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(sseData)}\n\n`)
            );
          }
        }

        const doneData: ChatStreamEvent = {
          type: "done",
          content: fullText,
        };
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(doneData)}\n\n`)
        );
        controller.close();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
        const errorData: ChatStreamEvent = {
          type: "error",
          error: errorMessage,
        };
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`)
        );
        controller.close();
      }
    },
  });
}
