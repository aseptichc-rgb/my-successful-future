/**
 * 다짐 코치 API — 다짐 한 줄을 3가지 스타일(과정/질문/정체성)로 리라이트 제안.
 *
 * - POST { text: string } : AffirmationsEditor 의 코치 패널이 호출.
 *   따라쓰기 체크인 플로우와는 완전히 무관 — 제안은 사용자가 탭해 교체할 때만 반영된다.
 *
 * 한도: affirmationCoach (`lib/constants/quota.ts`).
 * 폴백 정책: Gemini 실패 시 suggestAffirmationRewrites 가 규칙 기반 리프레이즈로
 * 폴백하므로 이 라우트는 200 을 유지한다 — 단, 쿼터는 소진된다(기존 정책과 동일).
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyRequestUser, AuthError } from "@/lib/authServer";
import { enforceQuota, QuotaExceededError } from "@/lib/quota";
import { getAdminDb } from "@/lib/firebase-admin";
import { suggestAffirmationRewrites, COACH_INPUT_MAX_LEN } from "@/lib/affirmationCoach";
import { normalizeLanguage } from "@/lib/llmLang";

export const maxDuration = 15;

interface PostBody {
  text?: unknown;
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
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (text.length === 0 || text.length > COACH_INPUT_MAX_LEN) {
      return NextResponse.json(
        { error: `다짐은 1~${COACH_INPUT_MAX_LEN}자여야 합니다.` },
        { status: 400 },
      );
    }

    await enforceQuota(me.uid, "affirmationCoach");

    // 언어 조회 실패 시에도 ko 기본값으로 제안은 진행한다.
    let language = normalizeLanguage(undefined);
    try {
      const userSnap = await getAdminDb().doc(`users/${me.uid}`).get();
      language = normalizeLanguage(userSnap.get("language"));
    } catch (err) {
      console.error("[affirmation-coach] user 문서 조회 실패(기본값 사용):", err);
    }

    const suggestions = await suggestAffirmationRewrites({ uid: me.uid, text, language });
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
    console.error("[affirmation-coach POST] 실패:", msg);
    return NextResponse.json({ error: "코치 제안을 만들지 못했어요." }, { status: 500 });
  }
}
