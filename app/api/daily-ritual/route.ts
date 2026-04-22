import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { withRetry } from "@/lib/gemini";
import { buildMorningBriefPrompt, buildEveningReflectionPrompt } from "@/lib/prompts";
import type { DailyTaskSnapshot, GoalSnapshot, MoodKind } from "@/types";

export const maxDuration = 60;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const MODEL = "gemini-2.5-flash-lite";

type RitualKind = "morning" | "evening";

interface DailyRitualRequest {
  kind: RitualKind;
  currentPersona?: string;
  futurePersona: string;
  userMemory?: string;
  activeGoals?: GoalSnapshot[];
  dailyTasks?: DailyTaskSnapshot[];
  mood?: MoodKind;
}

interface DailyRitualResponse {
  content: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as DailyRitualRequest;
    const { kind, currentPersona, futurePersona, userMemory, activeGoals, dailyTasks, mood } = body;

    if (!kind || (kind !== "morning" && kind !== "evening")) {
      return NextResponse.json(
        { error: "kind는 'morning' 또는 'evening' 이어야 합니다." },
        { status: 400 }
      );
    }

    if (!futurePersona || futurePersona.trim().length === 0) {
      return NextResponse.json(
        { error: "futurePersona가 설정되지 않았습니다. 먼저 '미래의 나'를 정의해주세요." },
        { status: 400 }
      );
    }

    const systemPrompt =
      kind === "morning"
        ? buildMorningBriefPrompt(currentPersona, futurePersona, userMemory, activeGoals || [], dailyTasks, mood)
        : buildEveningReflectionPrompt(currentPersona, futurePersona, userMemory, activeGoals || [], dailyTasks, mood);

    const model = genAI.getGenerativeModel({
      model: MODEL,
      systemInstruction: systemPrompt,
    });

    // 간단한 트리거 메시지 (실제 내용은 system prompt의 todayContext 가 지시)
    const trigger =
      kind === "morning"
        ? "지금 아침이야. 오늘 하루를 시작하는 메시지를 보내줘."
        : "지금 저녁이야. 오늘 하루를 마무리하는 메시지를 보내줘.";

    const result = await withRetry(() => model.generateContent(trigger));
    const text = result.response.text();

    const res: DailyRitualResponse = { content: text };
    return NextResponse.json(res);
  } catch (error) {
    const errorDetail = error instanceof Error ? error.message : String(error);
    console.error("Daily ritual API error:", errorDetail);
    return NextResponse.json(
      { error: `데일리 리추얼 오류: ${errorDetail}` },
      { status: 500 }
    );
  }
}
