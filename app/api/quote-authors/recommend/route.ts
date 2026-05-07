/**
 * POST /api/quote-authors/recommend
 *
 * 사용자의 목표·미래상을 토대로, 명언을 받아 좋을 만한 실존 인물 5~7명을 추천한다.
 * 응답은 단순 배열: { authors: string[] }
 *
 * 인증: Authorization: Bearer <Firebase ID Token>.
 * 출력 언어는 사용자 프로필의 language 를 따른다 (ko/en/es/zh).
 */
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyRequestUser, AuthError } from "@/lib/authServer";
import { generateText } from "@/lib/gemini";
import type { UserLanguage } from "@/types";

export const maxDuration = 20;

const MAX_AUTHORS = 7;
const FUTURE_PERSONA_TRUNC = 280;
const MODEL_TOKENS = 200;

interface UserCtx {
  futurePersona: string;
  goals: string[];
  language: UserLanguage;
}

function normalizeLanguage(raw: unknown): UserLanguage {
  return raw === "en" || raw === "es" || raw === "zh" || raw === "ko" ? raw : "ko";
}

function geminiLanguageName(lang: UserLanguage): string {
  switch (lang) {
    case "en": return "English";
    case "es": return "Spanish";
    case "zh": return "Simplified Chinese";
    case "ko":
    default: return "Korean";
  }
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
  const language = normalizeLanguage(data.language);
  return { futurePersona, goals, language };
}

function buildPrompt(ctx: UserCtx): string {
  const langName = geminiLanguageName(ctx.language);
  const goalsBlock =
    ctx.goals.length > 0 ? ctx.goals.map((g, i) => `${i + 1}. ${g}`).join("\n") : "(none)";
  return `You are a curator who recommends 5-7 real people (philosophers, founders, scientists, writers, leaders) whose words would best help this user along their path.

## User
- Future self in 10 years: ${ctx.futurePersona || "(not written)"}
- Goals:
${goalsBlock}

## Selection rules
- Pick people whose actual writings/speeches resonate with this user's direction.
- Mix Eastern and Western voices, both ancient and modern.
- Skip generic self-help personalities; favor figures with verifiable, well-documented quotes.
- IMPORTANT: write each name in ${langName}.
  - For ${langName}="Korean": "프리드리히 니체", "스티브 잡스".
  - For ${langName}="English": "Friedrich Nietzsche", "Steve Jobs".
  - For ${langName}="Spanish": "Friedrich Nietzsche", "Steve Jobs", "Gabriel García Márquez".
  - For ${langName}="Simplified Chinese": "弗里德里希·尼采", "史蒂夫·乔布斯".

## Output (a single JSON object on one line, NO other text)
{"authors":["name1","name2", ... ]}`;
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

/** 언어별 6인 폴백 — Gemini 침묵 시에도 셀렉트 박스가 비지 않도록. */
const FALLBACK_AUTHORS: Readonly<Record<UserLanguage, ReadonlyArray<string>>> = {
  ko: ["프리드리히 니체", "스티브 잡스", "공자", "일론 머스크", "정주영", "마르쿠스 아우렐리우스"],
  en: ["Friedrich Nietzsche", "Steve Jobs", "Confucius", "Marcus Aurelius", "Maya Angelou", "Marie Curie"],
  es: ["Friedrich Nietzsche", "Steve Jobs", "Confucio", "Marco Aurelio", "Gabriel García Márquez", "Frida Kahlo"],
  zh: ["弗里德里希·尼采", "史蒂夫·乔布斯", "孔子", "马可·奥勒留", "鲁迅", "苏轼"],
};

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

    if (authors.length === 0) {
      authors = (FALLBACK_AUTHORS[ctx.language] ?? FALLBACK_AUTHORS.ko).slice();
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
    return NextResponse.json({ error: "Failed to load recommendations." }, { status: 500 });
  }
}
