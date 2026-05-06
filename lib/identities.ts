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
import type { UserIdentities } from "@/types";

const IDENTITY_MIN = 3;
const IDENTITY_MAX = 5;
const IDENTITY_LABEL_MAX_LEN = 16;
const IDENTITY_GENERATION_TOKENS = 200;

/**
 * 라벨 풀이 비어 있을 때 사용하는 폴백.
 * 어떤 사용자에게도 무리 없이 매핑되는 일반화된 정체성.
 */
const FALLBACK_LABELS: ReadonlyArray<string> = [
  "성장하는 사람",
  "꾸준한 사람",
  "용기 있는 사람",
  "단단한 사람",
];

export function personaHash(futurePersona: string, goals: ReadonlyArray<string>): string {
  // goals 도 해시에 포함 — 목표가 크게 바뀌면 라벨도 재고 가치가 있다.
  const seed = `${futurePersona.trim()}\n${goals.map((g) => g.trim()).join("|")}`;
  return hash32(seed).toString(16);
}

function buildIdentityPrompt(futurePersona: string, goals: ReadonlyArray<string>): string {
  const goalsBlock =
    goals.length > 0
      ? goals.map((g, i) => `${i + 1}. ${g}`).join("\n")
      : "(아직 목표가 적혀 있지 않음)";
  return `당신은 한 사람의 미래상과 목표를 읽고, 그 사람이 매일 자기 행동으로 강화하고 싶어할 만한 **정체성 라벨**을 짧게 골라주는 코치입니다.

## 입력
- 10년 후 되고 싶은 모습:
${futurePersona || "(미작성)"}

- 지금 향하고 있는 목표:
${goalsBlock}

## 출력 규칙
1. 한국어 라벨 ${IDENTITY_MIN}~${IDENTITY_MAX}개. 각 라벨은 "나는 [라벨]입니다" 문장이 자연스러워야 함.
2. 형태: "○○한 사람" / "○○하는 사람" / "○○ 사람" 등 명사구. 각 ${IDENTITY_LABEL_MAX_LEN}자 이내.
3. 진부한 클리셰("긍정적인 사람" 등) 보다, 위 입력에서 실제로 길어 올린 결의 라벨로.
4. 서로 의미가 겹치지 않게.

## 출력 (이 JSON 한 줄만, 다른 말 금지)
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
}): Promise<string[]> {
  const { uid, futurePersona, goals } = opts;
  const hash = personaHash(futurePersona, goals);

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
      buildIdentityPrompt(futurePersona, goals),
      IDENTITY_GENERATION_TOKENS,
    );
    labels = parseLabels(raw);
  } catch (err) {
    console.warn(
      "[identities] 생성 실패, 폴백 사용:",
      err instanceof Error ? err.message : err,
    );
  }

  const finalLabels = labels && labels.length >= IDENTITY_MIN ? labels : FALLBACK_LABELS.slice();

  const next: UserIdentities = {
    labels: finalLabels,
    generatedAt: Timestamp.now() as unknown as UserIdentities["generatedAt"],
    sourcePersonaHash: hash,
  };

  await userRef.set({ identities: next }, { merge: true });
  return finalLabels.slice();
}
