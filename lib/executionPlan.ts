/**
 * WOOP 실행설계 — 장애물/if-then 제안 생성 (서버 전용).
 *
 * MCII(심상대비+실행의도, Oettingen & Gollwitzer)의 O(Obstacle)-P(Plan) 단계를 돕는다:
 * 사용자의 목표·미래상·최근 잘한 일을 읽고 "내 안의" 장애물 후보 3개와
 * 각각의 if-then 계획 초안을 제안한다. 사용자는 탭 한 번으로 채우고 수정한다.
 *
 * 환각 방지: Gemini 실패/파싱 실패 시 언어별 결정론적 폴백 템플릿(피곤함/휴대폰/미루기)
 * 을 목표 텍스트와 함께 반환 — 어떤 경우에도 정확히 3개의 제안이 나간다.
 * (lib/identities.ts 와 동일한 프롬프트→JSON→폴백 템플릿 구조.)
 */
import { generateText } from "@/lib/gemini";
import { geminiLanguageName, normalizeLanguage } from "@/lib/llmLang";
import type { UserLanguage } from "@/types";

/** 제안 개수 — UI(제안 칩 3개)와 프롬프트가 같은 값을 봐야 한다. */
export const OBSTACLE_SUGGESTION_COUNT = 3;
/** 제안 각 필드 최대 길이 — ExecutionPlan 필드 클램프(EXECUTION_PLAN_FIELD_MAX)와 동일. */
const SUGGESTION_FIELD_MAX = 120;
const OBSTACLE_GENERATION_TOKENS = 500;
/** 창작형 작업 — 기본(0.3)보다 높여 다양한 장애물 후보를 받는다. */
const OBSTACLE_TEMPERATURE = 0.7;
/** 프롬프트에 싣는 최근 잘한 일 최대 개수 — 컨텍스트 비대 방지. */
const RECENT_WINS_MAX = 5;

export interface ObstacleSuggestion {
  /** 나를 막는 "내 안의" 장애물 한 줄. */
  obstacle: string;
  /** if [장애물 상황이 오면] */
  ifText: string;
  /** then [나는 이렇게 한다] */
  thenText: string;
}

/**
 * 언어별 폴백 제안 — Gemini 실패 시에도 WOOP 플로우가 끊기지 않게 한다.
 * `{goal}` 자리에 목표 텍스트가 보간된다.
 */
const FALLBACK_SUGGESTIONS: Readonly<
  Record<UserLanguage, ReadonlyArray<ObstacleSuggestion>>
> = {
  ko: [
    {
      obstacle: "하루를 마치면 너무 피곤해서 미루고 싶어진다",
      ifText: "저녁에 피곤해서 '내일 하지'라는 생각이 들면",
      thenText: "딱 5분만 {goal}에 손을 대고 시작한다",
    },
    {
      obstacle: "휴대폰을 집어 들면 시간이 사라진다",
      ifText: "나도 모르게 휴대폰을 집어 들면",
      thenText: "화면을 끄고 {goal}을 위한 첫 행동 1개를 먼저 한다",
    },
    {
      obstacle: "완벽하게 하려다 시작조차 못 한다",
      ifText: "'아직 준비가 안 됐어'라는 생각이 들면",
      thenText: "가장 작은 한 걸음만 정해 지금 바로 실행한다",
    },
  ],
  en: [
    {
      obstacle: "By evening I'm too tired and want to put it off",
      ifText: "If I feel tired at night and think 'I'll do it tomorrow'",
      thenText: "I start with just 5 minutes on {goal}",
    },
    {
      obstacle: "Once I pick up my phone, time disappears",
      ifText: "If I catch myself picking up my phone",
      thenText: "I turn off the screen and do one small action for {goal} first",
    },
    {
      obstacle: "Trying to do it perfectly keeps me from starting",
      ifText: "If I think 'I'm not ready yet'",
      thenText: "I pick the smallest possible step and do it right now",
    },
  ],
  es: [
    {
      obstacle: "Al final del día estoy demasiado cansado y quiero aplazarlo",
      ifText: "Si por la noche me siento cansado y pienso 'lo haré mañana'",
      thenText: "Empiezo con solo 5 minutos en {goal}",
    },
    {
      obstacle: "Cuando tomo el teléfono, el tiempo desaparece",
      ifText: "Si me descubro tomando el teléfono",
      thenText: "Apago la pantalla y hago primero una pequeña acción para {goal}",
    },
    {
      obstacle: "Querer hacerlo perfecto me impide empezar",
      ifText: "Si pienso 'todavía no estoy listo'",
      thenText: "Elijo el paso más pequeño posible y lo hago ahora mismo",
    },
  ],
  zh: [
    {
      obstacle: "一天结束后太累，总想拖延",
      ifText: "如果晚上感到疲惫，想着'明天再做'",
      thenText: "就先花5分钟着手{goal}",
    },
    {
      obstacle: "一拿起手机时间就消失了",
      ifText: "如果发现自己不自觉拿起手机",
      thenText: "就关掉屏幕，先为{goal}做一个小行动",
    },
    {
      obstacle: "想做到完美反而迟迟无法开始",
      ifText: "如果想着'我还没准备好'",
      thenText: "就选定最小的一步，立刻去做",
    },
  ],
};

function clampField(s: unknown): string {
  return typeof s === "string" ? s.trim().slice(0, SUGGESTION_FIELD_MAX) : "";
}

function buildObstaclePrompt(opts: {
  goal: string;
  futurePersona: string;
  recentWins: ReadonlyArray<string>;
  language: UserLanguage;
}): string {
  const langName = geminiLanguageName(opts.language);
  const winsBlock =
    opts.recentWins.length > 0
      ? opts.recentWins.map((w, i) => `${i + 1}. ${w}`).join("\n")
      : "(none recorded yet)";
  return `You are a behavior-change coach using WOOP / Mental Contrasting with Implementation Intentions (Oettingen).
The user wants to identify their INNER obstacles for a goal, and turn each into an if-then plan.

## Input
- Goal: ${opts.goal}
- Who they want to become (10-year future self): ${opts.futurePersona || "(not written yet)"}
- Small wins they recorded recently (clues to what already works for them):
${winsBlock}

## Rules
1. Suggest exactly ${OBSTACLE_SUGGESTION_COUNT} INNER obstacles — feelings, impulses, thought patterns, habits (e.g. fatigue, phone-scrolling, perfectionism, self-doubt). NEVER external circumstances (other people, money, weather).
2. For each obstacle write an if-then implementation intention:
   - "if": the concrete inner-obstacle moment, phrased so the user can recognize it happening.
   - "then": ONE small, concrete, immediately doable action (≤ 2 minutes to start).
3. Personalize to THIS goal and persona. No clichés. Each obstacle must be distinct.
4. Write everything in ${langName}, each field ≤ ${SUGGESTION_FIELD_MAX} characters.

## Output (a single JSON object on one line, NO other text)
{"suggestions":[{"obstacle":"…","ifText":"…","thenText":"…"},{"obstacle":"…","ifText":"…","thenText":"…"},{"obstacle":"…","ifText":"…","thenText":"…"}]}`;
}

function parseSuggestions(raw: string): ObstacleSuggestion[] | null {
  const match = raw.trim().match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    if (!Array.isArray(parsed.suggestions)) return null;
    const cleaned = parsed.suggestions
      .map((s) => {
        const o = s as Record<string, unknown>;
        return {
          obstacle: clampField(o.obstacle),
          ifText: clampField(o.ifText),
          thenText: clampField(o.thenText),
        };
      })
      .filter((s) => s.obstacle && s.ifText && s.thenText);
    if (cleaned.length < OBSTACLE_SUGGESTION_COUNT) return null;
    return cleaned.slice(0, OBSTACLE_SUGGESTION_COUNT);
  } catch {
    return null;
  }
}

/** 폴백 템플릿의 {goal} 자리에 목표를 보간. */
function fallbackFor(goal: string, language: UserLanguage): ObstacleSuggestion[] {
  const pool = FALLBACK_SUGGESTIONS[language] ?? FALLBACK_SUGGESTIONS.ko;
  const shortGoal = goal.trim().slice(0, 40);
  return pool.map((s) => ({
    obstacle: s.obstacle,
    ifText: s.ifText,
    thenText: s.thenText.replace("{goal}", shortGoal),
  }));
}

/**
 * 목표 1개에 대한 장애물+if-then 제안 3개.
 * 어떤 실패에도 throw 하지 않고 폴백으로 떨어진다(호출 라우트는 쿼터만 관리).
 */
export async function suggestObstacles(opts: {
  uid: string;
  goal: string;
  futurePersona: string;
  recentWins: ReadonlyArray<string>;
  language?: UserLanguage;
}): Promise<ObstacleSuggestion[]> {
  const language = normalizeLanguage(opts.language ?? "ko");
  try {
    const raw = await generateText(
      buildObstaclePrompt({
        goal: opts.goal,
        futurePersona: opts.futurePersona,
        recentWins: opts.recentWins.slice(0, RECENT_WINS_MAX),
        language,
      }),
      OBSTACLE_GENERATION_TOKENS,
      OBSTACLE_TEMPERATURE,
      { uid: opts.uid, feature: "obstacle_suggest" },
    );
    const parsed = parseSuggestions(raw);
    if (parsed) return parsed;
    console.warn("[executionPlan] 제안 파싱 실패 — 폴백 사용");
  } catch (err) {
    console.warn(
      "[executionPlan] 제안 생성 실패 — 폴백 사용:",
      err instanceof Error ? err.message : err,
    );
  }
  return fallbackFor(opts.goal, language);
}
