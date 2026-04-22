import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { withRetry } from "@/lib/gemini";

export const maxDuration = 30;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(request: NextRequest) {
  try {
    const { content, source } = await request.json();

    if (!content) {
      return NextResponse.json(
        { error: "content는 필수입니다." },
        { status: 400 }
      );
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const result = await withRetry(() => model.generateContent(
      `다음 뉴스 내용을 한국어로 요약해주세요. 원문을 그대로 재현하지 말고, AI가 재작성한 형태로 제공하세요.

헤드라인 → 핵심 내용 3줄 → 배경 설명 순으로 구성해주세요.
출처: ${source || "미상"}

뉴스 내용:
${content}`
    ));

    const summary = result.response.text();

    return NextResponse.json({ summary });
  } catch (error) {
    console.error("Summary API error:", error);
    return NextResponse.json(
      { error: "요약 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
