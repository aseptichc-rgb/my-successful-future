import { NextRequest, NextResponse } from "next/server";
import { runKeywordAlert } from "@/lib/keyword-alert-runner";
import type { KeywordAlertRequest, KeywordAlertResponse } from "@/types";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as KeywordAlertRequest;
    const { sessionId, keywords } = body;

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId는 필수입니다." }, { status: 400 });
    }
    if (!keywords || keywords.length === 0) {
      return NextResponse.json({ error: "키워드를 1개 이상 등록해주세요." }, { status: 400 });
    }

    const result = await runKeywordAlert(keywords);
    const res: KeywordAlertResponse = result;
    return NextResponse.json(res);
  } catch (error) {
    const errorDetail = error instanceof Error ? error.message : String(error);
    console.error("Keyword-alert API error:", errorDetail);
    return NextResponse.json(
      { error: `키워드 알림 오류: ${errorDetail}` },
      { status: 500 }
    );
  }
}
