/**
 * GET/POST /api/encouragements/plan
 *
 * Vercel Cron이 매일 아침(KST 07:30 ≈ UTC 22:30)에 호출.
 * 모든 사용자에 대해 오늘자 격려 계획(페르소나별 랜덤 발사 시각)을 생성한다.
 *
 * 인증: Vercel Cron의 Authorization: Bearer ${CRON_SECRET}
 *      개발 환경(secret 미설정)에서는 통과.
 */

import { NextRequest, NextResponse } from "next/server";
import { planAllUsers } from "@/lib/encouragement";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function authorize(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization") || "";
  if (auth === `Bearer ${secret}`) return true;
  const queryKey = req.nextUrl.searchParams.get("key");
  return queryKey === secret;
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const results = await planAllUsers();
    const summary = results.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});
    return NextResponse.json({ ok: true, summary, count: results.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[encouragements/plan] 전체 실패:", msg);
    return NextResponse.json(
      { error: `격려 계획 생성 오류: ${msg}` },
      { status: 500 }
    );
  }
}

export const GET = POST;
