/**
 * 매일 바뀌는 동기부여 카드(개인화 한 마디) 핵심 로직.
 *
 * - `users/{uid}/dailyMotivations/{ymd}` 가 단일 진리원천.
 * - 같은 날 호출 시 캐시 반환, 없으면 Gemini 호출로 1건 생성.
 * - 라우트(`/api/daily-motivation`) 와 안드로이드 위젯 라우트(`/api/widget/today`) 가 공유.
 */
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { generateText } from "@/lib/gemini";
import type { DailyMotivation, MotivationGradient } from "@/types";

export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const QUOTE_MAX_LEN = 220;
const FUTURE_PERSONA_TRUNC = 280;
const MAX_GOALS_ON_CARD = 3;
const QUOTE_MODEL_TOKENS = 220;

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

function sanitizeQuote(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^["“”'`*\-•]+/, "").replace(/["“”'`*\-•]+$/, "");
  s = s.replace(/^\s*(오늘의\s*한\s*마디|오늘의\s*격려|메시지)\s*[:：]\s*/i, "");
  s = s.replace(/\s{2,}/g, " ").trim();
  if (s.length > QUOTE_MAX_LEN) s = s.slice(0, QUOTE_MAX_LEN).trim();
  return s;
}

function buildPrompt(opts: {
  displayName: string;
  futurePersona: string;
  goals: string[];
  ymd: string;
}): string {
  const { displayName, futurePersona, goals, ymd } = opts;
  const goalsBlock =
    goals.length > 0
      ? goals.map((g, i) => `${i + 1}. ${g}`).join("\n")
      : "(아직 목표가 적혀 있지 않음)";

  return `당신은 사용자 본인의 "10년 후의 나"입니다. 이미 목표를 모두 이루고, 그 길을 후회 없이 걸어온 미래의 자신이죠.
오늘 ${ymd} (KST), 과거의 자신(현재의 사용자)에게 잠금화면에 띄울 짧은 한 마디를 보냅니다.

## 사용자 정보
- 이름: ${displayName}
- 10년 후 되고 싶은 모습:
${futurePersona || "(아직 적어두지 않음)"}
- 지금 바라보고 있는 목표:
${goalsBlock}

## 출력 규칙 (반드시 지킴)
- 한국어 1~2 문장, 총 50자 이상 110자 이하.
- 따뜻하지만 단호한 어조. 미래의 자신이 과거의 자신에게 보내는 편지 톤.
- 사용자 이름이나 "당신"으로 부르지 말고 "너" 라고 부른다.
- 진부한 자기계발 클리셰 ("할 수 있어요", "꿈은 이루어진다") 금지.
- 사용자가 적은 목표/미래 모습과 구체적으로 연결된 한 마디.
- 구두점은 마침표·쉼표·물음표만. 이모지·따옴표·해시태그·마크다운 금지.
- 출력은 메시지 본문만. "오늘의 한 마디:" 같은 라벨 붙이지 말 것.

## 출력 (메시지 본문만):`;
}

interface UserContext {
  displayName: string;
  futurePersona: string;
  goals: string[];
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
  return { displayName, futurePersona, goals };
}

function fallbackQuote(goals: string[]): string {
  if (goals.length > 0) {
    return `오늘 너의 한 걸음이 10년 뒤의 내 모습을 만들었어. "${goals[0]}" — 작게라도, 멈추지만 마.`;
  }
  return "10년 뒤 내가 너에게 가장 고마운 건, 오늘 포기하지 않은 그 작은 선택이야.";
}

/**
 * 오늘(또는 지정 ymd) 의 동기부여 카드 1건을 보장한다.
 * - force=false (기본): 캐시 있으면 그대로 반환.
 * - force=true: 강제 재생성.
 */
export async function ensureMotivation(opts: {
  uid: string;
  ymd: string;
  force?: boolean;
}): Promise<{ motivation: DailyMotivation; cached: boolean }> {
  const { uid, ymd, force = false } = opts;
  const ref = getAdminDb().doc(`users/${uid}/dailyMotivations/${ymd}`);
  if (!force) {
    const existing = await ref.get();
    if (existing.exists) {
      return { motivation: existing.data() as DailyMotivation, cached: true };
    }
  }

  const ctx = await fetchUserContext(uid);
  const gradient = pickGradient(`${uid}:${ymd}`);

  let quote: string;
  try {
    const raw = await generateText(
      buildPrompt({
        displayName: ctx.displayName,
        futurePersona: ctx.futurePersona,
        goals: ctx.goals,
        ymd,
      }),
      QUOTE_MODEL_TOKENS,
    );
    const cleaned = sanitizeQuote(raw);
    quote = cleaned.length >= 10 ? cleaned : fallbackQuote(ctx.goals);
  } catch (err) {
    console.warn(
      "[dailyMotivation] Gemini 실패, 폴백 사용:",
      err instanceof Error ? err.message : err,
    );
    quote = fallbackQuote(ctx.goals);
  }

  const motivation: DailyMotivation = {
    ymd,
    quote,
    author: "10년 후의 나",
    goalsSnapshot: ctx.goals,
    futurePersonaSnapshot: ctx.futurePersona || undefined,
    gradient,
    createdAt: Timestamp.now() as unknown as DailyMotivation["createdAt"],
  };

  await ref.set(motivation);
  return { motivation, cached: false };
}
