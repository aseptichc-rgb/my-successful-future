/**
 * POST /api/quote-authors/recommend
 *
 * 사용자의 목표·미래상을 토대로, 명언을 받아 좋을 만한 실존 인물 5~7명을 추천한다.
 * 응답은 단순 배열: { authors: string[] }
 *
 * 인증: Authorization: Bearer <Firebase ID Token>.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyRequestUser, AuthError } from "@/lib/authServer";
import { generateText } from "@/lib/gemini";

export const maxDuration = 20;

const MAX_AUTHORS = 7;
const FUTURE_PERSONA_TRUNC = 280;
const MODEL_TOKENS = 200;

interface UserCtx {
  futurePersona: string;
  goals: string[];
}

async function fetchUserCtx(uid: string): Promise<UserCtx> {
  const snap = await getAdminDb().doc(`users/${uid}`).get();
  const data = snap.exists ? snap.data() ?? {} : {};
  const futurePersona = (typeof data.futurePersona === "string" ? data.futurePersona : "").slice(
    0,
    FUTURE_PERSONA_TRUNC,
  );
  const goalsRaw = Array.isArray(data.goals) ? data.goals : [];
  const goals = goalsRaw
    .filter((g: unknown): g is string => typeof g === "string" && g.trim().length > 0)
    .map((g: string) => g.trim())
    .slice(0, 5);
  return { futurePersona, goals };
}

function buildPrompt(ctx: UserCtx): string {
  const goalsBlock =
    ctx.goals.length > 0 ? ctx.goals.map((g, i) => `${i + 1}. ${g}`).join("\n") : "(없음)";
  return `당신은 한 사람의 목표와 꿈에 가장 도움이 될 만한 실존 인물(철학자·기업가·과학자·문학가·정치가 등) 5~7명을 추천하는 큐레이터입니다.

## 사용자
- 10년 후 모습: ${ctx.futurePersona || "(미작성)"}
- 목표:
${goalsBlock}

## 추천 기준
- 사용자가 가는 길과 직접적으로 통하는 발자취·발언이 있는 인물.
- 동·서양 균형 있게. 오래된 인물(고전·역사)과 최근 인물 모두 포함.
- 진부한 자기계발 강사/유튜버 말고, 실제로 검증가능한 발언을 남긴 사람.
- 한국어 표기로 출력.

## 출력 (이 JSON 한 줄만, 다른 말 금지)
{"authors":["이름1","이름2", ... ]}`;
}

interface RecommendResponse {
  authors: string[];
}

function parseAuthors(raw: string): string[] {
  const match = raw.trim().match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const arr = Array.isArray(parsed.authors) ? parsed.authors : [];
    return arr
      .filter((a): a is string => typeof a === "string")
      .map((a) => a.trim())
      .filter((a) => a.length > 0 && a.length <= 60)
      .slice(0, MAX_AUTHORS);
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const me = await verifyRequestUser(request);
    const ctx = await fetchUserCtx(me.uid);

    let authors: string[] = [];
    try {
      const raw = await generateText(buildPrompt(ctx), MODEL_TOKENS);
      authors = parseAuthors(raw);
    } catch (err) {
      console.warn("[quote-authors/recommend] Gemini 실패:", err instanceof Error ? err.message : err);
    }

    // 폴백: 보편적으로 통하는 6명
    if (authors.length === 0) {
      authors = ["프리드리히 니체", "스티브 잡스", "공자", "일론 머스크", "정주영", "마르쿠스 아우렐리우스"];
    }

    const body: RecommendResponse = { authors };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[quote-authors/recommend] 실패:", msg);
    return NextResponse.json({ error: "추천 인물을 불러오지 못했습니다." }, { status: 500 });
  }
}
