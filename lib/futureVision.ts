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
import { FUTURE_PERSONA_TRUNC } from "@/lib/constants/futurePersona";
import type {
  FutureVision,
  FutureVisionScene,
  MotivationGradient,
  UserLanguage,
} from "@/types";

/** 비전 컨텍스트에 넣을 목표 최대 개수. 카드(3개)보다 넉넉히 잡아 하루를 풍부하게. */
const MAX_GOALS_FOR_VISION = 6;
/**
 * hook + title + 여러 장면(최대 4) + closing 을 한 번에 JSON 으로 출력한다.
 * 한국어/중국어는 음절당 토큰 소모가 커서 760 토큰에선 정상 응답조차 JSON 이 중간에
 * 잘려(truncate) `parseVision` 이 실패 → 매번 동일한 결정론적 폴백으로 떨어졌다.
 * 이것이 "또 다른 하루 보기"가 안 바뀌던 핵심 원인. 4장면 정상 출력을 안전히 담도록 상향.
 * (flash-lite 는 빠르므로 이 길이도 호출당 6s 타임아웃 안에 들어온다.)
 */
const VISION_MODEL_TOKENS = 1400;
/**
 * 미래 비전은 "매번 확연히 다른 하루"가 핵심이라 창의 온도를 높게 잡는다(분석형 0.3 과 대비).
 * 1.0 안팎이면 같은 persona/goals 라도 장면·소재·전개가 회마다 크게 갈린다(JSON 형식은 프롬프트가 강제).
 */
const VISION_TEMPERATURE = 1.0;
/** 같은 날 직전 재생성들의 제목을 몇 개까지 "피하라" 컨텍스트로 들고 갈지(사용자 언급 "지난 5번"). */
const RECENT_TITLES_MAX = 6;
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
 * 오늘이 어떤 "종류의 날"인가 — 가장 큰 다채로움 레버. 평범한 근무일에만 머물지 않고
 * 휴가·창업/런칭·파티·새로운 도전 같은 대담한 장면까지 회전시킨다(사용자 요청).
 * 단, 무슨 occasion 이든 반드시 persona/goals 의 "그 미래" 안에서 벌어지는 일이어야 한다
 * (전혀 다른 사람의 삶을 지어내지 않도록 프롬프트 규칙으로 못 박는다).
 */
const OCCASIONS: ReadonlyArray<string> = [
  "an ORDINARY working day — the dream as plain, unremarkable routine.",
  "a VACATION / a day away — they can now afford to step out of the routine: a trip, a beach, a mountain trail, a foreign hotel window, a slow morning somewhere far from home.",
  "a LAUNCH / FOUNDING day — they start or ship something of their very own (a venture, a studio, a product, a project, a company), the electric nerves of a new beginning built on who they've become.",
  "a CELEBRATION — a party, a gathering, an award night, a milestone marked with people; music, a toast, a room that came together because of them.",
  "a BOLD NEW CHALLENGE — they try something they once thought impossible or off-limits (a big stage, an unfamiliar field, a real risk) and meet it as the person they've grown into.",
  "a day of TRAVEL FOR WORK OR WONDER — somewhere far, a different city or country they now move through with ease, the texture of an unfamiliar place.",
  "a fully RESTORATIVE day — unhurried, time entirely their own, doing something purely for joy with nothing to prove.",
  "a day of GIVING / LEADING — they use what they've built to lift someone else: fund something, mentor, hire, or open a door for another.",
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
  /** 오늘이 "어떤 종류의 날"인가(회마다 회전) — 휴가·창업·파티 등 큰 틀의 변주. */
  occasion: string;
  /** 같은 날 직전 재생성들의 제목 — 모델에 "이건 피하라"로 줘 이전 하루와 겹치지 않게. */
  avoidTitles: string[];
}): string {
  const { ctx, ymd, varietySalt, lens, dayWindow, domain, horizon, seasonWeather, cast, formatDirective, occasion, avoidTitles } = opts;
  const langName = geminiLanguageName(ctx.language);
  const goalsBlock =
    ctx.goals.length > 0
      ? ctx.goals.map((g, i) => `${i + 1}. ${g}`).join("\n")
      : "(no specific goals listed yet)";
  const formatBlock = formatDirective
    ? `\n## Today's FORMAT — OBEY THIS instead of plain narration:\n${formatDirective}\n`
    : "";
  const avoidBlock =
    avoidTitles.length > 0
      ? `\n## AVOID repeating these — they were ALREADY generated for this person recently:\n${avoidTitles
          .map((tt) => `- ${tt}`)
          .join("\n")}\nMake TODAY clearly different from every one above: a different occasion, setting, activity, and people. Do NOT reuse their phrasing, titles, or signature objects.\n`
      : "";

  return `You are a vivid scene writer who helps a person FEEL their future as if it is already real.

Write a short, cinematic "a day in the life" of this person AFTER their future self has fully come true. Render it in present tense, first person ("I am ..."), as if they are living that day right now and can see, hear, smell, and feel it.

## The person's future self (already achieved)
${ctx.futurePersona || "(they have not written their future self yet)"}

## Goals they were walking toward (now part of this life)
${goalsBlock}

## Today's lens — OBEY THIS. It is what makes today feel different from every other day:
${lens}

## Today's occasion — the overall SHAPE of this day. LET THIS LEAD:
${occasion}
Whatever the occasion, it must plausibly belong to the life in the future self & goals above — bend the occasion to fit THAT life. NEVER invent a different person's life or a success unrelated to their stated future.

## Today's emphasis — the thread to foreground within today's occasion:
${domain}

## Today's horizon — WHEN in the future this day sits:
${horizon}

## Today's weather & season — make the sensory details match THIS:
${seasonWeather}

## Who is here today:
${cast}

## Where to enter the day
For today, ${dayWindow}, then move naturally from there. Do NOT narrate a full sunrise-to-night arc — stay close to this window and the lens above.
${formatBlock}${avoidBlock}
## Today: ${ymd} (KST). Variety seed: ${varietySalt} — when this changes, change EVERYTHING concrete: the occasion, the place, the activity, the people present, the objects, the weather.

## Writing rules
- Output language: EVERY human-readable string (hook, title, moment, text, closing) MUST be written in ${langName}.
- First person, present tense, fully immersive. At least one CONCRETE sensory detail per scene (a smell, a sound, a texture, a temperature, a specific named object) — never abstract pep talk.
- SHOW the success through specific evidence (what they see, do, hold, or are told). NEVER name the emotion directly ("proud", "happy", "grateful") — let the scene make the reader feel it.
- OBEY all of today's anchors above (occasion, lens, emphasis, horizon, weather, who is here, entry point). Do NOT default to "I wake up to morning light / coffee / stretching", and do NOT drift into a generic success cliché unrelated to today's occasion.
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
 * 언어별 결정론적 폴백 비전 — Gemini 가 침묵하거나(타임아웃/레이트리밋) 파싱이 깨져도
 * 카드 톤이 유지되도록.
 *
 * 설계 원칙(사용자 요청): 사용자가 적은 futurePersona/goal 원문을 프레임에 그대로
 * 끼워넣지 않는다. 자유서술은 문장 중간에서 잘리거나("...많은 기업들이 — 을") 조사
 * (이/가·을/를) 플레이스홀더가 노출돼 "어색하게 그대로 삽입"되기 때문이다. 대신 그
 * 미래가 이미 실현된 "평범한 하루"를 감각적으로 그린 자족적(self-contained) 장면들로
 * 구성하고, variantSeed 로 여러 하루 중 하나를 골라 "또 다른 하루 보기"에서도 매번 다른
 * 하루가 나오게 한다.
 * (개인화된 구체 장면은 Gemini 경로의 몫 — 폴백은 어떤 persona 에도 자연스러운 안전망.)
 */
interface FallbackDay {
  hook: string;
  title: string;
  scenes: ReadonlyArray<{ moment: string; text: string }>;
  closing: string;
}

interface FallbackCopy {
  emptyTitle: string;
  /** futurePersona 미작성 상태의 teaser. */
  emptyHook: string;
  emptyScene: string;
  emptyClosing: string;
  /** futurePersona 미작성 안내 장면의 라벨. */
  inviteLabel: string;
  /** persona 가 있을 때 쓰는 자연스러운 '하루' 변주 — variantSeed 로 하나 선택. */
  days: ReadonlyArray<FallbackDay>;
}

const FALLBACK_VISIONS: Record<UserLanguage, FallbackCopy> = {
  ko: {
    emptyTitle: "아직 그리지 않은 하루",
    emptyHook: "당신의 하루는 아직 비어 있다 —",
    emptyScene: "이루고 싶은 꿈을 한 단락 적어보세요. 그러면 매일 그 꿈이 이뤄진 하루를 눈앞에 그려 드릴게요.",
    emptyClosing: "설정에서 '내 꿈'을 적으면 오늘부터 시작돼요.",
    inviteLabel: "시작",
    days: [
      {
        hook: "눈을 뜨면, 그 하루가 나를 기다린다 —",
        title: "이미 도착해 있는 하루",
        scenes: [
          { moment: "아침", text: "서두르지 않아도 되는 아침이 열린다. 한때 간절히 그리던 모습은 이제 특별한 사건이 아니라, 그냥 오늘의 결이 되어 있다." },
          { moment: "낮", text: "낮의 일들이 손에 익어 막힘없이 흘러간다. 애써 다잡지 않아도 몸이 먼저 알고 움직인다." },
          { moment: "저녁", text: "창밖으로 하루가 저문다. 조급함 대신, 오늘로 충분했다는 감각이 가슴에 낮게 내려앉는다." },
        ],
        closing: "이건 먼 이야기가 아니다. 나는 지금, 그 하루 안에서 살고 있다.",
      },
      {
        hook: "익숙한 문을 여는 순간 —",
        title: "내가 만든 자리에서",
        scenes: [
          { moment: "한낮", text: "내가 앉은 자리에서 익숙한 풍경을 바라본다. 오래 바라던 이곳이 지금은 그저 나의 하루가 되어 있다." },
          { moment: "오후", text: "누군가 건네는 말 한마디에, 예전의 내가 여기까지 왔다는 걸 문득 실감한다. 큰 소리 없이, 조용히." },
          { moment: "해질 무렵", text: "선선한 저녁 공기 속에서 하루가 단정하게 마무리된다. 마음엔 단단한 평온만 남는다." },
        ],
        closing: "상상만 하던 하루가 아니다. 나는 지금, 그 하루를 살아내고 있다.",
      },
      {
        hook: "오늘은 아무것도 증명하지 않아도 된다 —",
        title: "온전히 내 것인 하루",
        scenes: [
          { moment: "느지막한 아침", text: "따뜻한 잔의 온기가 손끝에 번진다. 시간이 온전히 내 것이라는 사실이 새삼 낯설고, 또 익숙하다." },
          { moment: "낮", text: "곁에 있는 사람과 나누는 평범한 대화 속에, 내가 바라던 삶의 온도가 그대로 담겨 있다." },
          { moment: "저녁", text: "해 질 무렵, 오늘 하루가 넉넉했다는 마음이 조용히 차오른다. 더 바랄 것도, 서두를 것도 없다." },
        ],
        closing: "이 평온은 우연이 아니다. 내가 걸어와 지금 서 있는, 바로 그 자리다.",
      },
    ],
  },
  en: {
    emptyTitle: "A day not yet imagined",
    emptyHook: "Your day is still blank —",
    emptyScene: "Write a paragraph about the dream you're going after, and I'll paint the day it comes true before your eyes each morning.",
    emptyClosing: "Add your dream in Settings and it begins today.",
    inviteLabel: "Begin",
    days: [
      {
        hook: "I wake, and the day is already mine —",
        title: "A day I've already arrived in",
        scenes: [
          { moment: "Morning", text: "The morning opens with nothing to rush toward. What I once longed for isn't an event anymore — it's simply the grain of an ordinary day." },
          { moment: "Midday", text: "The work moves through my hands without friction. I don't have to brace or push; my body already knows the way." },
          { moment: "Evening", text: "The day dims beyond the window. In place of restlessness, a low, steady sense that today was enough settles in my chest." },
        ],
        closing: "This is not a distant story. Right now, I am living inside that day.",
      },
      {
        hook: "The moment I open that familiar door —",
        title: "In the place I built",
        scenes: [
          { moment: "Midday", text: "From where I sit, I take in a view I know by heart. The place I reached for so long is now just where my day happens." },
          { moment: "Afternoon", text: "A passing word from someone lands, and I quietly realize how far the old me actually came. No fanfare — just quiet." },
          { moment: "Dusk", text: "In the cool evening air the day closes cleanly, leaving nothing behind but a firm, settled calm." },
        ],
        closing: "This isn't a day I only imagined. Right now, I am living it out.",
      },
      {
        hook: "Today, I have nothing to prove —",
        title: "A day entirely my own",
        scenes: [
          { moment: "Late morning", text: "The warmth of a cup spreads through my fingertips. That my time is fully my own feels strange and familiar all at once." },
          { moment: "Midday", text: "In an ordinary conversation with someone close, the exact temperature of the life I wanted is simply there." },
          { moment: "Evening", text: "As the sun lowers, a quiet fullness rises — today was plenty. Nothing more to want, nothing to hurry." },
        ],
        closing: "This calm is no accident. It is the very ground I walked toward, and now stand on.",
      },
    ],
  },
  es: {
    emptyTitle: "Un día aún por imaginar",
    emptyHook: "Tu día aún está en blanco —",
    emptyScene: "Escribe un párrafo sobre el sueño que persigues y pintaré ante tus ojos el día en que se cumple.",
    emptyClosing: "Añade tu sueño en Ajustes y empieza hoy.",
    inviteLabel: "Empezar",
    days: [
      {
        hook: "Despierto, y el día ya es mío —",
        title: "Un día al que ya he llegado",
        scenes: [
          { moment: "Mañana", text: "La mañana se abre sin nada que apresurar. Lo que tanto anhelé ya no es un acontecimiento: es simplemente la textura de un día común." },
          { moment: "Mediodía", text: "El trabajo fluye entre mis manos sin fricción. No necesito tensarme ni empujar; mi cuerpo ya conoce el camino." },
          { moment: "Noche", text: "El día se apaga tras la ventana. En lugar de inquietud, se asienta en mi pecho la calma serena de que hoy fue suficiente." },
        ],
        closing: "No es una historia lejana. Ahora mismo estoy viviendo dentro de ese día.",
      },
      {
        hook: "En el instante en que abro esa puerta conocida —",
        title: "En el lugar que construí",
        scenes: [
          { moment: "Mediodía", text: "Desde donde estoy, contemplo un paisaje que conozco de memoria. El lugar que busqué tanto tiempo es ahora, sin más, donde transcurre mi día." },
          { moment: "Tarde", text: "Una palabra al pasar de alguien me alcanza, y comprendo en silencio cuánto avanzó aquel que fui. Sin alardes, en calma." },
          { moment: "Atardecer", text: "En el aire fresco de la tarde el día se cierra con nitidez, dejando solo una calma firme y asentada." },
        ],
        closing: "No es un día que solo imaginé. Ahora mismo lo estoy viviendo.",
      },
      {
        hook: "Hoy no tengo nada que demostrar —",
        title: "Un día enteramente mío",
        scenes: [
          { moment: "Media mañana", text: "El calor de una taza se extiende por mis dedos. Que mi tiempo sea del todo mío se siente extraño y familiar a la vez." },
          { moment: "Mediodía", text: "En una charla cualquiera con alguien cercano, está, sin más, la temperatura exacta de la vida que quería." },
          { moment: "Noche", text: "Cuando el sol baja, una plenitud tranquila me sube: hoy bastó. Nada más que desear, nada que apurar." },
        ],
        closing: "Esta calma no es casualidad. Es el mismo suelo hacia el que caminé, y sobre el que ahora estoy.",
      },
    ],
  },
  zh: {
    emptyTitle: "尚未描绘的一天",
    emptyHook: "你的一天还是空白 —",
    emptyScene: "写下你想实现的梦想,我会每天清晨把梦想成真的那一天描绘在你眼前。",
    emptyClosing: "在设置中写下你的梦想,今天就开始。",
    inviteLabel: "开始",
    days: [
      {
        hook: "睁开眼,那一天已经属于我 —",
        title: "早已抵达的一天",
        scenes: [
          { moment: "清晨", text: "清晨到来,无需匆忙。曾经苦苦渴望的模样,如今不再是大事,只是寻常一天的纹理。" },
          { moment: "中午", text: "手上的事顺畅地流动,不必用力紧绷,身体早已知道该怎么做。" },
          { moment: "夜晚", text: "窗外天色渐暗。取代焦躁的,是一种今天已然足够的沉稳,悄悄落在心口。" },
        ],
        closing: "这不是遥远的故事。此刻,我正活在那一天里。",
      },
      {
        hook: "推开那扇熟悉的门的瞬间 —",
        title: "在我亲手造就的位置上",
        scenes: [
          { moment: "正午", text: "从我所在的位置望去,是早已烂熟于心的风景。追寻已久的这里,如今只是我一天的日常。" },
          { moment: "午后", text: "有人随口的一句话落下,我悄然意识到,曾经的自己竟走了这么远。没有喧哗,只是安静。" },
          { moment: "黄昏", text: "傍晚清凉的空气里,一天利落地收束,只留下一份笃定的平静。" },
        ],
        closing: "这不是我只是想象过的一天。此刻,我正把它活出来。",
      },
      {
        hook: "今天,我无需证明什么 —",
        title: "完全属于我的一天",
        scenes: [
          { moment: "上午晚些时候", text: "一杯的温热在指尖散开。时间完全属于自己,这件事既陌生又熟悉。" },
          { moment: "中午", text: "与身边人一段平常的交谈里,我想要的那种生活的温度,就这样在其中。" },
          { moment: "夜晚", text: "日头西沉时,一种安静的充实悄悄升起——今天很够了。再无所求,也无需匆忙。" },
        ],
        closing: "这份平静并非偶然。它正是我一路走来、此刻站定的那片土地。",
      },
    ],
  },
};

function buildFallbackVision(
  ctx: VisionContext,
  variantSeed = 0,
): {
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
      scenes: [{ moment: copy.inviteLabel, text: copy.emptyScene }],
      closing: copy.emptyClosing,
    };
  }

  // persona/goal 원문을 프레임에 끼워넣지 않고, 자족적 '하루' 변주 중 하나를 고른다.
  //  variantSeed 가 바뀌면(=force 재생성) 다른 하루가 나와 "또 다른 하루 보기"가 굳지 않는다.
  const day = copy.days[variantSeed % copy.days.length];
  return {
    hook: day.hook,
    title: day.title,
    scenes: day.scenes.map((s) => ({ moment: s.moment, text: s.text })),
    closing: day.closing,
  };
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

  // force 든 아니든 직전 문서를 한 번 읽는다.
  //   · 비-force: 캐시 히트면 그대로 반환.
  //   · force(또 다른 하루): 덮어쓰기 직전 비전의 제목들을 모아 "이건 피하라" anti-repeat
  //     컨텍스트로 쓴다 → 직전에 그린 하루들과 확연히 다른 하루가 나온다.
  const existingSnap = await ref.get();
  if (!force && existingSnap.exists) {
    return { vision: existingSnap.data() as FutureVision, cached: true };
  }
  let avoidTitles: string[] = [];
  if (force && existingSnap.exists) {
    const prev = existingSnap.data() as FutureVision;
    const prior = Array.isArray(prev.recentTitles) ? prev.recentTitles : [];
    avoidTitles = [...prior, prev.title]
      .filter((tt): tt is string => typeof tt === "string" && tt.trim().length > 0)
      .slice(-RECENT_TITLES_MAX);
  }

  const ctx = await fetchVisionContext(uid);

  // Gemini 가 같은 입력에 같은 답을 주는 경향이 있어, 호출마다 변하는 시드를 주입.
  const varietySalt = force
    ? `regen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    : ymd;

  // 그라데이션(카드 색)도 force 재생성마다 달라지게 해 시각적으로도 "다른 하루"임을 강조.
  const gradient: MotivationGradient = pickGradient(
    force ? `${uid}:${ymd}:vision:${varietySalt}` : `${uid}:${ymd}:vision`,
  );

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
  // 오늘이 "어떤 종류의 날"인가 — 휴가·창업·파티·새 도전 등 큰 틀의 변주(가장 큰 다채로움 레버).
  const occasion = pick(OCCASIONS, "occasion");
  // 약 FORMAT_ODDS 일 중 1일만 비기본 포맷(문자/일기/엿들은 한마디/인벤토리)을 건다.
  const formatSeed = hash32(`${seedBase}:format`);
  const formatDirective =
    formatSeed % FORMAT_ODDS === 0
      ? FORMATS[1 + ((formatSeed >>> 4) % (FORMATS.length - 1))]
      : null;
  // 폴백 비전도 seed 에 따라 다른 목표를 조명하도록 — Gemini 가 잠시 쉬어(폴백) 떨어져도
  //  "또 다른 하루"가 매번 똑같이 굳지 않게 한다(force 재생성 시 seedBase 가 바뀜).
  const fallbackVariant = hash32(`${seedBase}:fallback`);

  let built: { hook?: string; title: string; scenes: FutureVisionScene[]; closing?: string };
  if (!ctx.futurePersona) {
    // futurePersona 미작성 → Gemini 호출 없이 작성 유도 비전(폴백)을 반환.
    built = buildFallbackVision(ctx, fallbackVariant);
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
          occasion,
          avoidTitles,
        }),
        VISION_MODEL_TOKENS,
        VISION_TEMPERATURE,
        { uid, feature: "future_vision" },
      );
      built = parseVision(raw) ?? buildFallbackVision(ctx, fallbackVariant);
    } catch (err) {
      console.warn(
        "[futureVision] Gemini 실패, 결정론적 폴백 사용:",
        err instanceof Error ? err.message : err,
      );
      built = buildFallbackVision(ctx, fallbackVariant);
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
    // force 재생성 시에만 롤링 히스토리를 남긴다(직전 제목들 + 이번 제목, 중복 제거 후 최근 N개).
    //  다음 "또 다른 하루"가 이 목록을 피하도록 한다. 비-force 최초 생성은 히스토리 없음.
    ...(force
      ? {
          recentTitles: [...new Set([...avoidTitles, built.title].filter(Boolean))].slice(
            -RECENT_TITLES_MAX,
          ),
        }
      : {}),
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
