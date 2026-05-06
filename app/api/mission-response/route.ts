/**
 * 카드 미션 응답 저장 API.
 *
 * - POST { ymd?, text } : 본인 카드 한 장에 한 줄(60자 이내) 응답을 기록.
 *   첫 응답이면 정체성 라벨 카운터 +1, 이후 수정은 카운트 영향 없음.
 *
 * 한도: missionResponse (`lib/constants/quota.ts`) — 첫 저장 + 수정 합산 5회/일.
 *       악성/실수 도배를 막기 위함이며 정상 사용엔 영향 없음.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyRequestUser, AuthError } from "@/lib/authServer";
import { isValidYmd, todayKst } from "@/lib/dailyMotivation";
import { saveMissionResponse, MissionResponseError } from "@/lib/missionResponse";
import { enforceQuota, QuotaExceededError } from "@/lib/quota";

export const maxDuration = 15;

const RESPONSE_MAX_LEN = 60;

interface PostBody {
  ymd?: string;
  text?: string;
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

    const ymd = body.ymd && isValidYmd(body.ymd) ? body.ymd : todayKst();
    const text = typeof body.text === "string" ? body.text : "";
    if (!text.trim()) {
      return NextResponse.json({ error: "응답 텍스트를 입력해주세요." }, { status: 400 });
    }
    if (text.length > RESPONSE_MAX_LEN * 4) {
      // 입력단에서 60자 가드를 걸지만, 서버에서도 비정상 페이로드 차단.
      return NextResponse.json({ error: "응답이 너무 길어요." }, { status: 400 });
    }

    await enforceQuota(me.uid, "missionResponse");

    const saved = await saveMissionResponse({ uid: me.uid, ymd, text });
    return NextResponse.json({ ok: true, ...saved });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof QuotaExceededError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    if (err instanceof MissionResponseError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[mission-response POST] 실패:", msg);
    return NextResponse.json({ error: "응답을 저장하지 못했어요." }, { status: 500 });
  }
}
