/**
 * 매일 바뀌는 동기부여 카드 (배경화면용) API.
 *
 * - GET  ?ymd=YYYY-MM-DD : 해당 날짜 카드 1개 반환 (없으면 exists:false)
 * - POST { ymd?, force? } : 오늘 카드 보장 (없으면 생성, force=true 면 재생성)
 *
 * 캐시 전략: users/{uid}/dailyMotivations/{ymd} 문서 1건. 같은 날엔 동일 카드 반환.
 * 핵심 로직은 `lib/dailyMotivation.ts` 에 분리되어 위젯 라우트와 공유한다.
 *
 * 프라이버시: 사용자 본인만 호출 가능 (verifyRequestUser). 다른 사용자 uid 로 위장 불가.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyRequestUser, canUseAiFeatures, AuthError } from "@/lib/authServer";
import { ensureMotivation, isValidYmd, todayKst, resolveRequestYmd } from "@/lib/dailyMotivation";
import { enforceQuota, QuotaExceededError } from "@/lib/quota";

export const maxDuration = 30;

const OVERRIDE_AUTHOR_MAX_LEN = 60;

interface PostBody {
  ymd?: string;
  force?: boolean;
  /** 주간 회전·핀 일정과 무관하게 이 인물 명언을 즉시 받아본다. */
  overrideAuthor?: string;
}

export async function GET(request: NextRequest) {
  try {
    const me = await verifyRequestUser(request);
    const url = new URL(request.url);
    const ymdParam = url.searchParams.get("ymd");
    const ymd = ymdParam && isValidYmd(ymdParam) ? ymdParam : todayKst();

    const ref = getAdminDb().doc(`users/${me.uid}/dailyMotivations/${ymd}`);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ exists: false, ymd }, { status: 200 });
    }
    return NextResponse.json({ exists: true, motivation: snap.data() });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[daily-motivation GET] 실패:", msg);
    return NextResponse.json({ error: "Couldn't load today's card." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // 무료 티어도 오늘의 카드 1장은 계속 받는다(큐레이션으로 다운그레이드).
    // 재생성·작가 지정만 Pro 전용 — 아래에서 402 로 막는다. 정책표는 lib/constants/quota.ts.
    const me = await verifyRequestUser(request);
    const aiAllowed = canUseAiFeatures(me);
    let body: PostBody = {};
    try {
      body = (await request.json()) as PostBody;
    } catch {
      // 빈 바디 허용
    }
    // 임의 미래/과거 날짜로 문서를 대량 생성해 쿼터를 우회하지 못하도록 [어제, 오늘] 로 제한.
    const ymd = resolveRequestYmd(body.ymd);
    const force = body.force === true;
    const overrideAuthor =
      typeof body.overrideAuthor === "string" && body.overrideAuthor.trim().length > 0
        ? body.overrideAuthor.trim().slice(0, OVERRIDE_AUTHOR_MAX_LEN)
        : undefined;

    // 재생성/작가 지정은 Pro 전용 — 매번 Gemini 를 새로 호출하는 경로라 무료로 열 수 없다.
    // 첫 카드 보장(force=false)은 무료도 통과해 큐레이션 카드를 받는다.
    if ((force || overrideAuthor) && !aiAllowed) {
      throw new AuthError(
        402,
        "Another line needs lifetime access. Today's card stays available to you.",
      );
    }

    // "오늘의 또 다른 한마디" 재생성 호출만 한도에 카운트한다.
    // 첫 카드 생성 (force=false, 캐시 미스) 은 한도에 영향 없음.
    if (force || overrideAuthor) {
      await enforceQuota(me.uid, "motivationRegenerate");
    }

    const result = await ensureMotivation({
      uid: me.uid,
      ymd,
      // overrideAuthor 는 항상 새 카드를 만들어야 의미 있음
      force: force || Boolean(overrideAuthor),
      overrideAuthor,
      curatedOnly: !aiAllowed,
    });
    return NextResponse.json({ motivation: result.motivation, cached: result.cached });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof QuotaExceededError) {
      return NextResponse.json(
        { error: "You can get another line up to 5 times a day. See you tomorrow." },
        { status: 429 },
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[daily-motivation POST] 실패:", msg);
    return NextResponse.json({ error: "Couldn't create today's card." }, { status: 500 });
  }
}
