/**
 * GET/POST /api/encouragements/fire
 *
 * Vercel Cron이 매시 정각(KST 08-18 = UTC 23,0-9)에 호출.
 * dueMinute 가 도래했지만 아직 fired==false 인 격려 항목을 찾아
 * 페르소나의 1:1 세션에 짧은 격려 메시지를 게시한다.
 *
 * 인증: Vercel Cron의 Authorization: Bearer ${CRON_SECRET}
 *      개발 환경(secret 미설정)에서는 통과.
 */

import { NextRequest, NextResponse } from "next/server";
import { fireDueEncouragements } from "@/lib/encouragement";

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
    const results = await fireDueEncouragements();
    const summary = results.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});
    return NextResponse.json({ ok: true, summary, results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[encouragements/fire] 전체 실패:", msg);
    return NextResponse.json(
      { error: `격려 발사 오류: ${msg}` },
      { status: 500 }
    );
  }
}

export const GET = POST;
