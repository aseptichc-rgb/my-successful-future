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
 *   4) 후보는 위인 어록만이 아니다 — 저자 없는 큐레이션 잠언 풀(`lib/curatedQuotes`, 언어별 1,000건)이
 *      매일 결정론적으로 섞여 들어간다. 프롬프트 후보는 두 갈래에서 균형 있게 잘라 보낸다.
 */
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { KST_OFFSET_MS, addKstDays, clampYmdToRecent, isValidYmd, todayKstYmd } from "@/lib/kstDate";
import { generateText } from "@/lib/gemini";
import { type FamousQuoteSeed } from "@/lib/famousQuotesSeed";
import { getQuoteSeedPool } from "@/lib/famousQuoteCatalog";
import { anonymousAuthorLabel, getCuratedQuotePool } from "@/lib/curatedQuotes";
import { ensureIdentities, readIdentityLabels } from "@/lib/identities";
import { geminiLanguageName, normalizeLanguage } from "@/lib/llmLang";
import { FUTURE_PERSONA_TRUNC } from "@/lib/constants/futurePersona";
import type {
  DailyMotivation,
  MotivationGradient,
  MotivationMission,
  QuotePreference,
  UserLanguage,
  WidgetUpcomingQuote,
} from "@/types";

// KST_OFFSET_MS 는 위젯 라우트 등 기존 임포트 호환을 위해 재수출한다(단일 정의는 lib/kstDate).
export { KST_OFFSET_MS };
const MAX_GOALS_ON_CARD = 3;
/**
 * mission + identityTag 까지 같은 호출에서 출력하므로 토큰 한도를 키운다.
 * (기존 80은 id 한 줄 JSON 기준이었음.)
 */
const QUOTE_MODEL_TOKENS = 240;
const MISSION_PROMPT_MAX_LEN = 80;
const MISSION_PROMPT_MIN_LEN = 18;
/**
 * 사용자가 과거에 봤던 명언 텍스트 누적 상한.
 * - 풀 자체가 유한(언어별 수백 건)이라, 풀을 다 본 시점에 자연스럽게 자동 리셋되므로
 *   상한은 안전망(문서 크기 폭주 방지) 의미. 1MB 문서 한도 대비 충분히 여유 있음.
 */
const MAX_SEEN_QUOTE_HISTORY = 600;
/**
 * 자유 인물(시드 풀에 없는 인물) 명언 생성 시 Gemini 에게 회피 힌트로 전달할 과거 노출 건수.
 * 너무 많이 넣으면 프롬프트가 비대해지므로 최근 N 건만 추린다.
 */
const MAX_HISTORY_HINTS_FOR_PROMPT = 30;
/** 한 주에 노출되는 인물 풀의 목표 인원수 — 너무 좁으면 단조롭고, 너무 넓으면 회전 효과가 사라진다. */
const WEEKLY_AUTHOR_POOL_SIZE = 8;
/**
 * 하루 후보에 섞어 넣을 무명 잠언 수. 주간 인물 풀에서 나오는 어록이 보통 15~25건이라
 * 이 정도면 "위인 어록 반, 잠언 반"에 가까운 체감이 된다.
 */
const CURATED_DAILY_SAMPLE = 16;
/**
 * 프롬프트에 실어 보내는 후보 상한. 풀 소진 등으로 전체 풀(수백 건)이 후보가 되는 경로가
 * 있어, 상한 없이 두면 프롬프트가 비대해지고 비용/지연이 튄다.
 */
export const MAX_PROMPT_CANDIDATES = 40;
/** 그 상한 안에서 무명 잠언에 보장하는 몫 — 위인 어록이 후보를 독식하지 않도록. */
const CURATED_PROMPT_RATIO = 0.4;
/** 후보 목록에서 "저자 없음"을 표시하는 표식. 모델이 사람 이름으로 오해하지 않을 형태여야 한다. */
const UNATTRIBUTED_MARK = "(unattributed maxim)";
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

/** KST 기준 YYYY-MM-DD (단일 구현은 lib/kstDate.todayKstYmd). */
export function todayKst(): string {
  return todayKstYmd();
}

// 구현은 lib/kstDate.ts(admin 무의존)로 옮겼다 — 순수 정책 모듈도 같은 검증을 써야 하는데
// 이 파일을 import 하면 firebase-admin 이 클라이언트 번들까지 딸려온다. 기존 호출부 호환용 re-export.
export { isValidYmd };

/**
 * 클라이언트가 보낸 ymd 를 KST 오늘 기준 [어제, 오늘] 창으로 제한한다.
 * 임의의 미래/과거 날짜를 순회하며 카드/비전 문서를 대량 생성해 쿼터를 우회하는 것을 막는다.
 * (자정 경계 전후의 시계 오차를 흡수하기 위해 어제까지 허용.) 창 밖이거나 형식 오류면 오늘로 폴백.
 */
export function resolveRequestYmd(ymd: string | undefined | null): string {
  return clampYmdToRecent(ymd, todayKst());
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
 * 4개 풀이라 풀당 수백 건 수준이고, 호출 시점에 1회씩만 만든다.
 *
 * candidates 는 (위인 어록 + 무명 잠언) 전체. curated 는 그중 잠언만 따로 들고 있어
 * 하루 후보를 섞을 때 다시 필터링하지 않아도 되게 한다.
 */
interface LanguagePoolCache {
  candidates: ReadonlyArray<FamousQuoteSeed>;
  curated: ReadonlyArray<FamousQuoteSeed>;
  byId: ReadonlyMap<string, FamousQuoteSeed>;
  authors: ReadonlyArray<string>;
}

const POOL_CACHE = new Map<UserLanguage, LanguagePoolCache>();

function getLanguagePool(language: UserLanguage): LanguagePoolCache {
  const cached = POOL_CACHE.get(language);
  if (cached) return cached;
  const seedPool = getQuoteSeedPool(language);
  const curated = getCuratedQuotePool(language).filter(
    (q) => !EXCLUDED_CATEGORIES.has(q.category),
  );
  const candidates = [
    ...seedPool.filter((q) => !EXCLUDED_CATEGORIES.has(q.category)),
    ...curated,
  ];
  const byId = new Map(candidates.map((q) => [q.id, q] as const));
  const authors = Array.from(
    new Set(
      candidates
        .map((q) => (typeof q.author === "string" ? q.author.trim() : ""))
        .filter((a) => a.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b, language === "ko" ? "ko" : language === "zh" ? "zh" : language === "es" ? "es" : "en"));
  const value = { candidates, curated, byId, authors } as const;
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

/** 결정론적으로 n 건만 추린다. 같은 시드면 같은 결과, 풀이 더 작으면 그대로 반환. */
function deterministicSample<T>(arr: ReadonlyArray<T>, seed: number, n: number): T[] {
  if (n <= 0) return [];
  if (arr.length <= n) return arr.slice();
  return deterministicShuffle(arr, seed).slice(0, n);
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
  /**
   * 이 사용자에게 과거에 (어떤 날이든) 노출됐던 명언 텍스트 누적.
   * 날짜 경계를 넘어가도 같은 격언이 다시 나오지 않게 풀에서 제외하는 데 쓴다.
   * 풀이 모두 소진되면 자연스럽게 리셋된다.
   */
  seenQuoteTexts: string[];
}

function buildPrompt(opts: {
  ctx: UserContext;
  ymd: string;
  candidates: ReadonlyArray<FamousQuoteSeed>;
  identityLabels: ReadonlyArray<string>;
  /** 매번 새 호출에서 다른 결과를 유도하는 가변 시드 (다시 받기 시 변경됨). */
  varietySalt: string;
  /** 오늘 이미 노출됐던 명언들 — 같은 줄을 또 고르면 변화가 안 보임. */
  avoidQuotes?: ReadonlyArray<string>;
}): string {
  const { ctx, ymd, candidates, identityLabels, varietySalt, avoidQuotes } = opts;
  const langName = geminiLanguageName(ctx.language);
  const goalsBlock =
    ctx.goals.length > 0
      ? ctx.goals.map((g, i) => `${i + 1}. ${g}`).join("\n")
      : "(no goals listed yet)";

  // 저자가 없는 항목은 무명 잠언 — 모델이 사람 이름을 지어내지 않도록 표식을 명확히 준다.
  const candidatesBlock = candidates
    .map((q) => `- ${q.id} | ${q.author ?? UNATTRIBUTED_MARK} | "${q.text}"`)
    .join("\n");

  const identitiesBlock = identityLabels.map((l) => `- ${l}`).join("\n");

  // 프롬프트는 영어 + 출력 언어를 명시하는 방식. 카드의 mission/identityTag 가
  // 사용자의 언어로 떨어지면서 후보 id 만 우리 풀의 영문 슬러그를 그대로 가져온다.
  return `You are a curator who picks one line — either a real person's quote or an unattributed maxim —
that fits a person's goals and future self, and a coach who turns that line into a single
active-recall mission for today.

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
Lines marked "${UNATTRIBUTED_MARK}" are anonymous maxims curated for this app. They are just as
valid a pick as a famous name — judge only by fit. Never invent an author for them.
${candidatesBlock}

## Identity label pool (pick exactly one verbatim — do NOT invent new labels)
${identitiesBlock}

## Selection / writing rules
1. Quote: the line that best resonates with this user's goals and future self. Not a tired cliché.
   Do not favor famous names over unattributed maxims — pick by resonance alone.
2. Mission:
   - A concrete question or action prompt the user can answer in one short line (~60 chars).
   - Length ${MISSION_PROMPT_MIN_LEN}-${MISSION_PROMPT_MAX_LEN} characters in ${langName}.
   - When possible, link directly to one of the goals above (set linkedGoal to that goal's text verbatim).
   - Patterns like "What is the single biggest obstacle to ___ today?" / "What is the first step toward ___?".
   - No abstract encouragement ("you can do it"). Must trigger active retrieval.
3. identityTag: exactly one label from the pool above, copied verbatim. Do not invent new labels.
4. Variety seed: ${varietySalt} — if this value changes, actively pick a different quote/mission than last time.${
    avoidQuotes && avoidQuotes.length > 0
      ? `\n5. Already shown today (do NOT pick any of these — choose a different candidate):\n${avoidQuotes
          .map((q) => `   - "${q}"`)
          .join("\n")}`
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
  const seenQuoteTexts = Array.isArray(data.seenQuoteTexts)
    ? (data.seenQuoteTexts as unknown[])
        .filter((t): t is string => typeof t === "string" && t.length > 0)
    : [];
  return { displayName, futurePersona, goals, preference, language, seenQuoteTexts };
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

function toPickedQuote(seed: FamousQuoteSeed, language: UserLanguage): PickedQuote {
  // tags 첫 항목을 출처 힌트(저작/연설)로 활용 — 시드의 자유 메타.
  const sourceTag = seed.tags && seed.tags.length > 0 ? seed.tags[0] : undefined;
  return {
    text: seed.text,
    // 무명 잠언은 카드에 사용자 언어로 "작자 미상"류 라벨이 찍힌다.
    author: seed.author ?? anonymousAuthorLabel(language),
    source: sourceTag,
    originalText: seed.originalText,
    originalLang: seed.originalLang,
  };
}

/**
 * 프롬프트에 실을 후보를 상한 안으로 줄인다.
 * 그냥 잘라내면 한쪽(대개 건수가 많은 무명 잠언)이 후보를 독식하므로, 위인 어록/잠언
 * 두 갈래에서 각자 몫만큼 뽑고 한쪽이 모자라면 다른 쪽이 남은 자리를 가져간다.
 *
 * (export 는 단위 테스트 노출용 — 런타임 호출자는 이 파일 안에만 있다.)
 */
export function balancedPromptCandidates(
  pool: ReadonlyArray<FamousQuoteSeed>,
  seed: number,
): ReadonlyArray<FamousQuoteSeed> {
  if (pool.length <= MAX_PROMPT_CANDIDATES) return pool;
  const attributed = pool.filter((q) => q.author);
  const unattributed = pool.filter((q) => !q.author);
  if (attributed.length === 0 || unattributed.length === 0) {
    return deterministicSample(pool, seed, MAX_PROMPT_CANDIDATES);
  }
  const curatedQuota = Math.min(
    unattributed.length,
    Math.round(MAX_PROMPT_CANDIDATES * CURATED_PROMPT_RATIO),
  );
  const famousQuota = Math.min(attributed.length, MAX_PROMPT_CANDIDATES - curatedQuota);
  // 한쪽이 몫을 다 못 채웠으면 남은 자리를 반대쪽에 돌려준다.
  const curatedFinal = Math.min(unattributed.length, MAX_PROMPT_CANDIDATES - famousQuota);
  return [
    ...deterministicSample(attributed, seed, famousQuota),
    ...deterministicSample(unattributed, seed ^ 0x9e3779b9, curatedFinal),
  ];
}

/**
 * 오늘 노출할 후보 풀(이번 한 건을 뽑을 대상)을 결정한다.
 * - overrideAuthor 가 있으면 → 그 인물의 명언만 (즉시 받아보기 버튼 경로).
 * - 핀 인물 + 오늘이 핀 요일이면 → 그 인물의 명언만.
 *   (위 둘은 사용자가 인물을 명시한 경로라 무명 잠언을 섞지 않는다.)
 * - 그 외 → 이번 주 회전 인물들의 어록 + 오늘 몫의 무명 잠언을 섞은 풀.
 * - 어떤 사정으로 풀이 비면 → 전체 후보로 폴백.
 *
 * (export 는 단위 테스트 노출용 — 런타임 호출자는 이 파일 안에만 있다.)
 */
export function resolveTodaysPool(
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
  const { candidates, curated, authors } = getLanguagePool(language);
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

  // 이번 주 인물들의 어록 + 오늘 몫의 무명 잠언. 잠언 표본은 (uid, ymd) 시드라
  // 날마다 다른 16건이 올라오고, 같은 날 재호출에는 같은 표본이 유지된다.
  const weeklyAuthors = weeklyAuthorPool(uid, wk, authors);
  const weekly = candidates.filter((q) => q.author && weeklyAuthors.has(q.author));
  const curatedToday = deterministicSample(
    curated,
    hash32(`${uid}:${ymd}:curated`),
    CURATED_DAILY_SAMPLE,
  );
  const mixed = [...weekly, ...curatedToday];
  if (mixed.length > 0) return { pool: mixed, reason: "weekly" };

  return { pool: candidates, reason: "all" };
}

/** 시드에 없는 free-text 인물명 → Gemini 로 그 사람의 실제 명언 1건과 미션/정체성 라벨을 같이 가져온다. */
function buildFreeAuthorPrompt(opts: {
  ctx: UserContext;
  ymd: string;
  author: string;
  identityLabels: ReadonlyArray<string>;
  varietySalt: string;
  avoidQuotes?: ReadonlyArray<string>;
}): string {
  const { ctx, ymd, author, identityLabels, varietySalt, avoidQuotes } = opts;
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
    avoidQuotes && avoidQuotes.length > 0
      ? `\n- Already shown today (do NOT pick any of these — choose a different line by ${author}):\n${avoidQuotes
          .map((q) => `   - "${q}"`)
          .join("\n")}`
      : ""
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
  /**
   * 무료 티어 카드 — Gemini 를 **한 번도** 호출하지 않고 큐레이션 시드에서만 카드를 만든다.
   *
   * 결제하지 않아도 매일의 습관(카드 1장 + 위젯)은 계속 살아 있게 하되, LLM 비용은 결제
   * 사용자에게만 발생시키기 위한 다운그레이드 경로다. 명언 선택은 [deterministicFallback],
   * 미션은 [buildFallbackMission] 이 맡으므로 결과물의 형태(DailyMotivation)는 완전히 동일하다
   * — 위젯·홈·기록 어느 쪽도 무료/결제를 구분하는 분기를 둘 필요가 없다.
   *
   * 중복 회피(seenQuotes/히스토리)·그라디언트·레이스 방지 저장은 결제 경로와 그대로 공유한다.
   */
  curatedOnly?: boolean;
}): Promise<{ motivation: DailyMotivation; cached: boolean }> {
  const { uid, ymd, force = false, overrideAuthor, curatedOnly = false } = opts;
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
  // 무료 티어(curatedOnly)는 그 호출까지 피해야 하므로 저장된 라벨만 읽는다.
  const identityLabels = curatedOnly
    ? await readIdentityLabels(uid, ctx.language)
    : await ensureIdentities({
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

  // 오늘 이미 노출됐던 명언들. existing.seenQuotes 가 누적이고, 거기 빠져있을 수
  // 있는 직전 quote 까지 합쳐 둔다 (옛 문서 호환 — 처음 도입 전 카드엔 seenQuotes 가 없음).
  const seenQuotesArr: string[] =
    force && existing
      ? Array.from(
          new Set([
            ...(Array.isArray(existing.seenQuotes) ? existing.seenQuotes : []),
            existing.quote,
          ]),
        )
      : [];
  const todaysSeenSet = new Set(seenQuotesArr);

  // 날짜를 넘어가도 같은 격언이 또 나오지 않도록, 사용자 누적 히스토리를 기본 제외 집합으로 쓴다.
  // 오늘 이미 노출된 텍스트(같은 날 "다시 받기") 도 합쳐 한 번에 풀에서 빼낸다.
  const historySet = new Set(ctx.seenQuoteTexts);
  const excludeSet = new Set<string>([...historySet, ...todaysSeenSet]);
  const notExcluded = (q: FamousQuoteSeed) => !excludeSet.has(q.text);

  // 풀 결정 우선순위:
  //   1) 오늘의 의도된 풀(rawPool: override / pinned / weekly / all) 에서 과거 노출 제외 후 남은 것
  //   2) 1) 이 비면 전체 시드 풀에서 과거 노출 제외 후 남은 것
  //   3) 둘 다 비면 → 풀이 소진된 것이므로 히스토리 리셋(이번 카드 저장 시 누적 배열을 새로 시작)
  //      후 오늘만 피해 다시 고른다.
  const filteredFromRaw = rawPool.filter(notExcluded);
  const filteredFromAll = allCandidates.filter(notExcluded);
  let resetHistory = false;
  let pool: ReadonlyArray<FamousQuoteSeed>;
  if (filteredFromRaw.length > 0) {
    pool = filteredFromRaw;
  } else if (filteredFromAll.length > 0) {
    pool = filteredFromAll;
  } else {
    resetHistory = true;
    const todayOnlyFromRaw = rawPool.filter((q) => !todaysSeenSet.has(q.text));
    const todayOnlyFromAll = allCandidates.filter((q) => !todaysSeenSet.has(q.text));
    if (todayOnlyFromRaw.length > 0) pool = todayOnlyFromRaw;
    else if (todayOnlyFromAll.length > 0) pool = todayOnlyFromAll;
    else pool = rawPool.length > 0 ? rawPool : allCandidates; // 최후 안전망
  }

  // Gemini 가 같은 입력에 같은 답을 주는 경향이 있어, 호출마다 변하는 시드를 프롬프트에 주입.
  const varietySalt = force
    ? `regen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    : `${ymd}`;

  // 실제로 모델에게 보여줄 후보 — 상한 안에서 위인 어록/무명 잠언이 함께 남도록 균형 추출.
  // 이후 "풀 안의 id 인지" 검증과 폴백도 모두 이 목록 기준이어야 한다(모델이 못 본 건 고를 수 없다).
  const promptPool = balancedPromptCandidates(pool, hash32(`${uid}:${ymd}:${varietySalt}:prompt`));

  let picked: PickedQuote;
  let mission: MotivationMission;

  // Gemini 회피 힌트: 오늘 본 것 + 과거 누적 일부. 프롬프트 비대화를 막으려 최근만 추린다.
  const avoidQuotesForPrompt = Array.from(
    new Set([
      ...seenQuotesArr,
      ...ctx.seenQuoteTexts.slice(-MAX_HISTORY_HINTS_FOR_PROMPT),
    ]),
  );

  if (curatedOnly) {
    // 무료 티어 — Gemini 를 건너뛰고 오늘의 풀에서 결정론적으로 1건 고른다.
    // promptPool(모델에게 보여줄 균형 추출본) 이 아니라 pool 전체를 쓴다: 모델 컨텍스트 상한을
    // 맞출 이유가 없으니 후보를 좁힐수록 손해다.
    picked = toPickedQuote(
      deterministicFallback(uid, force ? `${ymd}:${varietySalt}` : ymd, pool, ctx.language),
      ctx.language,
    );
    mission = buildFallbackMission(
      identityLabels,
      ctx.goals,
      `${uid}:${ymd}:${varietySalt}`,
      ctx.language,
    );
  } else if (pool.length === 0 && freeAuthor) {
    // 시드에 없는 free-text 인물 → Gemini 가 실제 발언 + mission/identityTag 를 같이 가져옴.
    try {
      const raw = await generateText(
        buildFreeAuthorPrompt({
          ctx,
          ymd,
          author: freeAuthor,
          identityLabels,
          varietySalt,
          avoidQuotes: avoidQuotesForPrompt,
        }),
        QUOTE_MODEL_TOKENS,
        undefined,
        { uid, feature: "daily_motivation" },
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
        picked = toPickedQuote(
          deterministicFallback(uid, ymd, allCandidates, ctx.language),
          ctx.language,
        );
        mission = buildFallbackMission(identityLabels, ctx.goals, `${uid}:${ymd}:${varietySalt}`, ctx.language);
      }
    } catch (err) {
      console.warn(
        "[dailyMotivation] free-author 생성 실패, 시드 폴백:",
        err instanceof Error ? err.message : err,
      );
      picked = toPickedQuote(
        deterministicFallback(uid, ymd, allCandidates, ctx.language),
        ctx.language,
      );
      mission = buildFallbackMission(identityLabels, ctx.goals, `${uid}:${ymd}:${varietySalt}`, ctx.language);
    }
  } else {
    try {
      const raw = await generateText(
        buildPrompt({
          ctx,
          ymd,
          candidates: promptPool,
          identityLabels,
          varietySalt,
          avoidQuotes: avoidQuotesForPrompt,
        }),
        QUOTE_MODEL_TOKENS,
        undefined,
        { uid, feature: "daily_motivation" },
      );
      const ext = parsePickedExtension(raw);
      const seed = ext ? candidateById.get(ext.id) : undefined;
      // Gemini 가 풀 밖의 id 를 들고와도 풀 안에서만 받아들임. 아니면 폴백.
      const inPool = seed && promptPool.some((q) => q.id === seed.id) ? seed : undefined;
      picked = toPickedQuote(
        inPool ??
          deterministicFallback(uid, force ? `${ymd}:${varietySalt}` : ymd, promptPool, ctx.language),
        ctx.language,
      );
      mission = resolveMission(ext, identityLabels, ctx.goals, `${uid}:${ymd}:${varietySalt}`);
    } catch (err) {
      console.warn(
        "[dailyMotivation] Gemini 실패, 결정론적 폴백 사용:",
        err instanceof Error ? err.message : err,
      );
      // Gemini 실패 시에도 force 면 가변 시드를 써야 매 호출마다 다른 명언이 떨어진다.
      picked = toPickedQuote(
        deterministicFallback(uid, force ? `${ymd}:${varietySalt}` : ymd, promptPool, ctx.language),
        ctx.language,
      );
      mission = buildFallbackMission(identityLabels, ctx.goals, `${uid}:${ymd}:${varietySalt}`, ctx.language);
    }
  }

  // 마지막 안전망: 어떤 경로로든 (오늘 이미 본 문구 + 과거에 본 문구) 에 다시 걸렸다면,
  // 전체 후보에서 가변 시드 기반으로 다른 명언을 강제로 고른다.
  // 풀이 history 리셋 후 좁아진 상태라면 excludeSet 적용이 불가능하므로 오늘만 피한다.
  if (excludeSet.has(picked.text)) {
    const altPool = resetHistory
      ? allCandidates.filter((q) => !todaysSeenSet.has(q.text))
      : allCandidates.filter((q) => !excludeSet.has(q.text));
    if (altPool.length > 0) {
      const alt = deterministicFallback(uid, `${ymd}:${varietySalt}:retry`, altPool, ctx.language);
      picked = toPickedQuote(alt, ctx.language);
    }
  }

  // 오늘 노출 누적 — 다음 재생성 호출에서 풀에서 제외할 명단.
  const nextSeenQuotes = Array.from(new Set([...seenQuotesArr, picked.text]));

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
    seenQuotes: nextSeenQuotes,
    ...(resetHistory ? { historyReset: true } : {}),
    createdAt: Timestamp.now() as unknown as DailyMotivation["createdAt"],
  };

  // 동시 최초 생성 레이스 차단 (split-brain 방지).
  //   위젯 라우트(/api/widget/today)와 /home POST(/api/daily-motivation)가
  //   같은 ymd 를 "처음" 동시에 만들면, 둘 다 캐시 미스로 각자 Gemini 를 호출해
  //   서로 다른 명언을 set 한다 → 진리원천이 갈라져 위젯과 홈이 영구히 어긋난다.
  //   - force(명시적 재생성/overrideAuthor)는 의도된 덮어쓰기이므로 set 유지.
  //   - 그 외(최초 생성)는 create() 로 원자적 삽입. 이미 다른 호출이 만들었다면
  //     ALREADY_EXISTS 로 거부 → 진 쪽은 "이긴 문서"를 다시 읽어 그대로 반환한다.
  //     (히스토리 누적도 건너뛴다 — 사용자가 본 적 없는 명언을 기록하지 않도록.)
  if (force) {
    await ref.set(motivation);
  } else {
    try {
      await ref.create(motivation);
    } catch (err) {
      const winner = await ref.get();
      if (winner.exists) {
        return { motivation: winner.data() as DailyMotivation, cached: true };
      }
      // ALREADY_EXISTS 가 아닌 다른 사유로 실패 + 문서도 없음 → 원에러 전파.
      throw err;
    }
  }

  // 사용자 문서의 누적 히스토리 갱신.
  // - 풀 소진으로 리셋된 경우: 배열을 새로 시작(이번 카드 텍스트만 남김).
  // - 그렇지 않으면: arrayUnion 으로 중복 없이 누적, 상한 초과 시 오래된 항목 정리.
  // 카드 저장 자체는 성공해야 하므로 히스토리 업데이트 실패는 로그만 남기고 삼킨다.
  try {
    const userRef = getAdminDb().doc(`users/${uid}`);
    if (resetHistory) {
      await userRef.set({ seenQuoteTexts: [picked.text] }, { merge: true });
    } else if (ctx.seenQuoteTexts.length + 1 > MAX_SEEN_QUOTE_HISTORY) {
      // 상한 초과: 가장 오래된 항목들을 잘라낸 뒤 통째로 교체.
      const trimmed = Array.from(new Set([...ctx.seenQuoteTexts, picked.text])).slice(
        -MAX_SEEN_QUOTE_HISTORY,
      );
      await userRef.set({ seenQuoteTexts: trimmed }, { merge: true });
    } else {
      await userRef.set(
        { seenQuoteTexts: FieldValue.arrayUnion(picked.text) },
        { merge: true },
      );
    }
  } catch (err) {
    console.warn(
      "[dailyMotivation] 누적 명언 히스토리 갱신 실패:",
      err instanceof Error ? err.message : err,
    );
  }

  return { motivation, cached: false };
}

/** 위젯에 실어 보낼 "다음 날들" 명언 미리보기 일수 — WidgetKit 자정 타임라인 한 주치. */
export const UPCOMING_PREVIEW_DAYS = 7;

/**
 * (uid, ymd) 결정론으로 다음 [days]일치 명언 미리보기를 뽑는다 — LLM 호출 없음(순수 함수).
 *
 * 왜 필요한가: 위젯은 자정에 네트워크를 못 칠 수 있다(iOS 익스텐션은 인증 호출 불가,
 * Android 는 오프라인/도즈). 이 미리보기를 캐시에 실어 두면 클라이언트가 날짜가 바뀌는
 * 순간 스스로 그날의 새 명언으로 교체한다.
 *
 * 무료 티어 카드(curatedOnly)와 동일한 (풀 결정 → 과거 노출 제외 → 해시 선택) 경로를 그대로
 * 따르므로, 무료 사용자가 그날 앱을 열어 만들어지는 정식 카드와 미리보기가 대부분 일치한다.
 * (Pro 는 앱을 여는 순간 Gemini 개인화 카드로 자연 대체된다.)
 *
 * 하루하루 뽑은 텍스트를 exclude 에 누적해 미리보기끼리도 겹치지 않게 한다.
 */
export function pickUpcomingPreviewQuotes(opts: {
  uid: string;
  /** 오늘(KST, YYYY-MM-DD) — 미리보기는 이 다음 날부터 시작한다. */
  startYmd: string;
  days?: number;
  preference: QuotePreference;
  language: UserLanguage;
  /** 과거 노출 텍스트 + 오늘 카드 텍스트 — 미리보기에서 제외할 명단. */
  excludeTexts?: ReadonlyArray<string>;
}): WidgetUpcomingQuote[] {
  const { uid, startYmd, days = UPCOMING_PREVIEW_DAYS, preference, language } = opts;
  if (!isValidYmd(startYmd) || days <= 0) return [];
  const { candidates } = getLanguagePool(language);
  const exclude = new Set(opts.excludeTexts ?? []);
  const previews: WidgetUpcomingQuote[] = [];
  for (let i = 1; i <= days; i++) {
    const ymd = addKstDays(startYmd, i);
    // 핀 인물이 시드 풀 밖이면(pool 이 비고 freeAuthor 만 옴) LLM 없이는 못 가져온다 —
    // 전체 후보로 폴백해 미리보기가 끊기지 않게 한다.
    const { pool: rawPool } = resolveTodaysPool(uid, ymd, preference, language);
    const base = rawPool.length > 0 ? rawPool : candidates;
    // ensureMotivation 과 같은 계층 폴백: 의도된 풀 → 전체 풀 → (모두 소진이면) 제외 무시.
    const filtered = base.filter((q) => !exclude.has(q.text));
    const widened =
      filtered.length > 0 ? filtered : candidates.filter((q) => !exclude.has(q.text));
    const pool = widened.length > 0 ? widened : base;
    const picked = toPickedQuote(deterministicFallback(uid, ymd, pool, language), language);
    exclude.add(picked.text);
    previews.push({ ymd, text: picked.text, author: picked.author });
  }
  return previews;
}

/**
 * [pickUpcomingPreviewQuotes] 의 서버 래퍼 — 사용자 컨텍스트(언어·핀 설정·노출 히스토리)를
 * 읽어 미리보기를 만든다. 위젯 응답의 부가 필드이므로 어떤 실패도 throw 하지 않고 [] 로
 * 폴백한다(본문 카드에는 영향 없음).
 */
export async function buildUpcomingPreviews(opts: {
  uid: string;
  startYmd: string;
  days?: number;
  /** 오늘 카드 텍스트 등 미리보기에서 추가로 제외할 명단. */
  excludeTexts?: ReadonlyArray<string>;
}): Promise<WidgetUpcomingQuote[]> {
  try {
    const ctx = await fetchUserContext(opts.uid);
    return pickUpcomingPreviewQuotes({
      uid: opts.uid,
      startYmd: opts.startYmd,
      days: opts.days,
      preference: ctx.preference,
      language: ctx.language,
      excludeTexts: [...ctx.seenQuoteTexts, ...(opts.excludeTexts ?? [])],
    });
  } catch (err) {
    console.warn(
      "[dailyMotivation] upcoming 미리보기 생성 실패(생략):",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}
