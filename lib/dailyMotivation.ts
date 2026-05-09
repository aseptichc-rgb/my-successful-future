/**
 * 매일 바뀌는 동기부여 카드(개인화 한 마디) 핵심 로직.
 *
 * - `users/{uid}/dailyMotivations/{ymd}` 가 단일 진리원천.
 * - 같은 날 호출 시 캐시 반환, 없으면 Gemini 호출로 1건 생성.
 * - 라우트(`/api/daily-motivation`) 와 안드로이드 위젯 라우트(`/api/widget/today`) 가 공유.
 *
 * 인용 정책:
 *   1) 매주(KST 월요일 시작) 사용자별로 결정론적 "주간 인물 풀"이 회전된다.
 *      → 같은 인물의 명언만 반복되지 않고, 7일마다 새로운 8명 안팎의 풀로 교체.
 *   2) 사용자가 특정 인물을 핀하고 빈도(주 1~7일)를 설정해두면, 한 주 안에서
 *      결정론적으로 그 일수만큼 핀 인물의 명언이 우선 노출된다.
 *   3) 환각(가짜 인용)을 막기 위해 큐레이션 시드 `FAMOUS_QUOTES_SEED` 를 후보로 주고,
 *      Gemini 는 그 풀 안에서 한 건의 id 를 고르는 역할만 한다.
 */
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { generateText } from "@/lib/gemini";
import { type FamousQuoteSeed } from "@/lib/famousQuotesSeed";
import { getQuoteSeedPool } from "@/lib/famousQuoteCatalog";
import { ensureIdentities } from "@/lib/identities";
import type {
  DailyMotivation,
  MotivationGradient,
  MotivationMission,
  QuotePreference,
  UserLanguage,
} from "@/types";

/**
 * 사용자 language → Gemini 프롬프트 출력 언어 안내 문자열.
 * 알 수 없는 코드는 ko 로 폴백 (레거시 사용자).
 */
function geminiLanguageName(lang: UserLanguage | undefined): string {
  switch (lang) {
    case "en": return "English";
    case "es": return "Spanish";
    case "zh": return "Simplified Chinese";
    case "ko":
    default: return "Korean";
  }
}

function normalizeLanguage(raw: unknown): UserLanguage {
  return raw === "en" || raw === "es" || raw === "zh" || raw === "ko" ? raw : "ko";
}

export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const FUTURE_PERSONA_TRUNC = 280;
const MAX_GOALS_ON_CARD = 3;
/**
 * mission + identityTag 까지 같은 호출에서 출력하므로 토큰 한도를 키운다.
 * (기존 80은 id 한 줄 JSON 기준이었음.)
 */
const QUOTE_MODEL_TOKENS = 240;
const MISSION_PROMPT_MAX_LEN = 80;
const MISSION_PROMPT_MIN_LEN = 18;
/** 한 주에 노출되는 인물 풀의 목표 인원수 — 너무 좁으면 단조롭고, 너무 넓으면 회전 효과가 사라진다. */
const WEEKLY_AUTHOR_POOL_SIZE = 8;
const MIN_PINNED_DAYS = 0;
const MAX_PINNED_DAYS = 7;
const DAYS_PER_WEEK = 7;
/** "personal" 카테고리는 본인 명의(실존 인물 아님)이라 제외한다. */
const EXCLUDED_CATEGORIES = new Set(["personal"]);

const LIGHT_PALETTES: ReadonlyArray<Pick<MotivationGradient, "from" | "to" | "angle">> = [
  { from: "#FDE68A", to: "#FCA5A5", angle: 135 },
  { from: "#A7F3D0", to: "#93C5FD", angle: 145 },
  { from: "#FBCFE8", to: "#C7D2FE", angle: 130 },
  { from: "#FEF3C7", to: "#BFDBFE", angle: 150 },
  { from: "#FBE2C0", to: "#F4A261", angle: 140 },
  { from: "#E0F2FE", to: "#FBCFE8", angle: 160 },
];

const DARK_PALETTES: ReadonlyArray<Pick<MotivationGradient, "from" | "to" | "angle">> = [
  { from: "#1E1B4B", to: "#7C3AED", angle: 135 },
  { from: "#0F172A", to: "#0EA5E9", angle: 150 },
  { from: "#312E81", to: "#EC4899", angle: 145 },
  { from: "#064E3B", to: "#1E40AF", angle: 135 },
  { from: "#7F1D1D", to: "#1E1B4B", angle: 160 },
  { from: "#0F172A", to: "#7C3AED", angle: 125 },
];

/** KST 기준 YYYY-MM-DD */
export function todayKst(): string {
  const kst = new Date(Date.now() + KST_OFFSET_MS);
  return kst.toISOString().slice(0, 10);
}

export function isValidYmd(ymd: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd);
}

/** 결정론적 32-bit 해시 (FNV-1a). uid+ymd 같은 짧은 키에 충분. */
export function hash32(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

export function pickGradient(seed: string): MotivationGradient {
  const h = hash32(seed);
  const useDark = (h & 1) === 0;
  const palette = useDark ? DARK_PALETTES : LIGHT_PALETTES;
  const idx = (h >>> 1) % palette.length;
  return { ...palette[idx], tone: useDark ? "dark" : "light" };
}

/**
 * 사용자 언어별 후보 풀 + by-id 룩업 + 인물 목록을 lazy 캐싱.
 * 4개 풀이라 풀당 수십~백건 수준이고, 호출 시점에 1회씩만 만든다.
 */
interface LanguagePoolCache {
  candidates: ReadonlyArray<FamousQuoteSeed>;
  byId: ReadonlyMap<string, FamousQuoteSeed>;
  authors: ReadonlyArray<string>;
}

const POOL_CACHE = new Map<UserLanguage, LanguagePoolCache>();

function getLanguagePool(language: UserLanguage): LanguagePoolCache {
  const cached = POOL_CACHE.get(language);
  if (cached) return cached;
  const seedPool = getQuoteSeedPool(language);
  const candidates = seedPool.filter((q) => !EXCLUDED_CATEGORIES.has(q.category));
  const byId = new Map(candidates.map((q) => [q.id, q] as const));
  const authors = Array.from(
    new Set(
      candidates
        .map((q) => (typeof q.author === "string" ? q.author.trim() : ""))
        .filter((a) => a.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b, language === "ko" ? "ko" : language === "zh" ? "zh" : language === "es" ? "es" : "en"));
  const value = { candidates, byId, authors } as const;
  POOL_CACHE.set(language, value);
  return value;
}

/** YYYY-MM-DD (KST) → 1970-01-01 기준 epoch day. KST 자정을 정수일로 매핑. */
function epochDayKst(ymd: string): number {
  const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
  // Date.UTC 는 UTC 자정을 반환. 같은 일자에 대해 day-수만 추출하면 일관됨.
  return Math.floor(Date.UTC(y, (m ?? 1) - 1, d ?? 1) / 86400000);
}

/**
 * KST 기준 "이번 주 키" — 같은 주(월~일)면 같은 정수.
 * 1970-01-01(목)을 보정해 월요일 시작 주차로 정렬.
 */
function weekKeyKst(ymd: string): number {
  // epoch day 0 = 1970-01-01 (Thu). Mon-shifted: (day + 3) / 7
  return Math.floor((epochDayKst(ymd) + 3) / DAYS_PER_WEEK);
}

/** KST 기준 요일 인덱스 0..6 (Mon..Sun) */
function weekdayKst(ymd: string): number {
  return ((epochDayKst(ymd) + 3) % DAYS_PER_WEEK + DAYS_PER_WEEK) % DAYS_PER_WEEK;
}

/** 결정론적 Fisher-Yates 셔플. 시드 기반 mulberry32 PRNG 로 안정성 보장. */
function deterministicShuffle<T>(arr: ReadonlyArray<T>, seed: number): T[] {
  let t = seed >>> 0;
  const next = (): number => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * (uid, weekKey) 조합으로 결정론적인 주간 인물 풀을 만든다.
 * 한 주 동안 같은 풀을 쓰고, 다음 주엔 다른 풀로 회전한다.
 * authors 는 사용자 언어 풀에서 추출된 인물 목록을 받는다.
 */
function weeklyAuthorPool(
  uid: string,
  weekKey: number,
  authors: ReadonlyArray<string>,
): Set<string> {
  const seed = hash32(`${uid}:wk:${weekKey}`);
  const shuffled = deterministicShuffle(authors, seed);
  return new Set(shuffled.slice(0, Math.min(WEEKLY_AUTHOR_POOL_SIZE, shuffled.length)));
}

/**
 * 주(월~일) 안에서 어느 요일들이 "핀 인물 노출 일"인지 결정.
 * pinnedDaysPerWeek 만큼 0..6 중 결정론적으로 선택.
 */
function pinnedWeekdays(uid: string, weekKey: number, pinnedDaysPerWeek: number): Set<number> {
  const n = Math.max(MIN_PINNED_DAYS, Math.min(MAX_PINNED_DAYS, Math.floor(pinnedDaysPerWeek)));
  if (n <= 0) return new Set();
  if (n >= DAYS_PER_WEEK) return new Set([0, 1, 2, 3, 4, 5, 6]);
  const seed = hash32(`${uid}:pinday:${weekKey}`);
  const shuffled = deterministicShuffle([0, 1, 2, 3, 4, 5, 6], seed);
  return new Set(shuffled.slice(0, n));
}

interface UserContext {
  displayName: string;
  futurePersona: string;
  goals: string[];
  preference: QuotePreference;
  /** 사용자 UI / 카드 출력 언어. 미설정 시 "ko". */
  language: UserLanguage;
}

function buildPrompt(opts: {
  ctx: UserContext;
  ymd: string;
  candidates: ReadonlyArray<FamousQuoteSeed>;
  identityLabels: ReadonlyArray<string>;
  /** 매번 새 호출에서 다른 결과를 유도하는 가변 시드 (다시 받기 시 변경됨). */
  varietySalt: string;
  /** "다시 받기" 직전에 노출됐던 명언 — 같은 줄을 또 고르면 사용자에게 변화가 안 보임. */
  avoidQuote?: string;
}): string {
  const { ctx, ymd, candidates, identityLabels, varietySalt, avoidQuote } = opts;
  const langName = geminiLanguageName(ctx.language);
  const goalsBlock =
    ctx.goals.length > 0
      ? ctx.goals.map((g, i) => `${i + 1}. ${g}`).join("\n")
      : "(no goals listed yet)";

  const candidatesBlock = candidates
    .map((q) => `- ${q.id} | ${q.author ?? "Unknown"} | "${q.text}"`)
    .join("\n");

  const identitiesBlock = identityLabels.map((l) => `- ${l}`).join("\n");

  // 프롬프트는 영어 + 출력 언어를 명시하는 방식. 카드의 mission/identityTag 가
  // 사용자의 언어로 떨어지면서 후보 id 만 우리 풀의 영문 슬러그를 그대로 가져온다.
  return `You are a curator who picks one real-person quote that fits a person's goals and future self,
and a coach who turns that quote into a single active-recall mission line for today.

Today is ${ymd} (KST). For the user below, (1) pick ONE quote from the candidate list,
(2) write a single-line mission that turns the quote into a concrete action for today,
(3) pick one identity tag from the user's identity pool that this mission reinforces.

ALL human-readable text in your output (mission, linkedGoal, identityTag) MUST be written in ${langName}.
Identity labels are already provided in ${langName}; copy them verbatim.

## User
- Name: ${ctx.displayName}
- The version they want to become in 10 years: ${ctx.futurePersona || "(not written yet)"}
- Goals they're walking toward:
${goalsBlock}

## Candidate quotes (NEVER fabricate or paraphrase outside this list)
${candidatesBlock}

## Identity label pool (pick exactly one verbatim — do NOT invent new labels)
${identitiesBlock}

## Selection / writing rules
1. Quote: the line that best resonates with this user's goals and future self. Not a tired cliché.
2. Mission:
   - A concrete question or action prompt the user can answer in one short line (~60 chars).
   - Length ${MISSION_PROMPT_MIN_LEN}-${MISSION_PROMPT_MAX_LEN} characters in ${langName}.
   - When possible, link directly to one of the goals above (set linkedGoal to that goal's text verbatim).
   - Patterns like "What is the single biggest obstacle to ___ today?" / "What is the first step toward ___?".
   - No abstract encouragement ("you can do it"). Must trigger active retrieval.
3. identityTag: exactly one label from the pool above, copied verbatim. Do not invent new labels.
4. Variety seed: ${varietySalt} — if this value changes, actively pick a different quote/mission than last time.${
    avoidQuote
      ? `\n5. Last shown line: "${avoidQuote}" — do NOT pick the same line again. Choose a different candidate.`
      : ""
  }

## Output (a single JSON object on one line, NO other text)
{"id":"<one of the candidate ids verbatim>","mission":"<one-line mission in ${langName}>","linkedGoal":"<a goal text verbatim or empty>","identityTag":"<one label from the pool verbatim>"}`;
}

function sanitizePreference(raw: unknown): QuotePreference {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const author =
    typeof r.pinnedAuthor === "string" && r.pinnedAuthor.trim().length > 0
      ? r.pinnedAuthor.trim()
      : undefined;
  const daysRaw = r.pinnedDaysPerWeek;
  const days =
    typeof daysRaw === "number" && Number.isFinite(daysRaw)
      ? Math.max(MIN_PINNED_DAYS, Math.min(MAX_PINNED_DAYS, Math.floor(daysRaw)))
      : undefined;
  const pref: QuotePreference = {};
  if (author) pref.pinnedAuthor = author;
  if (typeof days === "number") pref.pinnedDaysPerWeek = days;
  return pref;
}

async function fetchUserContext(uid: string): Promise<UserContext> {
  const snap = await getAdminDb().doc(`users/${uid}`).get();
  const data = snap.exists ? snap.data() ?? {} : {};
  const displayName = typeof data.displayName === "string" ? data.displayName : "사용자";
  const futurePersonaRaw = typeof data.futurePersona === "string" ? data.futurePersona : "";
  const futurePersona = futurePersonaRaw.slice(0, FUTURE_PERSONA_TRUNC);
  const goalsRaw = Array.isArray(data.goals) ? data.goals : [];
  const goals = goalsRaw
    .filter((g: unknown): g is string => typeof g === "string" && g.trim().length > 0)
    .map((g: string) => g.trim())
    .slice(0, MAX_GOALS_ON_CARD);
  const preference = sanitizePreference(data.quotePreference);
  const language = normalizeLanguage(data.language);
  return { displayName, futurePersona, goals, preference, language };
}

interface PickedExtension {
  id: string;
  mission?: string;
  linkedGoal?: string;
  identityTag?: string;
}

/** Gemini 응답에서 첫 번째 JSON 객체를 끄집어내 id + (mission + identityTag) 를 꺼낸다. */
function parsePickedExtension(raw: string): PickedExtension | null {
  const trimmed = raw.trim();
  const match = trimmed.match(/\{[\s\S]*?\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const id = typeof parsed.id === "string" ? parsed.id.trim() : "";
    if (!id) return null;
    const mission =
      typeof parsed.mission === "string" && parsed.mission.trim().length > 0
        ? parsed.mission.trim().slice(0, MISSION_PROMPT_MAX_LEN)
        : undefined;
    const linkedGoal =
      typeof parsed.linkedGoal === "string" && parsed.linkedGoal.trim().length > 0
        ? parsed.linkedGoal.trim()
        : undefined;
    const identityTag =
      typeof parsed.identityTag === "string" && parsed.identityTag.trim().length > 0
        ? parsed.identityTag.trim()
        : undefined;
    return { id, mission, linkedGoal, identityTag };
  } catch {
    return null;
  }
}

/**
 * Gemini 가 던진 mission/identityTag 가 비었거나 라벨 풀 밖이면 폴백 미션을 만든다.
 * 카드는 어떤 경로에서도 mission 을 가져야 — 능동 인출 UI 가 끊기지 않도록.
 */
/** 언어별 폴백 미션 문구 — Gemini 가 침묵해도 카드 톤이 깨지지 않도록. */
const FALLBACK_PROMPTS: Record<UserLanguage, { withGoal: (g: string) => string; standalone: string; defaultTag: string }> = {
  ko: {
    withGoal: (g) => `오늘 "${g.slice(0, 24)}"을(를) 위해 처음 뗄 한 발은 무엇인가요?`,
    standalone: "오늘의 명언이 떠올리게 한 한 가지 행동을 적어보세요.",
    defaultTag: "성장하는 사람",
  },
  en: {
    withGoal: (g) => `What's the first step you can take today toward "${g.slice(0, 32)}"?`,
    standalone: "Write one action today's quote brought to mind.",
    defaultTag: "a person who keeps growing",
  },
  es: {
    withGoal: (g) => `¿Cuál es el primer paso que puedes dar hoy hacia "${g.slice(0, 32)}"?`,
    standalone: "Escribe una acción que la frase de hoy te haya inspirado.",
    defaultTag: "una persona que sigue creciendo",
  },
  zh: {
    withGoal: (g) => `今天为"${g.slice(0, 18)}"迈出的第一步是什么?`,
    standalone: "写下今日名言让你想到的一个行动。",
    defaultTag: "持续成长的人",
  },
};

function buildFallbackMission(
  identityLabels: ReadonlyArray<string>,
  goals: ReadonlyArray<string>,
  seed: string,
  language: UserLanguage = "ko",
): MotivationMission {
  const tpl = FALLBACK_PROMPTS[language] ?? FALLBACK_PROMPTS.ko;
  const tag =
    identityLabels.length > 0
      ? identityLabels[hash32(seed) % identityLabels.length]
      : tpl.defaultTag;
  const linkedGoal = goals.length > 0 ? goals[hash32(`${seed}:goal`) % goals.length] : undefined;
  const prompt = linkedGoal ? tpl.withGoal(linkedGoal) : tpl.standalone;
  return {
    prompt: prompt.slice(0, MISSION_PROMPT_MAX_LEN),
    ...(linkedGoal ? { linkedGoal } : {}),
    identityTag: tag,
  };
}

/** Gemini 출력의 mission/identityTag 가 유효한지 검증해 사용. 아니면 폴백. */
function resolveMission(
  picked: PickedExtension | null,
  identityLabels: ReadonlyArray<string>,
  goals: ReadonlyArray<string>,
  seed: string,
): MotivationMission {
  const tagOk =
    picked?.identityTag && identityLabels.includes(picked.identityTag) ? picked.identityTag : null;
  const promptOk =
    picked?.mission && picked.mission.length >= MISSION_PROMPT_MIN_LEN ? picked.mission : null;
  if (tagOk && promptOk) {
    const linkedGoal =
      picked?.linkedGoal && goals.includes(picked.linkedGoal) ? picked.linkedGoal : undefined;
    return {
      prompt: promptOk,
      identityTag: tagOk,
      ...(linkedGoal ? { linkedGoal } : {}),
    };
  }
  return buildFallbackMission(identityLabels, goals, seed);
}

/** 사용자 언어별 최후 폴백 — 풀 자체가 비었을 때만 도달. */
function languageFallbackQuote(language: UserLanguage): FamousQuoteSeed {
  switch (language) {
    case "en":
      return {
        id: "fallback_default_en",
        text: "It does not matter how slowly you go, as long as you do not stop.",
        author: "Confucius",
        category: "philosophy",
        language: "en",
      };
    case "es":
      return {
        id: "fallback_default_es",
        text: "No importa lo despacio que vayas, mientras no te detengas.",
        author: "Confucio",
        category: "philosophy",
        language: "en",
      };
    case "zh":
      return {
        id: "fallback_default_zh",
        text: "不积跬步,无以至千里。",
        author: "荀子",
        category: "philosophy",
        language: "ko",
      };
    case "ko":
    default:
      return {
        id: "fallback_default",
        text: "멈추지만 않는다면, 얼마나 천천히 가는가는 중요하지 않다.",
        author: "공자",
        category: "philosophy",
        language: "ko",
      };
  }
}

/** 주어진 후보 풀에서 (uid+ymd) 시드로 결정론적 폴백 1건. */
function deterministicFallback(
  uid: string,
  ymd: string,
  pool: ReadonlyArray<FamousQuoteSeed>,
  language: UserLanguage,
): FamousQuoteSeed {
  if (pool.length === 0) return languageFallbackQuote(language);
  const idx = hash32(`${uid}:${ymd}:fallback`) % pool.length;
  return pool[idx];
}

interface PickedQuote {
  text: string;
  author: string;
  source?: string;
  originalText?: string;
  originalLang?: string;
}

function toPickedQuote(seed: FamousQuoteSeed): PickedQuote {
  // tags 첫 항목을 출처 힌트(저작/연설)로 활용 — 시드의 자유 메타.
  const sourceTag = seed.tags && seed.tags.length > 0 ? seed.tags[0] : undefined;
  return {
    text: seed.text,
    author: seed.author ?? "미상",
    source: sourceTag,
    originalText: seed.originalText,
    originalLang: seed.originalLang,
  };
}

/**
 * 오늘 노출할 후보 풀(이번 한 건을 뽑을 대상)을 결정한다.
 * - overrideAuthor 가 있으면 → 그 인물의 명언만 (즉시 받아보기 버튼 경로).
 * - 핀 인물 + 오늘이 핀 요일이면 → 그 인물의 명언만.
 * - 그 외 → 이번 주 회전 풀에 속한 인물들의 명언.
 * - 어떤 사정으로 풀이 비면 → 전체 후보로 폴백.
 */
function resolveTodaysPool(
  uid: string,
  ymd: string,
  preference: QuotePreference,
  language: UserLanguage,
  overrideAuthor?: string,
): {
  pool: ReadonlyArray<FamousQuoteSeed>;
  reason: "override" | "pinned" | "weekly" | "all";
  /** 시드에 없는 free-text 인물명. pool 이 비어있을 때만 채워짐. */
  freeAuthor?: string;
} {
  const { candidates, authors } = getLanguagePool(language);
  const wk = weekKeyKst(ymd);
  const dow = weekdayKst(ymd);
  const pinnedDays = pinnedWeekdays(uid, wk, preference.pinnedDaysPerWeek ?? 0);

  if (overrideAuthor) {
    const pool = candidates.filter((q) => q.author === overrideAuthor);
    return pool.length > 0
      ? { pool, reason: "override" }
      : { pool: [], reason: "override", freeAuthor: overrideAuthor };
  }

  if (preference.pinnedAuthor && pinnedDays.has(dow)) {
    const target = preference.pinnedAuthor;
    const pinned = candidates.filter((q) => q.author === target);
    if (pinned.length > 0) return { pool: pinned, reason: "pinned" };
    // 시드에 없는 핀 인물이면 free-text 경로로 위임
    return { pool: [], reason: "pinned", freeAuthor: target };
  }

  const weeklyAuthors = weeklyAuthorPool(uid, wk, authors);
  const weekly = candidates.filter((q) => q.author && weeklyAuthors.has(q.author));
  if (weekly.length > 0) return { pool: weekly, reason: "weekly" };

  return { pool: candidates, reason: "all" };
}

/** 시드에 없는 free-text 인물명 → Gemini 로 그 사람의 실제 명언 1건과 미션/정체성 라벨을 같이 가져온다. */
function buildFreeAuthorPrompt(opts: {
  ctx: UserContext;
  ymd: string;
  author: string;
  identityLabels: ReadonlyArray<string>;
  varietySalt: string;
  avoidQuote?: string;
}): string {
  const { ctx, ymd, author, identityLabels, varietySalt, avoidQuote } = opts;
  const langName = geminiLanguageName(ctx.language);
  const goalsBlock =
    ctx.goals.length > 0
      ? ctx.goals.map((g, i) => `${i + 1}. ${g}`).join("\n")
      : "(no goals listed yet)";
  const identitiesBlock = identityLabels.map((l) => `- ${l}`).join("\n");
  return `You are a curator who recalls real human quotes accurately, and a coach who turns those quotes into a one-line action prompt for today.

Task: bring back ONE widely cited, verifiable line that "${author}" (a real or widely-known historical figure) actually said or wrote. Translate the quote into ${langName} naturally if it isn't already in that language. Then output a one-line mission that turns the quote into action for the user.

## User (pick the line that lands hardest on this user's goals and future)
- Future self in 10 years: ${ctx.futurePersona || "(not written yet)"}
- Goals:
${goalsBlock}
- Today: ${ymd} (KST) — use as a seed so a different day yields a different line for the same author.
- Variety seed: ${varietySalt} — changes per call. Prefer a different line from the previous one.${
    avoidQuote ? `\n- Last shown line: "${avoidQuote}" — do NOT pick the same line again.` : ""
  }

## Identity label pool (pick exactly one verbatim — already in ${langName})
${identitiesBlock}

## Output rules
- Quote: a single natural ${langName} line, 30–120 characters. NEVER fabricate.
  If unsure whether "${author}" actually said it, fall back to their best-known verified line.
- source: short attribution (book/speech/interview). Empty string if unknown.
- If "${author}" wrote/spoke in a language other than ${langName}, fill originalText with the original text and originalLang with the ISO code.
  If you're not confident about the original or the author writes in ${langName}, leave both empty.
- verified=false if "${author}" might not be a real person; otherwise true.
- mission: a concrete one-line question/instruction the user can answer in ~60 chars.
  Length ${MISSION_PROMPT_MIN_LEN}-${MISSION_PROMPT_MAX_LEN} characters in ${langName}. Link to one of the goals above when possible.
- linkedGoal: a goal text verbatim, or empty string.
- identityTag: one label from the pool above, copied verbatim.
- ALL human-readable fields (quote, source, mission, linkedGoal, identityTag) MUST be in ${langName}. originalText/originalLang remain in the source language.

## Output (a single JSON object on one line, NO other text)
{"quote":"<one line>","source":"<source or empty>","originalText":"<original or empty>","originalLang":"<ISO or empty>","verified":true|false,"mission":"<mission one-liner>","linkedGoal":"<a goal or empty>","identityTag":"<one label>"}`;
}

interface FreeQuoteResult {
  quote: string;
  source?: string;
  originalText?: string;
  originalLang?: string;
  verified: boolean;
  mission?: string;
  linkedGoal?: string;
  identityTag?: string;
}

function parseFreeQuote(raw: string): FreeQuoteResult | null {
  const match = raw.trim().match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const quote = typeof parsed.quote === "string" ? parsed.quote.trim() : "";
    const source =
      typeof parsed.source === "string" && parsed.source.trim().length > 0
        ? parsed.source.trim()
        : undefined;
    const originalText =
      typeof parsed.originalText === "string" && parsed.originalText.trim().length > 0
        ? parsed.originalText.trim()
        : undefined;
    const originalLang =
      typeof parsed.originalLang === "string" && parsed.originalLang.trim().length > 0
        ? parsed.originalLang.trim().slice(0, 8).toLowerCase()
        : undefined;
    const verified = parsed.verified === true;
    const mission =
      typeof parsed.mission === "string" && parsed.mission.trim().length > 0
        ? parsed.mission.trim().slice(0, MISSION_PROMPT_MAX_LEN)
        : undefined;
    const linkedGoal =
      typeof parsed.linkedGoal === "string" && parsed.linkedGoal.trim().length > 0
        ? parsed.linkedGoal.trim()
        : undefined;
    const identityTag =
      typeof parsed.identityTag === "string" && parsed.identityTag.trim().length > 0
        ? parsed.identityTag.trim()
        : undefined;
    if (!quote) return null;
    return {
      quote,
      source,
      // originalLang 없이 originalText 만 들어오는 케이스는 신뢰도 낮음 → 둘 다 있어야 채택
      originalText: originalText && originalLang ? originalText : undefined,
      originalLang: originalText && originalLang ? originalLang : undefined,
      verified,
      mission,
      linkedGoal,
      identityTag,
    };
  } catch {
    return null;
  }
}

/**
 * 오늘(또는 지정 ymd) 의 동기부여 카드 1건을 보장한다.
 * - force=false (기본): 캐시 있으면 그대로 반환.
 * - force=true: 강제 재생성.
 * - overrideAuthor: 주간 회전·핀 일정과 무관하게 이 인물의 명언으로 강제. "지금 바로 받아보기" 버튼 전용.
 */
export async function ensureMotivation(opts: {
  uid: string;
  ymd: string;
  force?: boolean;
  overrideAuthor?: string;
}): Promise<{ motivation: DailyMotivation; cached: boolean }> {
  const { uid, ymd, force = false, overrideAuthor } = opts;
  const ref = getAdminDb().doc(`users/${uid}/dailyMotivations/${ymd}`);
  // force=true 일 때도 직전 결과는 알아야 풀에서 제외할 수 있다.
  const existingSnap = await ref.get();
  const existing = existingSnap.exists ? (existingSnap.data() as DailyMotivation) : null;
  if (!force && existing) {
    return { motivation: existing, cached: true };
  }

  const ctx = await fetchUserContext(uid);
  // 정체성 라벨 풀 보장 — 카드의 mission.identityTag 가 항상 이 풀 안의 값이도록.
  // futurePersona/goals 가 바뀐 후 처음 카드를 만들 때 1회 Gemini 호출이 더 발생할 수 있다.
  const identityLabels = await ensureIdentities({
    uid,
    futurePersona: ctx.futurePersona,
    goals: ctx.goals,
    language: ctx.language,
  });

  const gradient = pickGradient(`${uid}:${ymd}`);
  const trimmedOverride = overrideAuthor?.trim() || undefined;
  const { pool: rawPool, freeAuthor } = resolveTodaysPool(
    uid,
    ymd,
    ctx.preference,
    ctx.language,
    trimmedOverride,
  );
  const { byId: candidateById, candidates: allCandidates } = getLanguagePool(ctx.language);

  // 다시 받기: 직전 명언과 같은 텍스트는 풀에서 제외한다.
  // - 주간/핀 풀에서 1개 이상 남으면 그대로 사용.
  // - 그렇지 않으면 (예: 핀 인물의 시드 명언이 1개뿐인 날) 전체 후보로 풀을 넓혀
  //   "재생성해도 같은 문구가 그대로" 인 상황을 피한다.
  const filteredFromRaw = force && existing ? rawPool.filter((q) => q.text !== existing.quote) : rawPool;
  const pool: ReadonlyArray<FamousQuoteSeed> =
    force && existing
      ? filteredFromRaw.length > 0
        ? filteredFromRaw
        : allCandidates.filter((q) => q.text !== existing.quote)
      : rawPool;

  // Gemini 가 같은 입력에 같은 답을 주는 경향이 있어, 호출마다 변하는 시드를 프롬프트에 주입.
  const varietySalt = force
    ? `regen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    : `${ymd}`;

  let picked: PickedQuote;
  let mission: MotivationMission;

  if (pool.length === 0 && freeAuthor) {
    // 시드에 없는 free-text 인물 → Gemini 가 실제 발언 + mission/identityTag 를 같이 가져옴.
    try {
      const raw = await generateText(
        buildFreeAuthorPrompt({
          ctx,
          ymd,
          author: freeAuthor,
          identityLabels,
          varietySalt,
          avoidQuote: force && existing ? existing.quote : undefined,
        }),
        QUOTE_MODEL_TOKENS,
      );
      const parsed = parseFreeQuote(raw);
      if (parsed) {
        picked = {
          text: parsed.quote,
          author: freeAuthor,
          source: parsed.source,
          originalText: parsed.originalText,
          originalLang: parsed.originalLang,
        };
        mission = resolveMission(
          {
            id: "free",
            mission: parsed.mission,
            linkedGoal: parsed.linkedGoal,
            identityTag: parsed.identityTag,
          },
          identityLabels,
          ctx.goals,
          `${uid}:${ymd}:${varietySalt}`,
        );
      } else {
        // 파싱 실패 → 전체 시드 풀에서 폴백
        picked = toPickedQuote(deterministicFallback(uid, ymd, allCandidates, ctx.language));
        mission = buildFallbackMission(identityLabels, ctx.goals, `${uid}:${ymd}:${varietySalt}`, ctx.language);
      }
    } catch (err) {
      console.warn(
        "[dailyMotivation] free-author 생성 실패, 시드 폴백:",
        err instanceof Error ? err.message : err,
      );
      picked = toPickedQuote(deterministicFallback(uid, ymd, allCandidates, ctx.language));
      mission = buildFallbackMission(identityLabels, ctx.goals, `${uid}:${ymd}:${varietySalt}`, ctx.language);
    }
  } else {
    try {
      const raw = await generateText(
        buildPrompt({
          ctx,
          ymd,
          candidates: pool,
          identityLabels,
          varietySalt,
          avoidQuote: force && existing ? existing.quote : undefined,
        }),
        QUOTE_MODEL_TOKENS,
      );
      const ext = parsePickedExtension(raw);
      const seed = ext ? candidateById.get(ext.id) : undefined;
      // Gemini 가 풀 밖의 id 를 들고와도 풀 안에서만 받아들임. 아니면 폴백.
      const inPool = seed && pool.some((q) => q.id === seed.id) ? seed : undefined;
      picked = toPickedQuote(
        inPool ?? deterministicFallback(uid, force ? `${ymd}:${varietySalt}` : ymd, pool, ctx.language),
      );
      mission = resolveMission(ext, identityLabels, ctx.goals, `${uid}:${ymd}:${varietySalt}`);
    } catch (err) {
      console.warn(
        "[dailyMotivation] Gemini 실패, 결정론적 폴백 사용:",
        err instanceof Error ? err.message : err,
      );
      // Gemini 실패 시에도 force 면 가변 시드를 써야 매 호출마다 다른 명언이 떨어진다.
      picked = toPickedQuote(
        deterministicFallback(uid, force ? `${ymd}:${varietySalt}` : ymd, pool, ctx.language),
      );
      mission = buildFallbackMission(identityLabels, ctx.goals, `${uid}:${ymd}:${varietySalt}`, ctx.language);
    }
  }

  // 마지막 안전망: 어떤 경로로든 직전과 같은 문구가 다시 잡혔다면, 전체 후보에서
  // 가변 시드 기반으로 다른 명언을 강제로 고른다. 사용자 입장에선 "또 다른 한마디"
  // 인데 같은 문구가 나오는 게 가장 큰 이질감이라 여기서 무조건 끊어준다.
  if (force && existing && picked.text === existing.quote) {
    const altPool = allCandidates.filter((q) => q.text !== existing.quote);
    if (altPool.length > 0) {
      const alt = deterministicFallback(uid, `${ymd}:${varietySalt}:retry`, altPool, ctx.language);
      picked = toPickedQuote(alt);
    }
  }

  const motivation: DailyMotivation = {
    ymd,
    quote: picked.text,
    author: picked.author,
    ...(picked.source ? { source: picked.source } : {}),
    ...(picked.originalText && picked.originalLang
      ? { originalText: picked.originalText, originalLang: picked.originalLang }
      : {}),
    goalsSnapshot: ctx.goals,
    // futurePersona 가 비어있을 때 undefined 를 박으면 Firestore admin 이 거부한다.
    // 같은 객체의 다른 optional 필드들과 동일하게 conditional spread 로 통일.
    ...(ctx.futurePersona ? { futurePersonaSnapshot: ctx.futurePersona } : {}),
    gradient,
    mission,
    createdAt: Timestamp.now() as unknown as DailyMotivation["createdAt"],
  };

  await ref.set(motivation);
  return { motivation, cached: false };
}
