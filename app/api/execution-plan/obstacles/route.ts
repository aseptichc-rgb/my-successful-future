/**
 * WOOP 실행설계 — 장애물 AI 제안 API.
 *
 * - POST { goal: string } : 목표 1개에 대해 "내 안의 장애물 + if-then 초안" 3개를 돌려준다.
 *   입력 컨텍스트: 목표 + futurePersona + 최근 7일 잘한 일(사용자에게 이미 통한 전략의 단서).
 *
 * 한도: obstacleSuggest (`lib/constants/quota.ts`).
 * 폴백 정책: Gemini 실패 시에도 suggestObstacles 가 언어별 템플릿으로 폴백하므로
 * 이 라우트는 200 을 유지한다 — 단, 쿼터는 소진된다(기존 생성 라우트들과 동일 정책).
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePaidUser, AuthError } from "@/lib/authServer";
import { enforceQuota, QuotaExceededError } from "@/lib/quota";
import { getAdminDb } from "@/lib/firebase-admin";
import { suggestObstacles } from "@/lib/executionPlan";
import { normalizeLanguage } from "@/lib/llmLang";
import { todayKstYmd } from "@/lib/kstDate";

export const maxDuration = 15;

const GOAL_MIN_LEN = 1;
const GOAL_MAX_LEN = 120;
/** 최근 잘한 일 컨텍스트 조회 기간(일). */
const RECENT_WINS_DAYS = 7;

interface PostBody {
  goal?: unknown;
}

/** 최근 N일 dailyEntries 에서 비어있지 않은 wins 를 최신순으로 모은다. 실패 시 빈 배열. */
async function fetchRecentWins(uid: string): Promise<string[]> {
  try {
    const db = getAdminDb();
    const snap = await db
      .collection(`users/${uid}/dailyEntries`)
      .orderBy("ymd", "desc")
      .limit(RECENT_WINS_DAYS)
      .get();
    const wins: string[] = [];
    for (const d of snap.docs) {
      const raw = d.get("wins");
      if (!Array.isArray(raw)) continue;
      for (const w of raw) {
        if (typeof w === "string" && w.trim().length > 0) wins.push(w.trim());
      }
    }
    return wins;
  } catch (err) {
    console.error("[execution-plan/obstacles] 최근 wins 조회 실패(컨텍스트 생략):", err);
    return [];
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
      // 빈 바디 → 아래 검증에서 400.
    }
    const goal = typeof body.goal === "string" ? body.goal.trim() : "";
    if (goal.length < GOAL_MIN_LEN || goal.length > GOAL_MAX_LEN) {
      return NextResponse.json(
        { error: `The goal must be ${GOAL_MIN_LEN}-${GOAL_MAX_LEN} characters.` },
        { status: 400 },
      );
    }

    await enforceQuota(me.uid, "obstacleSuggest");

    // 사용자 컨텍스트(futurePersona/언어) — 조회 실패 시에도 제안 자체는 진행한다.
    let futurePersona = "";
    let language = normalizeLanguage(undefined);
    try {
      const userSnap = await getAdminDb().doc(`users/${me.uid}`).get();
      const data = userSnap.data() ?? {};
      if (typeof data.futurePersona === "string") futurePersona = data.futurePersona;
      language = normalizeLanguage(data.language);
    } catch (err) {
      console.error("[execution-plan/obstacles] user 문서 조회 실패(기본값 사용):", err);
    }
    const recentWins = await fetchRecentWins(me.uid);

    const suggestions = await suggestObstacles({
      uid: me.uid,
      goal,
      futurePersona,
      recentWins,
      language,
    });

    return NextResponse.json({ ok: true, ymd: todayKstYmd(), suggestions });
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
    console.error("[execution-plan/obstacles POST] 실패:", msg);
    return NextResponse.json({ error: "Couldn't create obstacle suggestions." }, { status: 500 });
  }
}
