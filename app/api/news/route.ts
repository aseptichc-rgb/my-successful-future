import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { withRetry } from "@/lib/gemini";

export const maxDuration = 60;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(request: NextRequest) {
  try {
    const { query, topic } = await request.json();

    if (!query) {
      return NextResponse.json(
        { error: "query는 필수입니다." },
        { status: 400 }
      );
    }

    // Gemini + Google Search를 통한 뉴스 검색
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      tools: [{ googleSearch: {} } as never],
    });

    const result = await withRetry(() => model.generateContent(
      `다음 주제에 대한 최신 뉴스를 검색하고, 각 뉴스의 제목, 출처, 날짜, URL, 요약을 JSON 배열로 반환해주세요.
주제: ${query}
${topic ? `도메인: ${topic}` : ""}

반드시 아래 JSON 형식으로만 응답하세요:
[{"title": "...", "publisher": "...", "publishedAt": "...", "url": "...", "summary": "..."}]`
    ));

    const text = result.response.text();

    let news = [];
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        news = JSON.parse(jsonMatch[0]);
      }
    } catch {
      news = [];
    }

    return NextResponse.json({ news });
  } catch (error) {
    console.error("News API error:", error);
    return NextResponse.json(
      { error: "뉴스 검색 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
