/**
 * 정체성 라벨 풀 관리 — "나는 ~한 사람이다"의 누적 증거를 모으는 단위.
 *
 * - users/{uid}.identities.labels 에 3~5개 한국어 라벨을 저장.
 * - futurePersona(또는 정해진 시점에 goals) 가 바뀌면 sourcePersonaHash 가 달라지므로 재생성.
 * - 카드 생성 시 dailyMotivation.ts 가 이 풀에서 1개를 골라 mission.identityTag 로 박는다.
 *
 * 환각 방지: 라벨 풀이 없거나 Gemini 가 실패하면 결정론적 폴백 라벨을 쓴다.
 * 카드 한 장은 어떤 경우에도 정체성 1개에 매핑되어야 정체성 카운터가 일관된다.
 */
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { generateText } from "@/lib/gemini";
import { hash32 } from "@/lib/dailyMotivation";
import type { UserIdentities, UserLanguage } from "@/types";

const IDENTITY_MIN = 3;
const IDENTITY_MAX = 5;
const IDENTITY_LABEL_MAX_LEN = 24;
const IDENTITY_GENERATION_TOKENS = 200;

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

/**
 * 언어별 폴백 라벨 풀 — Gemini 생성이 실패해도 카드의 identityTag 가
 * 사용자 언어로 떨어지도록 한다.
 */
const FALLBACK_LABELS: Readonly<Record<UserLanguage, ReadonlyArray<string>>> = {
  ko: ["성장하는 사람", "꾸준한 사람", "용기 있는 사람", "단단한 사람"],
  en: [
    "a person who keeps growing",
    "a person who shows up consistently",
    "a person with quiet courage",
    "a person who stays steady",
  ],
  es: [
    "una persona que sigue creciendo",
    "una persona constante",
    "una persona con coraje silencioso",
    "una persona firme",
  ],
  zh: ["持续成长的人", "始终如一的人", "默默勇敢的人", "稳扎稳打的人"],
};

export function personaHash(
  futurePersona: string,
  goals: ReadonlyArray<string>,
  language: UserLanguage = "ko",
): string {
  // language 도 해시에 포함 — 사용자가 언어를 바꾸면 라벨 풀도 새 언어로 재생성한다.
  const seed = `${language}\n${futurePersona.trim()}\n${goals.map((g) => g.trim()).join("|")}`;
  return hash32(seed).toString(16);
}

function buildIdentityPrompt(
  futurePersona: string,
  goals: ReadonlyArray<string>,
  language: UserLanguage,
): string {
  const langName = geminiLanguageName(language);
  const goalsBlock =
    goals.length > 0
      ? goals.map((g, i) => `${i + 1}. ${g}`).join("\n")
      : "(no goals listed yet)";
  return `You are a coach. Read this person's future self and goals, and pick short identity labels they would want to reinforce with daily action.

## Input
- The version of themselves they want to become in 10 years:
${futurePersona || "(not written yet)"}

- Goals they are walking toward right now:
${goalsBlock}

## Output rules
1. Output ${IDENTITY_MIN}-${IDENTITY_MAX} labels in ${langName}. Each label should read naturally inside the sentence "I am [label]" (or its native equivalent).
2. Form: a short noun phrase, max ${IDENTITY_LABEL_MAX_LEN} characters, e.g.
   - English: "a person who writes every day"
   - Korean: "매일 쓰는 사람"
   - Spanish: "una persona que escribe cada día"
   - Chinese: "每天写作的人"
3. Avoid tired clichés ("a positive person"). Lift the resolve from the inputs above.
4. Labels should not semantically overlap with each other.

## Output (a single JSON object on one line, NO other text)
{"labels":["…","…","…"]}`;
}

function parseLabels(raw: string): string[] | null {
  const match = raw.trim().match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const labels = parsed.labels;
    if (!Array.isArray(labels)) return null;
    const cleaned = labels
      .filter((l): l is string => typeof l === "string")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && l.length <= IDENTITY_LABEL_MAX_LEN);
    // 중복 제거 (의미적 중복은 못 잡지만, 동일 문자열은 막음)
    const unique = Array.from(new Set(cleaned));
    if (unique.length < IDENTITY_MIN) return null;
    return unique.slice(0, IDENTITY_MAX);
  } catch {
    return null;
  }
}

/**
 * 풀이 없거나 (futurePersona+goals) 변경이 감지되면 새로 생성해 저장.
 * 항상 최신 라벨 배열을 반환한다 — 카드 생성기가 바로 사용할 수 있도록.
 */
export async function ensureIdentities(opts: {
  uid: string;
  futurePersona: string;
  goals: ReadonlyArray<string>;
  /** 사용자 UI 언어 — 라벨이 이 언어로 생성된다. 미설정 시 "ko". */
  language?: UserLanguage;
}): Promise<string[]> {
  const { uid, futurePersona, goals } = opts;
  const language = normalizeLanguage(opts.language ?? "ko");
  const hash = personaHash(futurePersona, goals, language);

  const userRef = getAdminDb().doc(`users/${uid}`);
  const snap = await userRef.get();
  const data = snap.exists ? snap.data() ?? {} : {};
  const existing = data.identities as UserIdentities | undefined;

  if (
    existing &&
    Array.isArray(existing.labels) &&
    existing.labels.length >= IDENTITY_MIN &&
    existing.sourcePersonaHash === hash
  ) {
    return existing.labels.slice();
  }

  let labels: string[] | null = null;
  try {
    const raw = await generateText(
      buildIdentityPrompt(futurePersona, goals, language),
      IDENTITY_GENERATION_TOKENS,
    );
    labels = parseLabels(raw);
  } catch (err) {
    console.warn(
      "[identities] 생성 실패, 폴백 사용:",
      err instanceof Error ? err.message : err,
    );
  }

  const fallback = FALLBACK_LABELS[language] ?? FALLBACK_LABELS.ko;
  const finalLabels = labels && labels.length >= IDENTITY_MIN ? labels : fallback.slice();

  const next: UserIdentities = {
    labels: finalLabels,
    generatedAt: Timestamp.now() as unknown as UserIdentities["generatedAt"],
    sourcePersonaHash: hash,
  };

  await userRef.set({ identities: next }, { merge: true });
  return finalLabels.slice();
}
