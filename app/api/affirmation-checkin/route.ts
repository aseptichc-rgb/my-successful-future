/**
 * "성공한 나의 모습" 다짐 따라쓰기 체크인 API.
 *
 * - POST { ymd?, texts: string[] } : 본인이 미리 설정한 다짐 N개를 그대로 다시 적어 제출.
 *   서버에서 N개 모두 일치하면 오늘 체크인 + 스트릭 갱신, 일치 안 하면 200 + matched:false.
 *
 * 한도: affirmationCheckin (`lib/constants/quota.ts`) — 오타 후 재시도까지 여유 있게 12회/일.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyRequestUser, AuthError } from "@/lib/authServer";
import { isValidYmd } from "@/lib/dailyMotivation";
import {
  checkinAffirmations,
  todayKstYmd,
  AffirmationCheckinError,
} from "@/lib/affirmationCheckin";
import { enforceQuota, QuotaExceededError } from "@/lib/quota";

export const maxDuration = 10;

const MAX_TEXTS = 10;
const MAX_TEXT_LEN_PAYLOAD = 240; // 60자 * 4 (multibyte/whitespace 여유)

interface PostBody {
  ymd?: string;
  texts?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    const me = await verifyRequestUser(request);

    let body: PostBody = {};
    try {
      body = (await request.json()) as PostBody;
    } catch {
      // 빈 바디 → 아래 검증에서 400.
    }

    const ymd = typeof body.ymd === "string" && isValidYmd(body.ymd) ? body.ymd : todayKstYmd();
    if (!Array.isArray(body.texts)) {
      return NextResponse.json({ error: "다짐 텍스트 배열이 필요합니다." }, { status: 400 });
    }
    if (body.texts.length === 0 || body.texts.length > MAX_TEXTS) {
      return NextResponse.json(
        { error: `다짐은 1~${MAX_TEXTS}개여야 합니다.` },
        { status: 400 },
      );
    }
    const texts: string[] = [];
    for (const t of body.texts) {
      if (typeof t !== "string") {
        return NextResponse.json({ error: "다짐 항목은 모두 문자열이어야 합니다." }, { status: 400 });
      }
      if (t.length > MAX_TEXT_LEN_PAYLOAD) {
        return NextResponse.json({ error: "다짐 항목이 너무 깁니다." }, { status: 400 });
      }
      texts.push(t);
    }

    await enforceQuota(me.uid, "affirmationCheckin");

    const result = await checkinAffirmations({ uid: me.uid, ymd, texts });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof QuotaExceededError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    if (err instanceof AffirmationCheckinError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[affirmation-checkin POST] 실패:", msg);
    return NextResponse.json({ error: "체크인을 저장하지 못했어요." }, { status: 500 });
  }
}
