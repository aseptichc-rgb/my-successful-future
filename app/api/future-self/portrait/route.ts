/**
 * "10년 후 나의 모습" 초상 API.
 *
 * - GET  : 저장된 초상 1건 반환 (없으면 exists:false)
 * - POST { force? } : 초상 보장 — 답변이 바뀌었으면 자동 재생성(무료),
 *   force=true 는 명시적 "다시 생성"으로 일별 한도에 카운트된다.
 *
 * 저장소: users/{uid}.futureSelfPortrait 단일 객체 (일별 문서 아님 — 정체성 앵커).
 * 핵심 로직은 `lib/futureSelfPortrait.ts` 에 분리 — 미래 비전(`/api/future-vision`)과 동일 구조.
 *
 * 프라이버시: 사용자 본인만 호출 가능 (verifyRequestUser). 다른 사용자 uid 로 위장 불가.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyRequestUser, requirePaidUser, AuthError } from "@/lib/authServer";
import { ensureFutureSelfPortrait } from "@/lib/futureSelfPortrait";
import { enforceQuota, QuotaExceededError } from "@/lib/quota";
import { getAdminDb } from "@/lib/firebase-admin";

export const maxDuration = 30;

interface PostBody {
  force?: boolean;
}

export async function GET(request: NextRequest) {
  try {
    const me = await verifyRequestUser(request);
    const snap = await getAdminDb().doc(`users/${me.uid}`).get();
    const portrait = snap.exists ? (snap.data() ?? {}).futureSelfPortrait : undefined;
    if (!portrait) {
      return NextResponse.json({ exists: false }, { status: 200 });
    }
    return NextResponse.json({ exists: true, portrait });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[future-self portrait GET] 실패:", msg);
    return NextResponse.json({ error: "꿈을 이룬 모습을 불러오지 못했습니다." }, { status: 500 });
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
    const force = body.force === true;

    // 명시적 "다시 생성"만 한도에 카운트한다.
    // 첫 생성/답변 변경에 따른 자동 재생성은 한도에 영향 없음(비전과 동일 정책).
    if (force) {
      await enforceQuota(me.uid, "futureSelfPortraitRegenerate");
    }

    const result = await ensureFutureSelfPortrait({ uid: me.uid, force });
    return NextResponse.json({ portrait: result.portrait, cached: result.cached });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof QuotaExceededError) {
      return NextResponse.json(
        { error: "초상 다시 그리기는 하루 5번까지 가능해요. 내일 다시 만나요." },
        { status: 429 },
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[future-self portrait POST] 실패:", msg);
    return NextResponse.json({ error: "꿈을 이룬 모습을 그리지 못했습니다." }, { status: 500 });
  }
}
