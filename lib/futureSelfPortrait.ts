/**
 * "10년 후 나의 모습" 초상 핵심 로직.
 *
 * 온보딩 몰입형 7문항(futureSelfAnswers)을 종합해, 그 미래를 이미 이룬 사람의
 * 정체성을 2인칭 현재형("당신은 …")으로 그린 한 편의 초상을 만든다.
 * 미래 비전(`lib/futureVision.ts`)이 "매일 회전하는 어느 하루(1인칭)"라면,
 * 이 초상은 "답변이 바뀔 때만 다시 그려지는 고정 정체성 앵커(2인칭)"다.
 *
 * 설계는 futureVision/identities 컨벤션을 그대로 미러링한다.
 * - 저장소: users/{uid} 문서의 futureSelfPortrait 단일 객체 (일별 아님).
 * - 재생성: sourceHash(언어+persona+goals) 불일치 시 자동(무료), force 는 명시적 재생성.
 * - Gemini 호출은 try-catch, 실패/파싱오류 시 언어별 결정론적 폴백 → 결과가 비지 않는다.
 */
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { generateText } from "@/lib/gemini";
import { geminiLanguageName, normalizeLanguage } from "@/lib/llmLang";
import { hash32 } from "@/lib/dailyMotivation";
import { FUTURE_PERSONA_TRUNC } from "@/lib/constants/futurePersona";
import {
  FUTURE_SELF_DIMENSIONS,
  normalizeFutureSelfAnswers,
  type FutureSelfDimension,
} from "@/lib/futureSelf";
import type { FutureSelfAnswers, FutureSelfPortrait, UserLanguage } from "@/types";

/** 초상 컨텍스트에 넣을 목표 최대 개수 — 비전과 동일하게 넉넉히. */
const MAX_GOALS_FOR_PORTRAIT = 6;
/** title+본문+하이라이트 JSON 이 잘리지 않을 만큼 (비전 1400 보다 짧은 출력물). */
const PORTRAIT_MODEL_TOKENS = 1000;
/**
 * 초상은 "안정적 정체성 앵커"가 목적 — 매번 확 바뀌어야 하는 비전(1.0)과 달리
 * 일관되고 응집력 있는 서술이 중요해 온도를 중간으로 둔다.
 */
const PORTRAIT_TEMPERATURE = 0.6;
/** 출력 길이 클램프 — UI 가 깨지지 않도록 서버에서 잘라 둔다. */
const TITLE_MAX = 40;
const PORTRAIT_TEXT_MAX = 600;
const HIGHLIGHT_MAX = 60;
const MAX_HIGHLIGHTS = 3;
/** 폴백 본문에 끼워넣을 persona 발췌 길이. */
const PERSONA_EXCERPT = 120;

/** 프롬프트에 붙일 차원별 영어 라벨 (프롬프트는 영어, 출력 언어만 강제). */
const DIMENSION_PROMPT_LABELS: Record<FutureSelfDimension, string> = {
  dream: "The dream they truly want to reach",
  daily: "An ordinary day in their life",
  work: "Their work and standing among people",
  wealth: "Their assets and financial life",
  family: "Life with their family",
  achievements: "What they have achieved by then",
  respect: "How people regard and respect them",
  growth: "Their body, mind, and ongoing growth",
};

interface PortraitContext {
  displayName: string;
  /** 정규화된 구조화 답변 (없으면 빈 객체 — 레거시 사용자). */
  answers: FutureSelfAnswers;
  /** 합성/레거시 futurePersona (트렁케이트 적용). 구조화 답변이 없을 때의 재료. */
  futurePersona: string;
  goals: string[];
  language: UserLanguage;
}

async function fetchPortraitContext(uid: string): Promise<PortraitContext> {
  const snap = await getAdminDb().doc(`users/${uid}`).get();
  const data = snap.exists ? snap.data() ?? {} : {};
  const displayName = typeof data.displayName === "string" ? data.displayName : "사용자";
  const answersRaw =
    data.futureSelfAnswers && typeof data.futureSelfAnswers === "object"
      ? (data.futureSelfAnswers as FutureSelfAnswers)
      : {};
  const answers = normalizeFutureSelfAnswers(answersRaw);
  const personaRaw = typeof data.futurePersona === "string" ? data.futurePersona : "";
  const futurePersona = personaRaw.trim().slice(0, FUTURE_PERSONA_TRUNC);
  const goalsRaw = Array.isArray(data.goals) ? data.goals : [];
  const goals = goalsRaw
    .filter((g: unknown): g is string => typeof g === "string" && g.trim().length > 0)
    .map((g: string) => g.trim())
    .slice(0, MAX_GOALS_FOR_PORTRAIT);
  const language = normalizeLanguage(data.language);
  return { displayName, answers, futurePersona, goals, language };
}

/** 재생성 필요 판단용 해시 — identities.personaHash 와 동일한 컨벤션(16진 문자열). */
export function portraitSourceHash(ctx: PortraitContext): string {
  const answersSeed = FUTURE_SELF_DIMENSIONS.map((k) => ctx.answers[k] ?? "").join("|");
  const seed = `${ctx.language}\n${answersSeed}\n${ctx.futurePersona}\n${ctx.goals.join("|")}`;
  return hash32(seed).toString(16);
}

/** 구조화 답변 → 프롬프트용 라벨링 블록. 답변이 없으면 레거시 persona 원문. */
function buildMaterialBlock(ctx: PortraitContext): string {
  const lines: string[] = [];
  for (const key of FUTURE_SELF_DIMENSIONS) {
    const value = ctx.answers[key];
    if (!value) continue;
    lines.push(`- ${DIMENSION_PROMPT_LABELS[key]}: ${value}`);
  }
  if (lines.length > 0) return lines.join("\n");
  return ctx.futurePersona || "(they have not written their future self yet)";
}

/** Gemini 에 2인칭 현재형 초상을 요청하는 프롬프트. */
function buildPortraitPrompt(ctx: PortraitContext): string {
  const langName = geminiLanguageName(ctx.language);
  const goalsBlock =
    ctx.goals.length > 0
      ? ctx.goals.map((g, i) => `${i + 1}. ${g}`).join("\n")
      : "(no specific goals listed yet)";

  return `You are a master portrait writer. A person has described, dimension by dimension, who they will be 10 years from now. Weave their answers into ONE cohesive, vivid portrait of that future self — so real they can see themselves in it.

## What they wrote about their future self (10 years from now)
${buildMaterialBlock(ctx)}

## Goals they are walking toward right now
${goalsBlock}

## Writing rules
- Output language: EVERY human-readable string (title, portrait, highlights) MUST be written in ${langName}.
- Write "portrait" in SECOND person, present tense, as established fact — "You wake up in ...", "People come to you because ..." (in ${langName}; e.g. Korean uses "당신은 …").
- 4-6 sentences. Weave the dimensions they answered (daily life, position, wealth, family, achievements, respect, growth) into one flowing identity — do NOT list them mechanically one per sentence.
- Be CONCRETE: pull specific places, numbers, people, and objects from their answers. Where they were vague, sharpen gently — but NEVER invent a different life or add luxuries they didn't mention.
- SHOW who they have become through evidence (what they do, own, are asked for, are told) — never name emotions directly ("proud", "happy").
- Grounded and warm, not hype. No exclamation marks, no motivational-poster clichés.
- "title": one short evocative line naming who they have become (max ~20 chars in ${langName}) — an identity, not a slogan.
- "highlights": up to ${MAX_HIGHLIGHTS} ultra-short concrete proofs of this life (each max ~30 chars in ${langName}), lifted from their answers. Omit dimensions they didn't write about.
- If they wrote almost nothing above, gently invite them (in "portrait") to fill in their future self — do NOT fabricate a life.

## Output (a single JSON object on one line, NO other text, NO markdown fences)
{"title":"<one line>","portrait":"<4-6 sentences>","highlights":["<short proof>"]}`;
}

function clampText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Gemini 출력에서 첫 JSON 객체를 끄집어내 초상 구조로 검증/정규화. 실패 시 null. */
function parsePortrait(
  raw: string,
): { title: string; portrait: string; highlights: string[] } | null {
  const match = raw.trim().match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const title = clampText(parsed.title, TITLE_MAX);
    const portrait = clampText(parsed.portrait, PORTRAIT_TEXT_MAX);
    if (!title || !portrait) return null;
    const highlightsRaw = Array.isArray(parsed.highlights) ? parsed.highlights : [];
    const highlights: string[] = [];
    for (const h of highlightsRaw) {
      const text = clampText(h, HIGHLIGHT_MAX);
      if (!text) continue;
      highlights.push(text);
      if (highlights.length >= MAX_HIGHLIGHTS) break;
    }
    return { title, portrait, highlights };
  } catch {
    return null;
  }
}

/** 언어별 결정론적 폴백 — Gemini 실패/파싱 오류에도 초상이 비지 않도록. */
interface PortraitFallbackCopy {
  title: string;
  body: (persona: string) => string;
  emptyTitle: string;
  emptyBody: string;
}

const FALLBACK_PORTRAITS: Record<UserLanguage, PortraitFallbackCopy> = {
  ko: {
    title: "그 미래를 사는 사람",
    body: (p) =>
      `당신은 스스로 그린 모습 — ${p} — 을 이미 살아가는 사람입니다. 아침을 여는 방식에도, 사람들을 대하는 태도에도 그 삶의 결이 배어 있습니다. 주변은 당신이 걸어온 길을 신뢰하고, 당신은 그 신뢰에 조용한 실력으로 답합니다. 오늘의 한 걸음이 그 미래를 매일 조금씩 앞당기고 있습니다.`,
    emptyTitle: "아직 그리지 않은 초상",
    emptyBody:
      "10년 후의 당신을 아직 적지 않았어요. 하루의 풍경, 하는 일, 곁에 있는 사람들을 한 줄씩 적어보세요. 그러면 그 답을 모아 당신의 초상을 그려 드릴게요.",
  },
  en: {
    title: "The person living that future",
    body: (p) =>
      `You are already becoming the person you described — ${p}. It shows in how you start your mornings and how you carry yourself with people. Those around you trust the road you have walked, and you answer that trust with quiet competence. Every step you take today brings that future a little closer.`,
    emptyTitle: "A portrait not yet drawn",
    emptyBody:
      "You haven't written your future self yet. Jot down a line each about your days, your work, and the people beside you — and we'll weave them into your portrait.",
  },
  es: {
    title: "La persona que vive ese futuro",
    body: (p) =>
      `Ya te estás convirtiendo en la persona que describiste — ${p}. Se nota en cómo empiezas tus mañanas y en cómo te presentas ante los demás. Quienes te rodean confían en el camino que has recorrido, y tú respondes a esa confianza con una competencia serena. Cada paso de hoy acerca un poco más ese futuro.`,
    emptyTitle: "Un retrato aún sin dibujar",
    emptyBody:
      "Aún no has escrito tu yo del futuro. Anota una línea sobre tus días, tu trabajo y las personas a tu lado — y las uniremos en tu retrato.",
  },
  zh: {
    title: "活在那个未来的人",
    body: (p) =>
      `你已经在成为自己描绘的那个人 — ${p}。这体现在你开启清晨的方式，也体现在你与人相处的姿态。身边的人信任你走过的路，你以从容的实力回应这份信任。今天的每一步，都让那个未来更近一点。`,
    emptyTitle: "尚未描绘的画像",
    emptyBody:
      "你还没有写下十年后的自己。把你的日常、事业、身边的人各写一行 — 我们会把它们织成你的画像。",
  },
};

function buildFallbackPortrait(ctx: PortraitContext): {
  title: string;
  portrait: string;
  highlights: string[];
} {
  const copy = FALLBACK_PORTRAITS[ctx.language] ?? FALLBACK_PORTRAITS.ko;
  if (!ctx.futurePersona) {
    return { title: copy.emptyTitle, portrait: copy.emptyBody, highlights: [] };
  }
  const persona = ctx.futurePersona.slice(0, PERSONA_EXCERPT).replace(/\n/g, " ");
  return {
    title: copy.title,
    portrait: copy.body(persona).slice(0, PORTRAIT_TEXT_MAX),
    highlights: [],
  };
}

/**
 * "10년 후 나의 모습" 초상 1건을 보장한다.
 * - 저장된 초상의 sourceHash 가 현재 입력과 같으면 캐시 반환.
 * - 다르면(답변/목표/언어 변경) 자동 재생성 — 쿼터 미차감(호출부 정책).
 * - force=true: 같은 입력이어도 명시적 재생성("다시 생성" 버튼).
 * 재료가 하나도 없으면(작성 전) 작성 유도 폴백을 반환하되 저장하지 않는다
 * — 홈 카드는 저장된 초상 존재 여부로 게이트되므로 빈 초상이 노출되지 않는다.
 */
export async function ensureFutureSelfPortrait(opts: {
  uid: string;
  force?: boolean;
}): Promise<{ portrait: FutureSelfPortrait; cached: boolean }> {
  const { uid, force = false } = opts;
  const ctx = await fetchPortraitContext(uid);
  const sourceHash = portraitSourceHash(ctx);

  const userRef = getAdminDb().doc(`users/${uid}`);
  if (!force) {
    const snap = await userRef.get();
    const existing = snap.exists
      ? ((snap.data() ?? {}).futureSelfPortrait as FutureSelfPortrait | undefined)
      : undefined;
    if (existing && existing.sourceHash === sourceHash) {
      return { portrait: existing, cached: true };
    }
  }

  const hasMaterial = ctx.futurePersona.length > 0;
  let built: { title: string; portrait: string; highlights: string[] };
  if (!hasMaterial) {
    // 재료 없음 → Gemini 호출 없이 작성 유도 폴백 (저장 안 함).
    built = buildFallbackPortrait(ctx);
  } else {
    try {
      const raw = await generateText(
        buildPortraitPrompt(ctx),
        PORTRAIT_MODEL_TOKENS,
        PORTRAIT_TEMPERATURE,
        { uid, feature: "future_self_portrait" },
      );
      built = parsePortrait(raw) ?? buildFallbackPortrait(ctx);
    } catch (err) {
      console.warn(
        "[futureSelfPortrait] Gemini 실패, 결정론적 폴백 사용:",
        err instanceof Error ? err.message : err,
      );
      built = buildFallbackPortrait(ctx);
    }
  }

  const portrait: FutureSelfPortrait = {
    title: built.title,
    portrait: built.portrait,
    ...(built.highlights.length > 0 ? { highlights: built.highlights } : {}),
    sourceHash,
    generatedAt: Timestamp.now() as unknown as FutureSelfPortrait["generatedAt"],
  };

  if (hasMaterial) {
    try {
      await userRef.set({ futureSelfPortrait: portrait }, { merge: true });
    } catch (err) {
      // 저장 실패해도 이번 응답은 살린다 — 다음 ensure 가 다시 저장을 시도한다.
      console.warn(
        "[futureSelfPortrait] 저장 실패(응답은 반환):",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { portrait, cached: false };
}
