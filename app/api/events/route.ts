/**
 * POST /api/events — 클라이언트 관측 이벤트 1건 기록.
 *
 * body: { name: EventName, props?: Record<string, string|number|boolean>, platform?: "android"|"ios"|"web" }
 *
 * - 이름은 lib/constants/events 화이트리스트만 받는다(그 외 400).
 * - uid 는 토큰에서 꺼낸다 — 본문의 uid 는 무시(위장 방지).
 * - 한도: events (lib/constants/quota.ts) — 루프 버그·도배가 컬렉션을 채우지 못하게 하루 상한.
 * - 응답은 항상 작게. 기록 실패도 200 — 계측은 best-effort 이고 클라가 재시도할 이유가 없다.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyRequestUser, AuthError } from "@/lib/authServer";
import { enforceQuota, QuotaExceededError } from "@/lib/quota";
import { logEvent } from "@/lib/events";
import { isEventName, isEventPlatform } from "@/lib/constants/events";

export const maxDuration = 10;

interface PostBody {
  name?: unknown;
  props?: unknown;
  platform?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    const me = await verifyRequestUser(request);

    let body: PostBody = {};
    try {
      body = (await request.json()) as PostBody;
    } catch {
      // 빈/깨진 바디 → 아래 검증에서 400.
    }

    if (!isEventName(body.name)) {
      return NextResponse.json({ error: "Unknown event name." }, { status: 400 });
    }
    const platform = isEventPlatform(body.platform) ? body.platform : null;

    await enforceQuota(me.uid, "events");
    await logEvent({ uid: me.uid, name: body.name, props: body.props, platform });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof QuotaExceededError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[events POST] 실패:", msg);
    return NextResponse.json({ error: "Couldn't record the event." }, { status: 500 });
  }
}
