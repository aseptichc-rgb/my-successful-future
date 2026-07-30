/**
 * "10년 후 나의 모습" 구조화 질문의 공용 정의 + futurePersona 합성기.
 *
 * 클라이언트(온보딩/설정)와 서버(초상 생성) 양쪽에서 import 하므로
 * firebase-admin 등 서버 전용 의존성을 절대 넣지 않는다.
 *
 * 설계 요점: 구조화 답변(futureSelfAnswers)을 저장할 때 이 모듈의
 * composeFuturePersona() 결과를 기존 futurePersona 필드에도 함께 기록한다.
 * → 카드/비전/정체성/작가추천 4개 AI 소비처는 읽기 경로 수정 없이 그대로 동작.
 */
import type { FutureSelfAnswers } from "@/types";

/** 차원별 답변 1개의 최대 길이 (UI maxLength 와 저장 클램프에 공용). */
export const FUTURE_SELF_FIELD_MAX = 200;

/**
 * 몰입형 질문 표시 순서 — i18n 키(`onboarding.futureSelf.<key>.*`)와 1:1 대응.
 * 첫 항목(dream)이 온보딩에서 묻는 유일한 차원이고, 나머지는 설정의 선택 항목이다.
 */
export const FUTURE_SELF_DIMENSIONS = [
  "dream",
  "daily",
  "work",
  "wealth",
  "family",
  "achievements",
  "respect",
  "growth",
] as const;

export type FutureSelfDimension = (typeof FUTURE_SELF_DIMENSIONS)[number];

/**
 * compose 시 각 답변 앞에 붙는 짧은 태그.
 * 합성 문자열은 Gemini 프롬프트에만 들어가고 UI 에 원문 그대로 노출되지 않으므로
 * (프롬프트는 영어·출력 언어는 별도 강제) 한국어 태그로 충분하다.
 */
const DIMENSION_TAGS: Record<FutureSelfDimension, string> = {
  // 온보딩이 묻는 단 하나의 질문. "일상" 태그에 우겨넣으면 Gemini 가 꿈 문장을
  // 하루 묘사로 읽으므로 별도 차원·별도 태그로 둔다.
  dream: "꿈",
  daily: "일상",
  work: "일·위치",
  wealth: "자산",
  family: "가족",
  achievements: "성취",
  respect: "존경",
  growth: "성장",
};

/**
 * 구조화 답변 정규화 — trim, 빈 값 제거, 길이 클램프.
 * 클라 저장 직전과 서버 컨텍스트 fetch 양쪽에서 같은 결과를 내야
 * sourceHash 기반 초상 재생성 판단이 흔들리지 않는다.
 */
export function normalizeFutureSelfAnswers(raw: FutureSelfAnswers): FutureSelfAnswers {
  const out: FutureSelfAnswers = {};
  for (const key of FUTURE_SELF_DIMENSIONS) {
    const value = raw[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim().slice(0, FUTURE_SELF_FIELD_MAX);
    if (trimmed.length === 0) continue;
    out[key] = trimmed;
  }
  return out;
}

/** 정규화 기준으로 답변이 하나라도 있는지. */
export function hasAnyFutureSelfAnswer(raw: FutureSelfAnswers): boolean {
  return Object.keys(normalizeFutureSelfAnswers(raw)).length > 0;
}

/**
 * 구조화 답변 → 레거시 futurePersona 문자열 합성.
 * 비어있지 않은 차원만 "· <태그>: <답변>" 한 줄씩으로 잇는다.
 * (프롬프트 주입 시 잘리는 상한은 lib/constants/futurePersona.ts 참조.)
 */
export function composeFuturePersona(answers: FutureSelfAnswers): string {
  const cleaned = normalizeFutureSelfAnswers(answers);
  const lines: string[] = [];
  for (const key of FUTURE_SELF_DIMENSIONS) {
    const value = cleaned[key];
    if (!value) continue;
    lines.push(`· ${DIMENSION_TAGS[key]}: ${value}`);
  }
  return lines.join("\n");
}
