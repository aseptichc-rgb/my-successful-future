/**
 * 온보딩 Step 2 맞춤 제안 API.
 *
 * - POST { dream: string, language?: string }
 *   → { ok: true, suggestions: { declarations: string[], goals: string[] } | null }
 *
 * 꿈 문장은 아직 Firestore 에 저장되기 전(저장은 Step 2 완료 시점)이라 바디로 받는다.
 * language 도 바디를 신뢰한다 — Step 0 의 언어 저장이 실패했을 수 있고, 그 경우
 * 사용자가 실제로 보고 있는 화면 언어를 아는 쪽은 클라이언트뿐이다.
 *
 * 결제 게이트를 걸지 않는다(verifyRequestUser): 온보딩은 체험 클레임이 아직 전파되기
 * 전에도 반드시 끝까지 진행돼야 하는 경로다. 대신 일별 한도(onboardingSuggest)로 막는다.
 *
 * 실패 정책: 생성/파싱 실패는 200 + suggestions:null 로 나가고 화면은 정적 예시를 쓴다.
 * 온보딩이 이 API 때문에 멈추는 경우는 없어야 한다.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyRequestUser, AuthError } from "@/lib/authServer";
import { enforceQuota, QuotaExceededError } from "@/lib/quota";
import { suggestOnboardingLines } from "@/lib/onboardingSuggest";
import { DREAM_MIN_LEN_FOR_SUGGEST, FUTURE_SELF_FIELD_MAX } from "@/lib/futureSelf";
import { normalizeLanguage } from "@/lib/llmLang";

export const maxDuration = 15;

interface PostBody {
  dream?: unknown;
  language?: unknown;
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

    // 길이 초과는 거절 대신 클램프 — 클라 maxLength 와 어긋나도 사용자가 다시 쓰게 만들 이유가 없다.
    const dream =
      typeof body.dream === "string" ? body.dream.trim().slice(0, FUTURE_SELF_FIELD_MAX) : "";
    if (dream.length < DREAM_MIN_LEN_FOR_SUGGEST) {
      return NextResponse.json(
        { error: `Your dream needs at least ${DREAM_MIN_LEN_FOR_SUGGEST} characters before we can suggest anything.` },
        { status: 400 },
      );
    }

    await enforceQuota(me.uid, "onboardingSuggest");

    const suggestions = await suggestOnboardingLines({
      uid: me.uid,
      dream,
      language: normalizeLanguage(body.language),
    });

    return NextResponse.json({ ok: true, suggestions });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof QuotaExceededError) {
      return NextResponse.json(
        { error: err.message, code: "quota_exceeded", limit: err.limit },
        { status: 429 },
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[onboarding/suggest POST] 실패:", msg);
    return NextResponse.json({ error: "Couldn't create personalized suggestions." }, { status: 500 });
  }
}
