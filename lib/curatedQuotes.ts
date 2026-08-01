/**
 * 무명(작자 미상) 잠언 풀 라우터.
 *
 * 위인 어록만 돌면 카드가 "유명인 명언집"처럼 굳는다. CSV 로 큐레이션한 500건(4개 언어)을
 * 같은 후보 목록에 섞어, 하루 카드가 위인 어록 ↔ 무명 잠언 사이에서 고르도록 한다.
 *
 * famousQuoteCatalog 에 합치지 않는 이유:
 *   그 모듈은 설정 페이지(클라이언트 컴포넌트)가 "핀할 인물" 셀렉트를 그리려고 임포트한다.
 *   저자가 없는 이 풀은 인물 목록에 아무 기여도 하지 않으면서 클라이언트 번들만 키운다.
 *   → 서버(dailyMotivation) 전용 모듈로 분리해 둔다.
 *
 * 데이터 파일(curatedQuotesSeed.*.ts)은 `node scripts/gen-curated-quotes.mjs` 로 생성된다.
 */
import type { FamousQuoteSeed } from "@/lib/famousQuotesSeed";
import { CURATED_QUOTES_KO } from "@/lib/curatedQuotesSeed.ko";
import { CURATED_QUOTES_EN } from "@/lib/curatedQuotesSeed.en";
import { CURATED_QUOTES_ES } from "@/lib/curatedQuotesSeed.es";
import { CURATED_QUOTES_ZH } from "@/lib/curatedQuotesSeed.zh";
import type { FamousQuoteCategory, UserLanguage } from "@/types";

/** 이 풀의 모든 항목이 갖는 카테고리 — 저자 없는 잠언. */
export const CURATED_QUOTE_CATEGORY: FamousQuoteCategory = "wisdom";

/** 저자가 없을 때 카드에 표기할 귀속 문구. 언어별로 자연스러운 표현을 쓴다. */
const ANONYMOUS_AUTHOR_LABEL: Record<UserLanguage, string> = {
  ko: "작자 미상",
  en: "Anonymous",
  es: "Anónimo",
  zh: "佚名",
};

/**
 * 언어 코드 → 무명 잠언 풀.
 * 알 수 없는 코드는 KO 폴백 (레거시 사용자 보호 — famousQuoteCatalog 와 동일 정책).
 */
export function getCuratedQuotePool(
  language: UserLanguage | undefined,
): ReadonlyArray<FamousQuoteSeed> {
  switch (language) {
    case "en":
      return CURATED_QUOTES_EN;
    case "es":
      return CURATED_QUOTES_ES;
    case "zh":
      return CURATED_QUOTES_ZH;
    case "ko":
    default:
      return CURATED_QUOTES_KO;
  }
}

/** 저자 없는 명언의 표기명. 알 수 없는 언어는 한국어 라벨로 폴백. */
export function anonymousAuthorLabel(language: UserLanguage | undefined): string {
  return ANONYMOUS_AUTHOR_LABEL[language as UserLanguage] ?? ANONYMOUS_AUTHOR_LABEL.ko;
}
