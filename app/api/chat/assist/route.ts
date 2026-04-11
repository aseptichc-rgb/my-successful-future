import { NextRequest, NextResponse } from "next/server";
import { generateText } from "@/lib/gemini";
import { buildSummarizePrompt, buildReplySuggestionPrompt, buildTranslatePrompt } from "@/lib/prompts";
import type { AssistRequest, AssistResponse } from "@/types";

export const maxDuration = 30;

function parseReplySuggestions(raw: string): string[] {
  const lines = raw.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    // "1. ...", "2. ...", "3. ..." 형식 파싱
    const m = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (m && m[2].trim().length > 0) {
      let text = m[2].trim();
      // 앞뒤 따옴표 제거
      text = text.replace(/^["'"""`]+|["'"""`]+$/g, "").trim();
      out.push(text);
    }
    if (out.length >= 3) break;
  }
  return out;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AssistRequest;
    const { mode, messages, currentUserName, targetLang, userPersona } = body;

    if (!mode || !messages || messages.length === 0) {
      return NextResponse.json(
        { error: "mode와 messages는 필수입니다." },
        { status: 400 }
      );
    }

    // 메시지 길이 제한 (최근 30개까지만)
    const recent = messages.slice(-30);

    let prompt: string;
    let maxTokens = 600;

    if (mode === "summarize") {
      if (recent.length < 2) {
        const empty: AssistResponse = {
          mode,
          result: "요약할 만한 대화가 아직 충분하지 않아요. 메시지가 더 쌓이면 다시 눌러보세요.",
        };
        return NextResponse.json(empty);
      }
      prompt = buildSummarizePrompt(recent, currentUserName);
      maxTokens = 500;
    } else if (mode === "reply") {
      if (recent.length === 0) {
        const empty: AssistResponse = {
          mode,
          result: "",
          suggestions: [],
        };
        return NextResponse.json(empty);
      }
      prompt = buildReplySuggestionPrompt(recent, currentUserName, userPersona);
      maxTokens = 400;
    } else if (mode === "translate") {
      // 번역 대상: 가장 최근 "상대"의 메시지를 우선. 없으면 마지막 메시지.
      const otherMessages = recent.filter((m) => !m.isMine);
      const target = otherMessages.length > 0 ? otherMessages[otherMessages.length - 1] : recent[recent.length - 1];
      if (!target || !target.content.trim()) {
        const empty: AssistResponse = {
          mode,
          result: "번역할 메시지가 없어요.",
        };
        return NextResponse.json(empty);
      }
      prompt = buildTranslatePrompt(target.content, targetLang || "한국어");
      maxTokens = 400;
    } else {
      return NextResponse.json(
        { error: "지원하지 않는 mode입니다." },
        { status: 400 }
      );
    }

    const raw = await generateText(prompt, maxTokens);
    const text = raw.trim();

    if (mode === "reply") {
      const suggestions = parseReplySuggestions(text);
      const res: AssistResponse = {
        mode,
        result: text,
        suggestions: suggestions.length > 0 ? suggestions : undefined,
      };
      return NextResponse.json(res);
    }

    const res: AssistResponse = { mode, result: text };
    return NextResponse.json(res);
  } catch (error) {
    const errorDetail = error instanceof Error ? error.message : String(error);
    console.error("Assist API error:", errorDetail);
    return NextResponse.json(
      { error: `AI 도우미 오류: ${errorDetail}` },
      { status: 500 }
    );
  }
}
