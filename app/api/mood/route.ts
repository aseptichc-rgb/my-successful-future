import { NextRequest, NextResponse } from "next/server";
import { generateText } from "@/lib/gemini";
import type { MoodKind } from "@/types";

export const maxDuration = 20;

interface MoodRequest {
  recentUserMessages: string[];
}

const MOOD_PROMPT = `당신은 사용자의 최근 메시지에서 감정 상태를 분류하는 심리 분석 어시스턴트입니다.

분류 카테고리 (정확히 하나만 선택):
- warm: 안정적, 평온, 감사, 따뜻함이 느껴짐
- stressed: 스트레스, 불안, 과부하, 압박, 걱정이 느껴짐
- flat: 무기력, 의욕 없음, 감정 평탄, 피로
- elated: 흥분, 성취감, 높은 에너지, 기쁨

판단 기준:
- 최근 메시지들의 내용·어조·주제에서 드러나는 감정
- 한 메시지의 표면적 단어가 아니라 전체적 맥락
- 판단이 애매하면 warm 으로
- 메시지가 너무 짧거나 중립적이면 warm 으로

출력 형식:
정확히 아래 4개 단어 중 하나만 출력. 다른 설명, 인사, 마크다운, 구두점 금지.
warm / stressed / flat / elated`;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as MoodRequest;
    const { recentUserMessages } = body;

    if (!recentUserMessages || recentUserMessages.length === 0) {
      return NextResponse.json({ mood: "warm" as MoodKind });
    }

    const meaningful = recentUserMessages.filter((m) => m.trim().length >= 5);
    if (meaningful.length === 0) {
      return NextResponse.json({ mood: "warm" as MoodKind });
    }

    const prompt = `${MOOD_PROMPT}

## 최근 사용자 메시지 (오래된 것 → 최신 순)
${meaningful.map((m, i) => `${i + 1}. ${m.slice(0, 300)}`).join("\n")}

## 분류 (정확히 단어 1개만):`;

    const raw = await generateText(prompt, 20);
    const cleaned = raw.trim().toLowerCase().replace(/[^a-z]/g, "");

    let mood: MoodKind = "warm";
    if (cleaned === "stressed") mood = "stressed";
    else if (cleaned === "flat") mood = "flat";
    else if (cleaned === "elated") mood = "elated";
    else if (cleaned === "warm") mood = "warm";

    return NextResponse.json({ mood });
  } catch (error) {
    const errorDetail = error instanceof Error ? error.message : String(error);
    console.error("Mood API error:", errorDetail);
    return NextResponse.json({ mood: "unknown" as MoodKind, error: errorDetail });
  }
}
