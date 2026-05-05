/**
 * 매일 바뀌는 동기부여 카드 (배경화면용) API.
 *
 * - GET  ?ymd=YYYY-MM-DD : 해당 날짜 카드 1개 반환 (없으면 404)
 * - POST { ymd?, force? } : 오늘 카드 보장 (없으면 생성, force=true 면 재생성)
 *
 * 캐시 전략: users/{uid}/dailyMotivations/{ymd} 문서 1건. 같은 날엔 동일 카드 반환.
 *
 * 프라이버시: 사용자 본인만 호출 가능 (verifyRequestUser). 다른 사용자 uid 로 위장 불가.
 */
import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { generateText } from "@/lib/gemini";
import { verifyRequestUser, AuthError } from "@/lib/authServer";
import type { DailyMotivation, MotivationGradient } from "@/types";

export const maxDuration = 30;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const QUOTE_MAX_LEN = 220;
const FUTURE_PERSONA_TRUNC = 280;
const MAX_GOALS_ON_CARD = 3;
const QUOTE_MODEL_TOKENS = 220;

/** 검정 텍스트가 잘 어울리는 라이트 그라데이션 */
const LIGHT_PALETTES: ReadonlyArray<Pick<MotivationGradient, "from" | "to" | "angle">> = [
  { from: "#FDE68A", to: "#FCA5A5", angle: 135 }, // amber → rose
  { from: "#A7F3D0", to: "#93C5FD", angle: 145 }, // mint → sky
  { from: "#FBCFE8", to: "#C7D2FE", angle: 130 }, // pink → indigo soft
  { from: "#FEF3C7", to: "#BFDBFE", angle: 150 }, // butter → sky
  { from: "#FBE2C0", to: "#F4A261", angle: 140 }, // peach
  { from: "#E0F2FE", to: "#FBCFE8", angle: 160 }, // pastel rainbow
];

/** 흰색 텍스트가 어울리는 다크 그라데이션 */
const DARK_PALETTES: ReadonlyArray<Pick<MotivationGradient, "from" | "to" | "angle">> = [
  { from: "#1E1B4B", to: "#7C3AED", angle: 135 }, // indigo → violet (브랜드)
  { from: "#0F172A", to: "#0EA5E9", angle: 150 }, // slate → sky
  { from: "#312E81", to: "#EC4899", angle: 145 }, // indigo → pink
  { from: "#064E3B", to: "#1E40AF", angle: 135 }, // emerald → blue
  { from: "#7F1D1D", to: "#1E1B4B", angle: 160 }, // ruby → indigo
  { from: "#0F172A", to: "#7C3AED", angle: 125 }, // night → violet
];

interface PostBody {
  ymd?: string;
  force?: boolean;
}

/** KST 기준 YYYY-MM-DD */
function todayKst(): string {
  const kst = new Date(Date.now() + KST_OFFSET_MS);
  return kst.toISOString().slice(0, 10);
}

function isValidYmd(ymd: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd);
}

/** uid + ymd 결정론적 해시 (32-bit) */
function hash32(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function pickGradient(uid: string, ymd: string): MotivationGradient {
  const h = hash32(`${uid}:${ymd}`);
  // 짝수 해시면 다크, 홀수면 라이트 — 매일 톤이 바뀌도록
  const useDark = (h & 1) === 0;
  const palette = useDark ? DARK_PALETTES : LIGHT_PALETTES;
  const idx = (h >>> 1) % palette.length;
  return { ...palette[idx], tone: useDark ? "dark" : "light" };
}

function sanitizeQuote(raw: string): string {
  // 마크다운/따옴표/접두 라벨 제거
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

async function fetchUserContext(uid: string): Promise<{
  displayName: string;
  futurePersona: string;
  goals: string[];
}> {
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

export async function GET(request: NextRequest) {
  try {
    const me = await verifyRequestUser(request);
    const url = new URL(request.url);
    const ymdParam = url.searchParams.get("ymd");
    const ymd = ymdParam && isValidYmd(ymdParam) ? ymdParam : todayKst();

    const ref = getAdminDb().doc(`users/${me.uid}/dailyMotivations/${ymd}`);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ exists: false, ymd }, { status: 200 });
    }
    return NextResponse.json({ exists: true, motivation: snap.data() });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[daily-motivation GET] 실패:", msg);
    return NextResponse.json({ error: "동기부여 카드를 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const me = await verifyRequestUser(request);
    let body: PostBody = {};
    try {
      body = (await request.json()) as PostBody;
    } catch {
      // 빈 바디 허용
    }
    const ymd = body.ymd && isValidYmd(body.ymd) ? body.ymd : todayKst();
    const force = body.force === true;

    const ref = getAdminDb().doc(`users/${me.uid}/dailyMotivations/${ymd}`);
    if (!force) {
      const existing = await ref.get();
      if (existing.exists) {
        return NextResponse.json({ motivation: existing.data(), cached: true });
      }
    }

    const ctx = await fetchUserContext(me.uid);
    const gradient = pickGradient(me.uid, ymd);

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
      console.warn("[daily-motivation POST] Gemini 실패, 폴백 사용:", err instanceof Error ? err.message : err);
      quote = fallbackQuote(ctx.goals);
    }

    const motivation: DailyMotivation = {
      ymd,
      quote,
      author: "10년 후의 나",
      goalsSnapshot: ctx.goals,
      futurePersonaSnapshot: ctx.futurePersona || undefined,
      gradient,
      // Admin SDK Timestamp — 클라이언트가 받을 땐 직렬화돼 도착하므로 별도 toDate 처리 불필요
      createdAt: Timestamp.now() as unknown as DailyMotivation["createdAt"],
    };

    await ref.set(motivation);
    return NextResponse.json({ motivation, cached: false });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[daily-motivation POST] 실패:", msg);
    return NextResponse.json({ error: "동기부여 카드를 만들지 못했습니다." }, { status: 500 });
  }
}
