/**
 * LLM(Gemini) 프롬프트용 언어 헬퍼 — 여러 생성 파이프라인이 공유한다.
 *
 * `lib/dailyMotivation.ts`(동기부여 카드) 와 `lib/futureVision.ts`(미래 일상 비전) 가
 * 같은 분기를 갖지 않도록 한 곳에 모았다(DRY). 알 수 없는 코드는 항상 "ko" 로 폴백.
 */
import type { UserLanguage } from "@/types";

/** 사용자 language → Gemini 프롬프트에 출력 언어를 명시할 때 쓰는 영문 표기. */
export function geminiLanguageName(lang: UserLanguage | undefined): string {
  switch (lang) {
    case "en":
      return "English";
    case "es":
      return "Spanish";
    case "zh":
      return "Simplified Chinese";
    case "ko":
    default:
      return "Korean";
  }
}

/** 임의 입력값을 지원 언어 코드로 정규화. 미지원/누락이면 "ko". */
export function normalizeLanguage(raw: unknown): UserLanguage {
  return raw === "en" || raw === "es" || raw === "zh" || raw === "ko" ? raw : "ko";
}
