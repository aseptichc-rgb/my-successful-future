/**
 * 매일 바뀌는 "미래 일상" 비전 API.
 *
 * - GET  ?ymd=YYYY-MM-DD : 해당 날짜 비전 1개 반환 (없으면 exists:false)
 * - POST { ymd?, force? } : 오늘 비전 보장 (없으면 생성, force=true 면 "또 다른 하루" 재생성)
 *
 * 캐시 전략: users/{uid}/futureVisions/{ymd} 문서 1건. 같은 날엔 동일 비전 반환.
 * 핵심 로직은 `lib/futureVision.ts` 에 분리 — 동기부여 카드(`/api/daily-motivation`)와 동일한 구조.
 *
 * 프라이버시: 사용자 본인만 호출 가능 (verifyRequestUser). 다른 사용자 uid 로 위장 불가.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyRequestUser, requirePaidUser, AuthError } from "@/lib/authServer";
import { ensureFutureVision } from "@/lib/futureVision";
import { isValidYmd, todayKst, resolveRequestYmd } from "@/lib/dailyMotivation";
import { enforceQuota, QuotaExceededError } from "@/lib/quota";
import { getAdminDb } from "@/lib/firebase-admin";

export const maxDuration = 30;

interface PostBody {
  ymd?: string;
  force?: boolean;
}

export async function GET(request: NextRequest) {
  try {
    const me = await verifyRequestUser(request);
    const url = new URL(request.url);
    const ymdParam = url.searchParams.get("ymd");
    const ymd = ymdParam && isValidYmd(ymdParam) ? ymdParam : todayKst();

    const ref = getAdminDb().doc(`users/${me.uid}/futureVisions/${ymd}`);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ exists: false, ymd }, { status: 200 });
    }
    return NextResponse.json({ exists: true, vision: snap.data() });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[future-vision GET] 실패:", msg);
    return NextResponse.json({ error: "Couldn't load your future day." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // LLM 생성 경로 — ENTITLEMENT_REQUIRED=true 시 결제/체험 사용자만 통과.
    const me = await requirePaidUser(request);
    let body: PostBody = {};
    try {
      body = (await request.json()) as PostBody;
    } catch {
      // 빈 바디 허용
    }
    // 임의 미래/과거 날짜로 문서를 대량 생성해 쿼터를 우회하지 못하도록 [어제, 오늘] 로 제한.
    const ymd = resolveRequestYmd(body.ymd);
    const force = body.force === true;

    // "또 다른 하루 보기" 재생성 호출만 한도에 카운트한다.
    // 첫 비전 생성(force=false, 캐시 미스)은 한도에 영향 없음.
    if (force) {
      await enforceQuota(me.uid, "futureVisionRegenerate");
    }

    const result = await ensureFutureVision({ uid: me.uid, ymd, force });
    return NextResponse.json({ vision: result.vision, cached: result.cached });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof QuotaExceededError) {
      return NextResponse.json(
        { error: "You can picture another day up to 5 times a day. See you tomorrow." },
        { status: 429 },
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[future-vision POST] 실패:", msg);
    return NextResponse.json({ error: "Couldn't picture your future day." }, { status: 500 });
  }
}
