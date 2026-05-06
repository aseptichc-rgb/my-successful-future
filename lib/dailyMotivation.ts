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
import { FAMOUS_QUOTES_SEED, type FamousQuoteSeed } from "@/lib/famousQuotesSeed";
import type { DailyMotivation, MotivationGradient, QuotePreference } from "@/types";

export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const FUTURE_PERSONA_TRUNC = 280;
const MAX_GOALS_ON_CARD = 3;
const QUOTE_MODEL_TOKENS = 80;
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

/** 실존 인물 명언 후보 — personal 카테고리 제외 */
const QUOTE_CANDIDATES: ReadonlyArray<FamousQuoteSeed> = FAMOUS_QUOTES_SEED.filter(
  (q) => !EXCLUDED_CATEGORIES.has(q.category),
);

const CANDIDATE_BY_ID: ReadonlyMap<string, FamousQuoteSeed> = new Map(
  QUOTE_CANDIDATES.map((q) => [q.id, q] as const),
);

/** 시드에서 등장하는 모든 고유 인물(author). 주간 회전 풀 추출에 사용. */
const KNOWN_AUTHORS: ReadonlyArray<string> = Array.from(
  new Set(
    QUOTE_CANDIDATES
      .map((q) => (typeof q.author === "string" ? q.author.trim() : ""))
      .filter((a) => a.length > 0),
  ),
).sort((a, b) => a.localeCompare(b, "ko"));

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
 */
function weeklyAuthorPool(uid: string, weekKey: number): Set<string> {
  const seed = hash32(`${uid}:wk:${weekKey}`);
  const shuffled = deterministicShuffle(KNOWN_AUTHORS, seed);
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
}

function buildPrompt(opts: {
  ctx: UserContext;
  ymd: string;
  candidates: ReadonlyArray<FamousQuoteSeed>;
  /** 매번 새 호출에서 다른 결과를 유도하는 가변 시드 (다시 받기 시 변경됨). */
  varietySalt: string;
}): string {
  const { ctx, ymd, candidates, varietySalt } = opts;
  const goalsBlock =
    ctx.goals.length > 0
      ? ctx.goals.map((g, i) => `${i + 1}. ${g}`).join("\n")
      : "(아직 목표가 적혀 있지 않음)";

  const candidatesBlock = candidates
    .map((q) => `- ${q.id} | ${q.author ?? "미상"} | "${q.text}"`)
    .join("\n");

  return `당신은 한 사람의 목표와 꿈에 정확히 어울리는 실존 인물(철학자·기업가·과학자·문학가·리더 등)의 명언 한 줄을 골라주는 큐레이터입니다.

오늘은 ${ymd} (KST). 아래 사용자에게, 오늘 잠금화면에 띄워줄 명언 1건을 후보 목록에서 정확히 골라야 합니다.

## 사용자
- 이름: ${ctx.displayName}
- 10년 후 되고 싶은 모습: ${ctx.futurePersona || "(미작성)"}
- 지금 바라보는 목표:
${goalsBlock}

## 후보 (이 목록 밖의 인용은 절대 만들어내지 마세요)
${candidatesBlock}

## 선정 기준
1. 사용자의 목표·미래상과 의미적으로 가장 잘 통하는 한 줄.
2. 진부한 자기계발 클리셰보다, 사용자가 가는 길을 실제로 비춰주는 인용.
3. 다양성 시드: ${varietySalt} — 이 값이 바뀌었다면 직전 회와 다른 후보를 적극적으로 골라라.

## 출력 (반드시 이 JSON 한 줄만, 다른 말 금지)
{"id":"<후보 id 그대로>"}`;
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
  return { displayName, futurePersona, goals, preference };
}

/** Gemini 응답에서 첫 번째 JSON 객체를 끄집어내 id 만 꺼낸다. */
function parsePickedId(raw: string): string | null {
  const trimmed = raw.trim();
  const match = trimmed.match(/\{[\s\S]*?\}/);
  if (!match) return null;
  try {
    const parsed: unknown = JSON.parse(match[0]);
    if (
      parsed &&
      typeof parsed === "object" &&
      "id" in parsed &&
      typeof (parsed as { id: unknown }).id === "string"
    ) {
      return (parsed as { id: string }).id.trim();
    }
  } catch {
    return null;
  }
  return null;
}

/** 주어진 후보 풀에서 (uid+ymd) 시드로 결정론적 폴백 1건. */
function deterministicFallback(
  uid: string,
  ymd: string,
  pool: ReadonlyArray<FamousQuoteSeed>,
): FamousQuoteSeed {
  if (pool.length === 0) {
    return {
      id: "fallback_default",
      text: "멈추지만 않는다면, 얼마나 천천히 가는가는 중요하지 않다.",
      author: "공자",
      category: "philosophy",
      language: "ko",
    };
  }
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
  overrideAuthor?: string,
): {
  pool: ReadonlyArray<FamousQuoteSeed>;
  reason: "override" | "pinned" | "weekly" | "all";
  /** 시드에 없는 free-text 인물명. pool 이 비어있을 때만 채워짐. */
  freeAuthor?: string;
} {
  const wk = weekKeyKst(ymd);
  const dow = weekdayKst(ymd);
  const pinnedDays = pinnedWeekdays(uid, wk, preference.pinnedDaysPerWeek ?? 0);

  if (overrideAuthor) {
    const pool = QUOTE_CANDIDATES.filter((q) => q.author === overrideAuthor);
    return pool.length > 0
      ? { pool, reason: "override" }
      : { pool: [], reason: "override", freeAuthor: overrideAuthor };
  }

  if (preference.pinnedAuthor && pinnedDays.has(dow)) {
    const target = preference.pinnedAuthor;
    const pinned = QUOTE_CANDIDATES.filter((q) => q.author === target);
    if (pinned.length > 0) return { pool: pinned, reason: "pinned" };
    // 시드에 없는 핀 인물이면 free-text 경로로 위임
    return { pool: [], reason: "pinned", freeAuthor: target };
  }

  const weeklyAuthors = weeklyAuthorPool(uid, wk);
  const weekly = QUOTE_CANDIDATES.filter((q) => q.author && weeklyAuthors.has(q.author));
  if (weekly.length > 0) return { pool: weekly, reason: "weekly" };

  return { pool: QUOTE_CANDIDATES, reason: "all" };
}

/** 시드에 없는 free-text 인물명 → Gemini 로 그 사람의 실제 명언 1건을 가져온다. */
function buildFreeAuthorPrompt(opts: {
  ctx: UserContext;
  ymd: string;
  author: string;
  varietySalt: string;
  avoidQuote?: string;
}): string {
  const { ctx, ymd, author, varietySalt, avoidQuote } = opts;
  const goalsBlock =
    ctx.goals.length > 0
      ? ctx.goals.map((g, i) => `${i + 1}. ${g}`).join("\n")
      : "(아직 목표가 적혀 있지 않음)";
  return `당신은 인물 인용을 정확히 기억하는 큐레이터입니다.

요청: "${author}" 라는 실존 인물(또는 널리 알려진 역사적 인물)의 **실제로 한 발언/저술 중 출처가 분명하고 널리 인용되는 한 줄**을 한국어로 가져오세요.

## 사용자 (이 사람의 목표·미래에 가장 와닿는 한 줄을 골라줘)
- 10년 후 모습: ${ctx.futurePersona || "(미작성)"}
- 목표:
${goalsBlock}
- 오늘: ${ymd} (KST) — 같은 사람이라도 다른 날엔 다른 인용을 받을 수 있게 시드로 활용.
- 다양성 시드: ${varietySalt} — 호출마다 바뀝니다. 직전 회와 다른 발언을 적극적으로 골라주세요.${
    avoidQuote ? `\n- 방금 보여준 인용: "${avoidQuote}" — 이것과 같은 발언은 절대 다시 고르지 마세요.` : ""
  }

## 출력 규칙
- 한국어 한 줄로 자연스럽게 옮긴 인용. 30~120자.
- 절대 만들어내지 마세요. 본인이 한 게 맞는지 확신 없으면 가장 잘 알려진 다른 진짜 발언으로 대체하세요.
- source 필드에는 출처(저작/연설/인터뷰 등)를 한국어 또는 원어로. 모르면 빈 문자열.
- 인물이 한국인이 아니면 originalText 에 그 사람이 실제 사용한 언어의 원문을 그대로 넣고, originalLang 에 ISO 코드(en, de, fr, ru, zh, ja, la, grc 등)를 넣으세요. 한국인이거나 원문 확신이 없으면 둘 다 빈 문자열.
- 한국 인물이면 originalText, originalLang 둘 다 빈 문자열로 두세요.
- "${author}" 가 실존 인물이 아닐 가능성이 있으면 verified=false 로 표시.

## 출력 (이 JSON 한 줄만)
{"quote":"<한국어 한 줄>","source":"<출처 또는 빈 문자열>","originalText":"<원어 원문 또는 빈 문자열>","originalLang":"<ISO 코드 또는 빈 문자열>","verified":true|false}`;
}

interface FreeQuoteResult {
  quote: string;
  source?: string;
  originalText?: string;
  originalLang?: string;
  verified: boolean;
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
    if (!quote) return null;
    return {
      quote,
      source,
      // originalLang 없이 originalText 만 들어오는 케이스는 신뢰도 낮음 → 둘 다 있어야 채택
      originalText: originalText && originalLang ? originalText : undefined,
      originalLang: originalText && originalLang ? originalLang : undefined,
      verified,
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
  const gradient = pickGradient(`${uid}:${ymd}`);
  const trimmedOverride = overrideAuthor?.trim() || undefined;
  const { pool: rawPool, freeAuthor } = resolveTodaysPool(uid, ymd, ctx.preference, trimmedOverride);

  // 다시 받기: 직전 명언과 같은 텍스트는 풀에서 제외 (단, 그렇게 해도 1개 이상 남을 때만).
  const pool: ReadonlyArray<FamousQuoteSeed> =
    force && existing
      ? rawPool.filter((q) => q.text !== existing.quote).length > 0
        ? rawPool.filter((q) => q.text !== existing.quote)
        : rawPool
      : rawPool;

  // Gemini 가 같은 입력에 같은 답을 주는 경향이 있어, 호출마다 변하는 시드를 프롬프트에 주입.
  const varietySalt = force
    ? `regen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    : `${ymd}`;

  let picked: PickedQuote;

  if (pool.length === 0 && freeAuthor) {
    // 시드에 없는 free-text 인물 → Gemini 가 실제 발언을 가져옴.
    try {
      const raw = await generateText(
        buildFreeAuthorPrompt({
          ctx,
          ymd,
          author: freeAuthor,
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
      } else {
        // 파싱 실패 → 전체 시드 풀에서 폴백
        picked = toPickedQuote(deterministicFallback(uid, ymd, QUOTE_CANDIDATES));
      }
    } catch (err) {
      console.warn(
        "[dailyMotivation] free-author 생성 실패, 시드 폴백:",
        err instanceof Error ? err.message : err,
      );
      picked = toPickedQuote(deterministicFallback(uid, ymd, QUOTE_CANDIDATES));
    }
  } else {
    try {
      const raw = await generateText(
        buildPrompt({ ctx, ymd, candidates: pool, varietySalt }),
        QUOTE_MODEL_TOKENS,
      );
      const id = parsePickedId(raw);
      const seed = id ? CANDIDATE_BY_ID.get(id) : undefined;
      // Gemini 가 풀 밖의 id 를 들고와도 풀 안에서만 받아들임. 아니면 폴백.
      const inPool = seed && pool.some((q) => q.id === seed.id) ? seed : undefined;
      picked = toPickedQuote(
        inPool ?? deterministicFallback(uid, force ? `${ymd}:${varietySalt}` : ymd, pool),
      );
    } catch (err) {
      console.warn(
        "[dailyMotivation] Gemini 실패, 결정론적 폴백 사용:",
        err instanceof Error ? err.message : err,
      );
      picked = toPickedQuote(deterministicFallback(uid, ymd, pool));
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
    futurePersonaSnapshot: ctx.futurePersona || undefined,
    gradient,
    createdAt: Timestamp.now() as unknown as DailyMotivation["createdAt"],
  };

  await ref.set(motivation);
  return { motivation, cached: false };
}
