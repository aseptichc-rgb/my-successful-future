/**
 * 다짐 코치 — 사용자가 쓴 "성공한 나의 모습" 다짐 한 줄을 행동과학적으로 더 효과적인
 * 3가지 스타일로 다듬어 제안한다 (서버 전용).
 *
 *   - process : 결과 선언 대신 오늘의 과정/행동 중심 문장 (자기효능감·실행 연결).
 *   - question: 의문형 자기대화 — "나는 오늘 ~할까?" (Senay et al. 2010:
 *               선언형("I will")보다 의문형("Will I?")이 내재 동기·수행을 높인다).
 *   - identity: "나는 ~하는 사람이다" 정체성 프레이밍 (identity-based habits).
 *
 * 따라쓰기 체크인 플로우는 이 모듈과 무관하게 그대로다 — 제안은 AffirmationsEditor 에서
 * 사용자가 탭해 교체할 때만 반영된다.
 *
 * 환각 방지: Gemini 실패/파싱 실패 시 언어별 규칙 기반 리프레이즈로 폴백 —
 * 어떤 경우에도 정확히 3개의 제안이 나간다. (lib/identities.ts 와 동일 구조.)
 */
import { generateText } from "@/lib/gemini";
import { geminiLanguageName, normalizeLanguage } from "@/lib/llmLang";
import type { UserLanguage } from "@/types";

/** 다짐 저장 한도(lib/firebase.ts SUCCESS_AFFIRMATION_MAX_LEN)와 동일해야 교체 시 잘리지 않는다. */
const REWRITE_MAX_LEN = 60;
export const REWRITE_STYLES = ["process", "question", "identity"] as const;
export type RewriteStyle = (typeof REWRITE_STYLES)[number];
const COACH_GENERATION_TOKENS = 300;
/** 창작형 — 결정적 선택 작업(0.3)보다 높인다. */
const COACH_TEMPERATURE = 0.7;
/** 입력 다짐 최대 길이 — 저장 한도와 동일하게 검증. */
export const COACH_INPUT_MAX_LEN = 60;

export interface AffirmationRewrite {
  style: RewriteStyle;
  text: string;
}

/**
 * 규칙 기반 폴백 — 입력 다짐의 핵심(끝 어미를 뗀 몸통)을 세 스타일 틀에 끼운다.
 * LLM 품질에는 못 미치지만 사용자가 편집 가능한 초안으로 충분하다.
 */
function fallbackRewrites(text: string, language: UserLanguage): AffirmationRewrite[] {
  // 핵심 추출: 문장 부호 제거 + 길이 여유(틀 문구가 붙어도 60자 안에 들도록).
  const core = text
    .trim()
    .replace(/[.!?。！？…]+$/u, "")
    .slice(0, 40);
  const templates: Record<UserLanguage, Record<RewriteStyle, string>> = {
    ko: {
      process: `나는 오늘 ${core}에 한 걸음 다가간다`,
      question: `나는 오늘 ${core}을 해낼까?`,
      identity: `나는 매일 ${core}을 실천하는 사람이다`,
    },
    en: {
      process: `Today I take one step toward ${core}`,
      question: `Will I move toward ${core} today?`,
      identity: `I am someone who works on ${core} daily`,
    },
    es: {
      process: `Hoy doy un paso hacia ${core}`,
      question: `¿Avanzaré hoy hacia ${core}?`,
      identity: `Soy una persona que trabaja cada día en ${core}`,
    },
    zh: {
      process: `今天我向${core}迈进一步`,
      question: `今天我会朝${core}前进吗？`,
      identity: `我是每天践行${core}的人`,
    },
  };
  const set = templates[language] ?? templates.ko;
  return REWRITE_STYLES.map((style) => ({
    style,
    text: set[style].slice(0, REWRITE_MAX_LEN),
  }));
}

function buildCoachPrompt(text: string, language: UserLanguage): string {
  const langName = geminiLanguageName(language);
  return `You are an affirmation coach grounded in behavior science.
The user wrote this daily affirmation (they hand-copy it every day as a ritual):

"${text}"

Rewrite it in exactly 3 styles:
1. "process": focus on today's concrete PROCESS/action, not the end result. Present tense.
2. "question": interrogative self-talk — turn it into a motivating question to oneself ("Will I … today?" style; Senay 2010 shows questions beat declarations for follow-through).
3. "identity": "I am a person who …" identity framing that the daily action reinforces.

Rules:
- Keep the user's original intent and key words. Do not invent new goals.
- Each rewrite must be natural in ${langName}, one sentence, ≤ ${REWRITE_MAX_LEN} characters.
- No numbering, no quotes inside the text.

## Output (a single JSON object on one line, NO other text)
{"suggestions":[{"style":"process","text":"…"},{"style":"question","text":"…"},{"style":"identity","text":"…"}]}`;
}

function parseRewrites(raw: string): AffirmationRewrite[] | null {
  const match = raw.trim().match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    if (!Array.isArray(parsed.suggestions)) return null;
    const byStyle = new Map<RewriteStyle, string>();
    for (const s of parsed.suggestions) {
      const o = s as Record<string, unknown>;
      const style = o.style;
      const text = typeof o.text === "string" ? o.text.trim().slice(0, REWRITE_MAX_LEN) : "";
      if (
        (style === "process" || style === "question" || style === "identity") &&
        text.length > 0 &&
        !byStyle.has(style)
      ) {
        byStyle.set(style, text);
      }
    }
    if (byStyle.size < REWRITE_STYLES.length) return null;
    return REWRITE_STYLES.map((style) => ({ style, text: byStyle.get(style) as string }));
  } catch {
    return null;
  }
}

/**
 * 다짐 한 줄 → 3가지 스타일 리라이트.
 * 어떤 실패에도 throw 하지 않고 폴백으로 떨어진다(호출 라우트는 쿼터만 관리).
 */
export async function suggestAffirmationRewrites(opts: {
  uid: string;
  text: string;
  language?: UserLanguage;
}): Promise<AffirmationRewrite[]> {
  const language = normalizeLanguage(opts.language ?? "ko");
  try {
    const raw = await generateText(
      buildCoachPrompt(opts.text, language),
      COACH_GENERATION_TOKENS,
      COACH_TEMPERATURE,
      { uid: opts.uid, feature: "affirmation_coach" },
    );
    const parsed = parseRewrites(raw);
    if (parsed) return parsed;
    console.warn("[affirmationCoach] 파싱 실패 — 폴백 사용");
  } catch (err) {
    console.warn(
      "[affirmationCoach] 생성 실패 — 폴백 사용:",
      err instanceof Error ? err.message : err,
    );
  }
  return fallbackRewrites(opts.text, language);
}
