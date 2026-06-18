/**
 * 매일 바뀌는 "미래 일상" 비전 핵심 로직.
 *
 * 사용자가 적은 futurePersona(10년 후의 나) + goals 를 입력으로, 그 미래가 이미
 * 실현된 "어느 평범한 하루"를 1인칭 현재형으로 생생하게 그려준다. 동기부여 카드가
 * "외부의 한 마디"라면, 이 비전은 "내가 살게 될 하루를 눈앞에 미리 보는" 시각화 도구다.
 *
 * 설계는 `lib/dailyMotivation.ts` 의 `ensureMotivation` 을 그대로 미러링한다.
 * - `users/{uid}/futureVisions/{ymd}` 가 단일 진리원천. 같은 날엔 캐시 반환.
 * - Gemini 호출은 try-catch 로 감싸고, 실패/파싱오류 시 결정론적 폴백 비전을 만든다
 *   → 카드가 어떤 경로에서도 비지 않는다.
 * - 비-force 최초 생성은 `ref.create()` 로 레이스-세이프, force(다시 보기)는 `ref.set()`.
 */
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { generateText } from "@/lib/gemini";
import { geminiLanguageName, normalizeLanguage } from "@/lib/llmLang";
import { pickGradient, hash32 } from "@/lib/dailyMotivation";
import type {
  FutureVision,
  FutureVisionScene,
  MotivationGradient,
  UserLanguage,
} from "@/types";

/** futurePersona 프롬프트 주입 상한 — 동기부여 카드와 동일(280자). */
const FUTURE_PERSONA_TRUNC = 280;
/** 비전 컨텍스트에 넣을 목표 최대 개수. 카드(3개)보다 넉넉히 잡아 하루를 풍부하게. */
const MAX_GOALS_FOR_VISION = 6;
/** hook + title + 여러 장면 + closing 을 한 번에 출력하므로 토큰 한도를 넉넉히. */
const VISION_MODEL_TOKENS = 760;
/** 하루를 이루는 장면 개수 범위. 너무 적으면 단조롭고 많으면 카드가 길어진다. */
const MIN_SCENES = 2;
const MAX_SCENES = 4;
/** 출력 길이 클램프 — UI 가 깨지지 않도록 서버에서 잘라 둔다. */
const TITLE_MAX = 40;
/** 접힌 카드에 보일 호기심 한 줄(teaser) 상한. 너무 길면 미끼의 긴장이 풀린다. */
const HOOK_MAX = 60;
/** "오후 3시, 사무실" 처럼 시간+장소 라벨을 허용하려 기존 14 → 20 으로 넓힘. */
const MOMENT_MAX = 20;
const SCENE_TEXT_MAX = 220;
const CLOSING_MAX = 120;
/** 폴백 장면에 끼워넣을 persona/goal 발췌 길이. */
const PERSONA_EXCERPT = 90;
const GOAL_EXCERPT = 36;

/**
 * 매일 다른 "하루의 결"을 강제하기 위한 결정론적 렌즈 풀.
 * Gemini 가 "아침에 눈을 떠 햇살을 느낀다" 류의 클리셰로 수렴하는 걸 막는 핵심 장치.
 * uid+ymd 해시로 매일 하나가 선택돼, 같은 미래라도 날마다 다른 각도의 하루가 그려진다.
 * (프롬프트는 영어, 출력만 사용자 언어 — 동기부여 카드와 동일한 방식.)
 */
const VISION_LENSES: ReadonlyArray<string> = [
  "Zoom in on a SINGLE vivid moment where this person is recognized or trusted for the very thing they once only dreamed of — a glance, a handshake, words someone says about them.",
  "Show the dream as utterly ORDINARY routine — the success is no longer thrilling, it's just an ordinary day. The power is in how normal, unhurried, and safe it now feels.",
  "Center a moment with PEOPLE — someone who knew them 'before' sees how far they've come, or someone they now lead, mentor, or provide for.",
  "Drop them into a HIGH-STAKES moment (a decision, a stage, a deadline) that they handle with calm mastery — the ease itself is the evidence of how far they've grown.",
  "A QUIET private victory only they can feel — a number on a screen, a key turning in a door, a body that no longer aches with worry. No audience.",
  "Foreground the PLACE — the room, city, view, or workspace they now inhabit. Let the environment itself prove the life they built.",
  "A moment of GIVING BACK — they finally have enough to lift someone else, and feel the full weight of their journey through that single act.",
  "A sensory moment of EARNED REST — good food, movement, sunlight, time that is finally, fully their own.",
];

/** 하루의 진입 시점을 매일 바꿔 '아침 기상' 고정 패턴을 깬다. */
const DAY_WINDOWS: ReadonlyArray<string> = [
  "begin in the late morning, already mid-flow (do NOT start by waking up)",
  "begin at high noon",
  "begin in the slow middle of the afternoon",
  "begin at golden hour, near dusk",
  "begin late in the evening, the day winding down",
  "begin in the very early hours, before the rest of the world is awake",
];

/**
 * 오늘 하루가 비출 "삶의 슬라이스". 렌즈가 감정 각도라면 이건 의미 재료 자체를 바꾼다.
 * 같은 persona/goals 라도 어떤 영역을 비추느냐에 따라 전혀 다른 하루가 그려진다(가장 큰 다채로움 레버).
 */
const LIFE_DOMAINS: ReadonlyArray<string> = [
  "WORK / CRAFT — the actual doing of their work: the tools in hand, a problem solved, a thing shipped or made.",
  "RELATIONSHIPS / FAMILY — a meal, a conversation, a small ritual with the people this life is shared with.",
  "HEALTH / BODY — how their body feels now: movement, breath, food, sleep, a body no longer braced against worry.",
  "MONEY / FREEDOM — a concrete proof of stability: a choice made without flinching, a bill that no longer scares, a 'yes' they can now afford.",
  "HOME / PLACE / TRAVEL — the physical world they move through now: a room, a street, a journey, a view from a window.",
  "RECOGNITION / LEGACY — the work outliving the moment: someone they'll never meet was changed by what they built.",
  "PLAY / ADVENTURE — time spent on something purely for joy, now that the striving is no longer all-consuming.",
  "LEARNING / MASTERY — still growing: a new skill, a hard thing made to look easy, the quiet pleasure of being good at this.",
];

/** 미래의 '언제'인지. 같은 꿈도 시점에 따라 긴장감과 디테일이 달라진다. */
const TIME_HORIZONS: ReadonlyArray<string> = [
  "It is the FIRST YEAR — the earliest real proof the dream is working. Still a little disbelief that it's actually happening.",
  "They are in FULL STRIDE — at the height of it, everything firing, the most vivid season of this life.",
  "It is utterly ORDINARY now — years in, the dream is simply the texture of a normal Tuesday. No drama, just home.",
  "Far ahead, LOOKING BACK — a settled, seasoned version of them notices how far the path ran, with quiet perspective.",
];

/** 명시적 계절+날씨 앵커. 추상 지시 대신 구체 토큰을 줘야 감각 디테일이 실제로 바뀐다. */
const SEASON_WEATHER: ReadonlyArray<string> = [
  "early spring, a cool morning rain on the windows",
  "high summer, bright heat and long light",
  "autumn, crisp air and a low golden evening wind",
  "deep winter, cold outside and warm light indoors",
  "a grey overcast day, soft and quiet, no sun",
  "the clear still air just after a storm has passed",
];

/** 오늘 누가 함께 있는가. 등장인물을 바꿔 감정의 결과 장면을 다양화. */
const CAST: ReadonlyArray<string> = [
  "ALONE — no audience, a moment only they witness.",
  "with someone they LOVE — a partner, parent, or close friend sharing the ordinary moment.",
  "near a former SKEPTIC — someone who once doubted them is here, and sees plainly what is now true (do NOT make it gloating).",
  "with someone they now MENTOR or lead — passing on what they once needed themselves.",
  "with a STRANGER their work quietly touched — they may never know each other's names.",
  "with the NEXT GENERATION — a child or younger person for whom this life is just the normal world they inherit.",
];

/**
 * 가끔(약 4일 중 1일) 장면 대신 다른 서술 포맷으로 하루를 그려 신선함을 준다.
 * 출력 JSON 스키마(title/scenes[moment,text]/closing)는 동일하게 유지 — voice 만 바뀐다.
 * 인덱스 0("scenes")은 기본 시네마틱 장면이므로 별도 지시문 없음.
 */
const FORMATS: ReadonlyArray<string | null> = [
  null, // 0: 기본 시네마틱 장면
  'Render today as a few SHORT MESSAGES someone sends them on this day (a text, a voice-note transcript, a note left on the table). Each "moment" is the sender + time (e.g. "오후 2시, 엄마"); each "text" is the message itself, in that person\'s voice, revealing the life from the outside.',
  'Render today as a JOURNAL ENTRY — a few first-person fragments jotted through the day. Each "moment" is a timestamp; each "text" is a raw, unpolished private note to self.',
  'Render today as OVERHEARD LINES — single sentences they catch other people saying around them today (about them, or just the texture of this world). Each "moment" is who/where; each "text" is the overheard line.',
  'Render today as a small INVENTORY — the specific objects on their desk / in their bag / within reach right now. Each "moment" is the object\'s place; each "text" is the object and the life it quietly proves.',
];
/** FORMATS 중 비기본 포맷이 걸릴 확률 = 1/FORMAT_ODDS (약 4일 중 1일). */
const FORMAT_ODDS = 4;

interface VisionContext {
  displayName: string;
  futurePersona: string;
  goals: string[];
  language: UserLanguage;
}

async function fetchVisionContext(uid: string): Promise<VisionContext> {
  const snap = await getAdminDb().doc(`users/${uid}`).get();
  const data = snap.exists ? snap.data() ?? {} : {};
  const displayName = typeof data.displayName === "string" ? data.displayName : "사용자";
  const personaRaw = typeof data.futurePersona === "string" ? data.futurePersona : "";
  const futurePersona = personaRaw.trim().slice(0, FUTURE_PERSONA_TRUNC);
  const goalsRaw = Array.isArray(data.goals) ? data.goals : [];
  const goals = goalsRaw
    .filter((g: unknown): g is string => typeof g === "string" && g.trim().length > 0)
    .map((g: string) => g.trim())
    .slice(0, MAX_GOALS_FOR_VISION);
  const language = normalizeLanguage(data.language);
  return { displayName, futurePersona, goals, language };
}

/** Gemini 에 "미래가 실현된 하루"를 1인칭 현재형으로 묘사하도록 요청하는 프롬프트. */
function buildVisionPrompt(opts: {
  ctx: VisionContext;
  ymd: string;
  varietySalt: string;
  /** 오늘 하루의 각도(매일 회전) — 클리셰 수렴 방지. */
  lens: string;
  /** 하루의 진입 시점(매일 회전) — '아침 기상' 고정 패턴 차단. */
  dayWindow: string;
  /** 오늘 비출 삶의 영역(매일 회전) — 의미 재료 자체를 바꾼다. */
  domain: string;
  /** 미래의 시점(매일 회전) — 긴장감/디테일을 바꾼다. */
  horizon: string;
  /** 계절+날씨 앵커(매일 회전) — 감각 디테일을 실제로 바꾼다. */
  seasonWeather: string;
  /** 오늘 함께 있는 사람(매일 회전) — 장면의 정서를 다양화. */
  cast: string;
  /** 비기본 서술 포맷 지시문(가끔만) — 없으면 기본 시네마틱 장면. */
  formatDirective: string | null;
}): string {
  const { ctx, ymd, varietySalt, lens, dayWindow, domain, horizon, seasonWeather, cast, formatDirective } = opts;
  const langName = geminiLanguageName(ctx.language);
  const goalsBlock =
    ctx.goals.length > 0
      ? ctx.goals.map((g, i) => `${i + 1}. ${g}`).join("\n")
      : "(no specific goals listed yet)";
  const formatBlock = formatDirective
    ? `\n## Today's FORMAT — OBEY THIS instead of plain narration:\n${formatDirective}\n`
    : "";

  return `You are a vivid scene writer who helps a person FEEL their future as if it is already real.

Write a short, cinematic "a day in the life" of this person AFTER their future self has fully come true. Render it in present tense, first person ("I am ..."), as if they are living that day right now and can see, hear, smell, and feel it.

## The person's future self (already achieved)
${ctx.futurePersona || "(they have not written their future self yet)"}

## Goals they were walking toward (now part of this life)
${goalsBlock}

## Today's lens — OBEY THIS. It is what makes today feel different from every other day:
${lens}

## Today's domain — anchor the whole day in THIS slice of life:
${domain}

## Today's horizon — WHEN in the future this day sits:
${horizon}

## Today's weather & season — make the sensory details match THIS:
${seasonWeather}

## Who is here today:
${cast}

## Where to enter the day
For today, ${dayWindow}, then move naturally from there. Do NOT narrate a full sunrise-to-night arc — stay close to this window and the lens above.
${formatBlock}
## Today: ${ymd} (KST). Variety seed: ${varietySalt} — when this changes, change the concrete details (objects, weather, who is present, the exact place).

## Writing rules
- Output language: EVERY human-readable string (hook, title, moment, text, closing) MUST be written in ${langName}.
- First person, present tense, fully immersive. At least one CONCRETE sensory detail per scene (a smell, a sound, a texture, a temperature, a specific named object) — never abstract pep talk.
- SHOW the success through specific evidence (what they see, do, hold, or are told). NEVER name the emotion directly ("proud", "happy", "grateful") — let the scene make the reader feel it.
- OBEY all of today's anchors above (lens, domain, horizon, weather, who is here, entry point). Do NOT default to "I wake up to morning light / coffee / stretching", and do NOT drift into a generic success cliché unrelated to today's domain.
- Ground every scene in the future self and goals above — earned and specific, NOT generic luxury (no stock clichés like sports cars, yachts, or champagne unless they appear in the persona).
- ${MIN_SCENES}-${MAX_SCENES} scenes. Each "moment" is a short, specific label (a time+place, or per today's FORMAT if given — not just "afternoon").
- Each scene "text": 1-3 sentences, warm, grounded, concrete.
- "hook": ONE short first-person present-tense teaser line (max ~24 chars in ${langName}) that HINTS at today's most striking moment but HIDES its payoff — it must make the reader want to open the day. It must be different from "title" (e.g. "오후 3시, 누군가 내 이름을 부른다 —").
- "title": a short evocative line for THIS particular day reflecting today's lens & domain (max ~20 chars in ${langName}) — not a generic title reusable on any other day.
- "closing": one present-tense first-person line that lands the feeling ("this is my life now").
- If the future self is empty above, gently invite them (in the scenes) to write who they want to become — do NOT invent a fake life.

## Output (a single JSON object on one line, NO other text, NO markdown fences)
{"hook":"<one teaser line>","title":"<one line>","scenes":[{"moment":"<short label>","text":"<1-3 sentences>"}],"closing":"<one line>"}`;
}

function clampText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Gemini 출력에서 첫 JSON 객체를 끄집어내 비전 구조로 검증/정규화. 실패 시 null. */
function parseVision(
  raw: string,
): { hook?: string; title: string; scenes: FutureVisionScene[]; closing?: string } | null {
  const match = raw.trim().match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const title = clampText(parsed.title, TITLE_MAX);
    const scenesRaw = Array.isArray(parsed.scenes) ? parsed.scenes : [];
    const scenes: FutureVisionScene[] = [];
    for (const s of scenesRaw) {
      if (!s || typeof s !== "object") continue;
      const rec = s as Record<string, unknown>;
      const text = clampText(rec.text, SCENE_TEXT_MAX);
      if (!text) continue;
      const moment = clampText(rec.moment, MOMENT_MAX);
      scenes.push({ moment, text });
      if (scenes.length >= MAX_SCENES) break;
    }
    if (!title || scenes.length < MIN_SCENES) return null;
    const closing = clampText(parsed.closing, CLOSING_MAX);
    // hook 은 선택 필드 — 없거나 title 과 같으면 생략(폴백/카드가 title 로 대체).
    const hookRaw = clampText(parsed.hook, HOOK_MAX);
    const hook = hookRaw && hookRaw !== title ? hookRaw : "";
    return { ...(hook ? { hook } : {}), title, scenes, ...(closing ? { closing } : {}) };
  } catch {
    return null;
  }
}

/**
 * 언어별 결정론적 폴백 비전 — Gemini 가 침묵하거나 파싱이 깨져도 카드 톤이 유지되도록.
 * persona/goals 발췌를 끼워넣어 "내 미래"라는 느낌은 살린다.
 */
interface FallbackCopy {
  title: string;
  /** 접힌 카드 teaser — 폴백에서도 호기심 한 줄이 비지 않도록. */
  hook: string;
  emptyTitle: string;
  /** futurePersona 미작성 상태의 teaser. */
  emptyHook: string;
  morning: (persona: string) => string;
  midday: (goal: string) => string;
  middayNoGoal: string;
  evening: string;
  closing: string;
  emptyScene: string;
  emptyClosing: string;
  labels: { morning: string; midday: string; evening: string; invite: string };
}

const FALLBACK_VISIONS: Record<UserLanguage, FallbackCopy> = {
  ko: {
    title: "그 미래를 사는 하루",
    hook: "오늘, 그 하루가 시작된다 —",
    emptyTitle: "아직 그리지 않은 하루",
    emptyHook: "당신의 하루는 아직 비어 있다 —",
    morning: (p) => `아침 햇살에 눈을 뜬다. 내가 그리던 모습 — ${p} — 을 나는 이미 살고 있다.`,
    midday: (g) => `낮에는 "${g}"이(가) 더 이상 목표가 아니라 그냥 내 일상이 되어 있다. 손에 익은 듯 자연스럽다.`,
    middayNoGoal: "낮의 일들이 막힘없이 흘러간다. 내가 바라던 리듬 그대로 하루가 움직인다.",
    evening: "저녁이 되면 오늘 하루가 충분했다는 감각이 가슴에 남는다. 조급함 대신 단단한 평온이 있다.",
    closing: "이건 먼 이야기가 아니다. 나는 지금, 그 길 위에 분명히 서 있다.",
    emptyScene: "되고 싶은 나의 모습을 한 단락 적어보세요. 그러면 매일 그 하루를 눈앞에 그려 드릴게요.",
    emptyClosing: "설정에서 '미래의 나'를 적으면 오늘부터 시작돼요.",
    labels: { morning: "아침", midday: "낮", evening: "저녁", invite: "시작" },
  },
  en: {
    title: "A day living that future",
    hook: "Today, that day begins —",
    emptyTitle: "A day not yet imagined",
    emptyHook: "Your day is still blank —",
    morning: (p) => `I wake to morning light. The person I dreamed of — ${p} — I am already living it.`,
    midday: (g) => `By midday, "${g}" is no longer a goal but simply my ordinary life. It moves through my hands like second nature.`,
    middayNoGoal: "The day flows without friction, moving in exactly the rhythm I once longed for.",
    evening: "By evening a quiet fullness settles in my chest — not restlessness, but a steady calm that today was enough.",
    closing: "This is not a distant story. Right now, I am standing on that very path.",
    emptyScene: "Write a paragraph about who you want to become, and I'll paint that day before your eyes each morning.",
    emptyClosing: "Add your future self in Settings and it begins today.",
    labels: { morning: "Morning", midday: "Midday", evening: "Evening", invite: "Begin" },
  },
  es: {
    title: "Un día viviendo ese futuro",
    hook: "Hoy empieza ese día —",
    emptyTitle: "Un día aún por imaginar",
    emptyHook: "Tu día aún está en blanco —",
    morning: (p) => `Despierto con la luz de la mañana. La persona que soñé — ${p} — ya la estoy viviendo.`,
    midday: (g) => `Al mediodía, "${g}" ya no es una meta, sino simplemente mi vida cotidiana. Fluye en mis manos con naturalidad.`,
    middayNoGoal: "El día fluye sin fricción, con el ritmo exacto que una vez anhelé.",
    evening: "Al anochecer, una plenitud serena se asienta en mi pecho: no inquietud, sino una calma firme de que hoy fue suficiente.",
    closing: "No es una historia lejana. Ahora mismo estoy de pie en ese camino.",
    emptyScene: "Escribe un párrafo sobre quién quieres llegar a ser, y pintaré ese día ante tus ojos cada mañana.",
    emptyClosing: "Añade tu yo futuro en Ajustes y empieza hoy.",
    labels: { morning: "Mañana", midday: "Mediodía", evening: "Noche", invite: "Empezar" },
  },
  zh: {
    title: "活在那个未来的一天",
    hook: "今天,那一天开始了 —",
    emptyTitle: "尚未描绘的一天",
    emptyHook: "你的一天还是空白 —",
    morning: (p) => `我在晨光中醒来。我曾梦想的样子——${p}——我已经在过着这样的生活。`,
    midday: (g) => `到了中午,"${g}"已不再是目标,而只是我日常的一部分,在手中自然流转。`,
    middayNoGoal: "这一天毫无阻碍地流动,正是我曾经渴望的节奏。",
    evening: "夜幕降临时,一种安静的充实感落在心头——不是焦躁,而是今天已然足够的笃定。",
    closing: "这不是遥远的故事。此刻,我正站在那条路上。",
    emptyScene: "写下你想成为的样子,我会每天清晨把那一天描绘在你眼前。",
    emptyClosing: "在设置中写下未来的自己,今天就开始。",
    labels: { morning: "清晨", midday: "中午", evening: "夜晚", invite: "开始" },
  },
};

function buildFallbackVision(ctx: VisionContext): {
  hook: string;
  title: string;
  scenes: FutureVisionScene[];
  closing: string;
} {
  const copy = FALLBACK_VISIONS[ctx.language] ?? FALLBACK_VISIONS.ko;

  if (!ctx.futurePersona) {
    return {
      hook: copy.emptyHook,
      title: copy.emptyTitle,
      scenes: [{ moment: copy.labels.invite, text: copy.emptyScene }],
      closing: copy.emptyClosing,
    };
  }

  const persona = ctx.futurePersona.slice(0, PERSONA_EXCERPT);
  const firstGoal = ctx.goals.length > 0 ? ctx.goals[0].slice(0, GOAL_EXCERPT) : "";
  const scenes: FutureVisionScene[] = [
    { moment: copy.labels.morning, text: copy.morning(persona) },
    {
      moment: copy.labels.midday,
      text: firstGoal ? copy.midday(firstGoal) : copy.middayNoGoal,
    },
    { moment: copy.labels.evening, text: copy.evening },
  ];
  return { hook: copy.hook, title: copy.title, scenes, closing: copy.closing };
}

/**
 * 오늘(또는 지정 ymd)의 미래 일상 비전 1건을 보장한다.
 * - force=false (기본): 캐시 있으면 그대로 반환.
 * - force=true: 강제 재생성("또 다른 하루 보기").
 */
export async function ensureFutureVision(opts: {
  uid: string;
  ymd: string;
  force?: boolean;
}): Promise<{ vision: FutureVision; cached: boolean }> {
  const { uid, ymd, force = false } = opts;
  const ref = getAdminDb().doc(`users/${uid}/futureVisions/${ymd}`);

  if (!force) {
    const existingSnap = await ref.get();
    if (existingSnap.exists) {
      return { vision: existingSnap.data() as FutureVision, cached: true };
    }
  }

  const ctx = await fetchVisionContext(uid);
  const gradient: MotivationGradient = pickGradient(`${uid}:${ymd}:vision`);

  // Gemini 가 같은 입력에 같은 답을 주는 경향이 있어, 호출마다 변하는 시드를 주입.
  const varietySalt = force
    ? `regen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    : ymd;

  // 매일 다른 하루를 만드는 6개 독립 회전 축을 결정론적으로 고른다.
  //   · 비-force: uid+ymd 시드 → 같은 날엔 항상 같은 하루, 다음 날엔 다른 하루.
  //   · force(다시 보기): 가변 시드 → 같은 날에도 매번 새로운 하루가 나온다.
  // 축마다 별도 salt 로 해시해 상관성을 제거(비트 재사용 대비 진짜 독립적).
  //   조합 수 ≈ 8(lens)×6(window)×8(domain)×4(horizon)×6(season)×6(cast) → 사실상 반복 소멸.
  const seedBase = force ? varietySalt : `${uid}:${ymd}`;
  const pick = <T>(pool: ReadonlyArray<T>, salt: string): T =>
    pool[hash32(`${seedBase}:${salt}`) % pool.length];
  const lens = pick(VISION_LENSES, "lens");
  const dayWindow = pick(DAY_WINDOWS, "window");
  const domain = pick(LIFE_DOMAINS, "domain");
  const horizon = pick(TIME_HORIZONS, "horizon");
  const seasonWeather = pick(SEASON_WEATHER, "season");
  const cast = pick(CAST, "cast");
  // 약 FORMAT_ODDS 일 중 1일만 비기본 포맷(문자/일기/엿들은 한마디/인벤토리)을 건다.
  const formatSeed = hash32(`${seedBase}:format`);
  const formatDirective =
    formatSeed % FORMAT_ODDS === 0
      ? FORMATS[1 + ((formatSeed >>> 4) % (FORMATS.length - 1))]
      : null;

  let built: { hook?: string; title: string; scenes: FutureVisionScene[]; closing?: string };
  if (!ctx.futurePersona) {
    // futurePersona 미작성 → Gemini 호출 없이 작성 유도 비전(폴백)을 반환.
    built = buildFallbackVision(ctx);
  } else {
    try {
      const raw = await generateText(
        buildVisionPrompt({
          ctx,
          ymd,
          varietySalt,
          lens,
          dayWindow,
          domain,
          horizon,
          seasonWeather,
          cast,
          formatDirective,
        }),
        VISION_MODEL_TOKENS,
      );
      built = parseVision(raw) ?? buildFallbackVision(ctx);
    } catch (err) {
      console.warn(
        "[futureVision] Gemini 실패, 결정론적 폴백 사용:",
        err instanceof Error ? err.message : err,
      );
      built = buildFallbackVision(ctx);
    }
  }

  const vision: FutureVision = {
    ymd,
    ...(built.hook ? { hook: built.hook } : {}),
    title: built.title,
    scenes: built.scenes,
    ...(built.closing ? { closing: built.closing } : {}),
    ...(ctx.futurePersona ? { futurePersonaSnapshot: ctx.futurePersona } : {}),
    goalsSnapshot: ctx.goals,
    gradient,
    createdAt: Timestamp.now() as unknown as FutureVision["createdAt"],
  };

  // 동시 최초 생성 레이스 차단(동기부여 카드와 동일 전략).
  //   force(명시적 다시 보기)는 의도된 덮어쓰기이므로 set.
  //   최초 생성은 create() 로 원자적 삽입 — 이미 다른 호출이 만들었으면 승자 문서를 읽어 반환.
  if (force) {
    await ref.set(vision);
  } else {
    try {
      await ref.create(vision);
    } catch (err) {
      const winner = await ref.get();
      if (winner.exists) {
        return { vision: winner.data() as FutureVision, cached: true };
      }
      throw err;
    }
  }

  return { vision, cached: false };
}
