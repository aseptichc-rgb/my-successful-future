/**
 * POST /api/collect-news
 *
 * Vercel Cron이 매시 정각에 호출. 모든 빌트인 페르소나(future-self 제외)에 대해
 * "오늘 도래했지만 아직 수집되지 않은 슬롯"이 있으면 수집을 실행한다.
 *
 * 인증: Vercel Cron이 보내는 Authorization: Bearer ${CRON_SECRET} 헤더 검증.
 * (개발 환경에서는 ?key=local 로도 호출 가능)
 *
 * 결과 요약은 본문에 JSON으로 반환 (Vercel 크론 로그에서 가시적).
 */

import { NextRequest, NextResponse } from "next/server";
import { collectForPersona } from "@/lib/personaNewsCollector";
import type { BuiltinPersonaId } from "@/types";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// 자동 수집 대상 (future-self는 사용자 텍스트에 의존하므로 자동 수집에서 제외)
const TARGET_PERSONAS: BuiltinPersonaId[] = [
  "default",
  "entrepreneur",
  "healthcare-expert",
  "fund-trader",
  "tech-cto",
  "policy-analyst",
];

function authorize(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // 로컬/개발 편의: secret 미설정이면 통과
  if (!secret) return true;
  const auth = req.headers.get("authorization") || "";
  if (auth === `Bearer ${secret}`) return true;
  // Vercel Cron은 자동으로 위 헤더를 붙여줌
  const queryKey = req.nextUrl.searchParams.get("key");
  return queryKey === secret;
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results: Record<string, string> = {};
  await Promise.all(
    TARGET_PERSONAS.map(async (pid) => {
      const status = await collectForPersona(pid);
      results[pid] = status;
    })
  );

  const summary = Object.entries(results).reduce<Record<string, number>>(
    (acc, [, status]) => {
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    {}
  );

  return NextResponse.json({ ok: true, summary, results });
}

// Vercel Cron은 GET 으로도 호출할 수 있게 한다.
export const GET = POST;
