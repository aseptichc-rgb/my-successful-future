/**
 * 목표 1줄 → 다짐 1줄 파생.
 *
 * 왜 파생인가: 전사 체크인(다짐을 그대로 따라 적기)은 유지하되, 그 문장을 사용자가
 * 따로 적게 하면 온보딩 입력이 두 배가 된다. 목표를 "종결형 행동 문장"으로 받으면
 * 1인칭 접두사 하나만 붙여도 자연스러운 다짐이 나온다 —
 *   "매일 30분 책을 읽는다" → "나는 매일 30분 책을 읽는다"
 * 결과적으로 **목표와 다짐이 같은 것을 가리켜** 하루의 인지 부하가 1개로 유지된다.
 *
 * 조사/굴절 처리를 하지 않는 것이 핵심 설계다. 접두사는 문장 앞에만 붙으므로
 * 로케일별 규칙이 상수 1개로 끝나고, 어떤 입력에도 문법이 깨지지 않는다.
 *
 * 순수 모듈 — Firebase/DOM 의존 없음. 클라(온보딩·설정)에서만 쓰지만
 * 서버가 나중에 같은 판정을 해야 해도 그대로 import 할 수 있다.
 */
import { GOAL_TEXT_MAX, SUCCESS_AFFIRMATION_MAX_LEN } from "@/lib/constants/goal";
import type { Locale } from "@/lib/i18n/types";

/** 로케일별 1인칭 접두사. 최대 길이가 GOAL_TEXT_MAX 산출식의 근거(4자)다. */
const AFFIRMATION_PREFIX: Readonly<Record<Locale, string>> = {
  ko: "나는 ",
  en: "I ",
  es: "Yo ",
  zh: "我",
};

/**
 * 사용자가 이미 1인칭으로 적은 경우 — 접두사를 두 번 붙이지 않는다
 * ("나는 나는 …" 방지). 소문자 비교는 라틴 문자 로케일에만 의미가 있지만
 * 전 로케일에 적용해도 한국어/중국어 결과가 달라지지 않는다.
 */
const FIRST_PERSON_HEADS: Readonly<Record<Locale, ReadonlyArray<string>>> = {
  ko: ["나는", "내가", "난 ", "저는"],
  en: ["i ", "i'm", "i am", "im "],
  es: ["yo ", "soy ", "estoy "],
  zh: ["我"],
};

function prefixFor(locale: Locale): string {
  return AFFIRMATION_PREFIX[locale] ?? AFFIRMATION_PREFIX.ko;
}

function startsWithFirstPerson(text: string, locale: Locale): boolean {
  const heads = FIRST_PERSON_HEADS[locale] ?? FIRST_PERSON_HEADS.ko;
  const lower = text.toLowerCase();
  return heads.some((head) => lower.startsWith(head));
}

/**
 * 목표 텍스트 정규화 — trim + 연속 공백 축약 + 길이 클램프.
 * 저장 직전과 파생 시점이 같은 결과를 내야 "이미 동기화됨" 판정이 흔들리지 않는다.
 */
export function normalizeGoalText(raw: string): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\s+/g, " ").slice(0, GOAL_TEXT_MAX);
}

/**
 * 목표 → 다짐 1줄. 빈 목표면 빈 문자열(호출부가 저장을 생략한다).
 * 결과는 항상 SUCCESS_AFFIRMATION_MAX_LEN 이내라 normalizeAffirmations 가 다시 자르지 않는다.
 */
export function deriveAffirmation(goal: string, locale: Locale): string {
  const cleaned = normalizeGoalText(goal);
  if (cleaned.length === 0) return "";
  const body = startsWithFirstPerson(cleaned, locale) ? cleaned : prefixFor(locale) + cleaned;
  return body.slice(0, SUCCESS_AFFIRMATION_MAX_LEN);
}

/**
 * 목표를 수정했을 때 다짐도 따라 바꿀지 물어봐야 하는가.
 *
 * 숨은 상태(“자동 파생본인지” 플래그)를 두지 않고 값만으로 판정한다:
 *  - 새 목표에서 파생한 문장이 이미 첫 다짐과 같으면 → 물을 것이 없다.
 *  - 첫 다짐이 **이전 목표의 파생본과 같으면** → 사용자가 손대지 않은 자동 문장이므로 제안한다.
 *  - 그 외(사용자가 직접 고쳐 쓴 문장) → 건드리지 않는다.
 */
export function shouldOfferAffirmationSync(opts: {
  prevGoal: string;
  nextGoal: string;
  affirmations: ReadonlyArray<string>;
  locale: Locale;
}): boolean {
  const { prevGoal, nextGoal, affirmations, locale } = opts;
  const nextLine = deriveAffirmation(nextGoal, locale);
  if (nextLine.length === 0) return false;
  const current = (affirmations[0] ?? "").trim();
  if (current.length === 0) return false;
  if (current === nextLine) return false;
  return current === deriveAffirmation(prevGoal, locale);
}
