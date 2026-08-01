/**
 * 온보딩 Step 2 맞춤 제안 — "꿈 한 문장" 에서 성공 선언 후보 + 오늘의 목표 후보 (서버 전용).
 *
 * 왜 필요한가: Step 1 에서 자기 꿈을 방금 적었는데 Step 2 가 모두에게 똑같은 정적 예시를
 * 보여주면, 온보딩이 내 이야기를 듣고 있다는 감각이 그 자리에서 끊긴다. 같은 재료(dream)로
 * 두 칸의 후보를 **한 번의 LLM 호출**로 만들어 화면 진입과 동시에 채운다.
 *
 * 폴백 정책이 lib/executionPlan.ts 와 다른 점: 저쪽은 클라이언트에 대체 문구가 없어 서버가
 * 언어별 템플릿을 들고 있어야 하지만, 온보딩 화면은 이미 i18n 사전에 정적 예시를 갖고 있다.
 * 그래서 여기서는 실패 시 null 을 돌려주고 화면이 기존 정적 예시로 조용히 되돌아간다 —
 * 같은 성격의 문구를 서버와 사전 두 곳에 중복으로 두지 않기 위해서다(DRY).
 *
 * 프라이버시: 꿈 문장은 사용자의 사적인 텍스트다. 어떤 경로에서도 로그로 남기지 않는다
 * (실패 시 에러 메시지만 기록).
 */
import { generateText } from "@/lib/gemini";
import { geminiLanguageName, normalizeLanguage } from "@/lib/llmLang";
import { FUTURE_SELF_FIELD_MAX } from "@/lib/futureSelf";
import { SUCCESS_AFFIRMATION_MAX_LEN, GOAL_TEXT_MAX } from "@/lib/constants/goal";
import { normalizeGoalText } from "@/lib/goalText";
import { needsMoreSpecificGoal } from "@/lib/goalQuality";
import type { UserLanguage } from "@/types";

/** 칸당 제안 개수 — UI 칩 개수와 프롬프트가 같은 값을 봐야 한다. */
export const ONBOARDING_SUGGESTION_COUNT = 3;
/** 짧은 문장 6개(선언 3 + 목표 3)면 충분한 토큰. */
const SUGGEST_TOKENS = 600;
/** 창작형 작업 — 기본(0.3)보다 높여 사람마다 다른 문장이 나오게 한다. */
const SUGGEST_TEMPERATURE = 0.8;

export interface OnboardingSuggestions {
  /** 이미 이룬 상태의 1인칭 선언 후보 (≤ SUCCESS_AFFIRMATION_MAX_LEN). */
  declarations: string[];
  /** 오늘 당장 실행 가능한 목표 후보 (≤ GOAL_TEXT_MAX, 구체성 통과분만). */
  goals: string[];
}

function buildPrompt(dream: string, language: UserLanguage): string {
  const langName = geminiLanguageName(language);
  return `You are an onboarding coach for a daily-motivation app. The user just wrote the one dream they truly want to reach. Turn it into ready-to-tap suggestions for the next screen.

## The user's dream (their own words)
"""
${dream}
"""

## What to produce
A) "declarations" — ${ONBOARDING_SUGGESTION_COUNT} identity statements, first person, present tense, written as if the dream is ALREADY true ("I am someone who…"). Each names a different facet of the dream (e.g. the money/freedom facet, the daily-life facet, the person-they-are-to-others facet). Never mention deadlines or figures — this is who they are, not a KPI. Max ${SUCCESS_AFFIRMATION_MAX_LEN} characters each.

B) "goals" — ${ONBOARDING_SUGGESTION_COUNT} actions the user can do TODAY and repeat every day, each one a real step toward that dream. Rules:
   1. Small enough to finish on their busiest day — they will only pick ONE and repeat it daily. Never a plan, a project, or a milestone.
   2. Every goal MUST contain a number, a cadence, and a countable unit (e.g. "30 minutes", "10 pages", "3 times a week") so the user can tell at a glance whether they did it.
   3. Phrase as an action sentence about doing, not about feeling or wanting.
   4. Each goal targets a different lever of the dream. No duplicates, no clichés.
   5. Max ${GOAL_TEXT_MAX} characters each — this is a hard limit, keep them short.

Write everything in ${langName}, even if the dream above is written in another language. Speak to the user as themselves ("I"), never "you".

## Output (a single JSON object on one line, NO other text, no markdown fence)
{"declarations":["…","…","…"],"goals":["…","…","…"]}`;
}

/**
 * 문자열 정리 — 공백 정규화 + 빈 값/중복 제거. 최대 ONBOARDING_SUGGESTION_COUNT 개.
 *
 * 상한을 넘는 문장은 **자르지 않고 버린다**. 잘라서 넣으면 "…매일 10분 기록하는 습관을 만"
 * 처럼 문장이 끊긴 칩이 나가는데, 탭 한 번으로 그대로 저장되는 자리라 그 손해가
 * 후보 하나를 잃는 것보다 크다. 셋 다 탈락하면 화면이 정적 예시로 돌아간다.
 */
function cleanLines(raw: unknown, maxLen: number): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const value = item.trim().replace(/\s+/g, " ");
    if (value.length === 0 || value.length > maxLen) continue;
    const dedupeKey = value.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push(value);
    if (out.length >= ONBOARDING_SUGGESTION_COUNT) break;
  }
  return out;
}

/**
 * LLM 응답 → 제안 객체. 두 칸 모두 비면 null(= 화면이 정적 예시로 폴백).
 *
 * 목표는 lib/goalQuality 의 구체성 기준을 통과한 것만 남긴다. 이 앱은 사용자가 직접 쓴
 * 모호한 목표에 "조금 더 구체적으로" 힌트를 띄우는데, 앱이 제안한 문장이 그 힌트에
 * 걸리면 앱이 스스로를 반박하는 꼴이 된다.
 */
function parseSuggestions(raw: string): OnboardingSuggestions | null {
  const match = raw.trim().match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const declarations = cleanLines(parsed.declarations, SUCCESS_AFFIRMATION_MAX_LEN);
    // 저장 경로와 같은 정규화를 한 번 더 태워, 칩에 보이는 문장과 저장되는 문장을 일치시킨다.
    const goals = cleanLines(parsed.goals, GOAL_TEXT_MAX)
      .map(normalizeGoalText)
      .filter((g) => g.length > 0 && !needsMoreSpecificGoal(g));
    if (declarations.length === 0 && goals.length === 0) return null;
    return { declarations, goals };
  } catch {
    return null;
  }
}

/**
 * 꿈 한 문장 → Step 2 두 칸의 맞춤 후보.
 * 어떤 실패(타임아웃·레이트리밋·파싱)에도 throw 하지 않고 null 로 떨어진다 —
 * 온보딩은 절대 막히면 안 되는 경로이고, 화면에는 언제나 정적 예시라는 대안이 있다.
 */
export async function suggestOnboardingLines(opts: {
  uid: string;
  dream: string;
  language?: UserLanguage;
}): Promise<OnboardingSuggestions | null> {
  const dream = opts.dream.trim().slice(0, FUTURE_SELF_FIELD_MAX);
  if (dream.length === 0) return null;
  const language = normalizeLanguage(opts.language);

  try {
    const raw = await generateText(
      buildPrompt(dream, language),
      SUGGEST_TOKENS,
      SUGGEST_TEMPERATURE,
      { uid: opts.uid, feature: "onboarding_suggest" },
    );
    const parsed = parseSuggestions(raw);
    if (parsed) return parsed;
    console.warn("[onboardingSuggest] 제안 파싱 실패 — 정적 예시로 폴백");
  } catch (err) {
    // 꿈 문장은 로그에 남기지 않는다 — 에러 메시지만.
    console.warn(
      "[onboardingSuggest] 제안 생성 실패 — 정적 예시로 폴백:",
      err instanceof Error ? err.message : String(err),
    );
  }
  return null;
}
