/**
 * 사용자 언어별 명언 풀 라우터.
 *
 * - "ko" → 기존 FAMOUS_QUOTES_SEED (한국어 풀, ~120건)
 * - "en" / "es" / "zh" → 각 언어 전용 시드 + 글로벌 인물
 *
 * dailyMotivation 의 후보 풀, 위젯 큐레이션, 설정 페이지의 "핀할 인물" 셀렉트가
 * 모두 이 함수 한 곳을 통해 사용자의 language 에 맞는 풀로 분기된다.
 */
import type { FamousQuoteSeed } from "@/lib/famousQuotesSeed";
import { FAMOUS_QUOTES_SEED } from "@/lib/famousQuotesSeed";
import { FAMOUS_QUOTES_SEED_EN } from "@/lib/famousQuotesSeed.en";
import { FAMOUS_QUOTES_SEED_ES } from "@/lib/famousQuotesSeed.es";
import { FAMOUS_QUOTES_SEED_ZH } from "@/lib/famousQuotesSeed.zh";
import type { UserLanguage } from "@/types";

const KO_POOL = FAMOUS_QUOTES_SEED;

/**
 * 언어 코드 → 시드 풀.
 * 알 수 없는 코드는 KO 폴백 (레거시 사용자 보호).
 */
export function getQuoteSeedPool(language: UserLanguage | undefined): ReadonlyArray<FamousQuoteSeed> {
  switch (language) {
    case "en":
      return FAMOUS_QUOTES_SEED_EN;
    case "es":
      return FAMOUS_QUOTES_SEED_ES;
    case "zh":
      return FAMOUS_QUOTES_SEED_ZH;
    case "ko":
    default:
      return KO_POOL;
  }
}

/**
 * 언어 풀에서 "핀 가능 인물" 명단 — personal 카테고리 제외, 정렬된 unique 이름.
 * 클라이언트 설정 페이지 셀렉트 박스가 사용한다.
 */
export function getKnownAuthorsForLanguage(language: UserLanguage | undefined): string[] {
  const pool = getQuoteSeedPool(language);
  const unique = new Set<string>();
  for (const q of pool) {
    if (q.category === "personal") continue;
    const a = typeof q.author === "string" ? q.author.trim() : "";
    if (a.length > 0) unique.add(a);
  }
  // ko 는 한국어 정렬, 그 외엔 base 정렬 — 자모/억음 안전.
  const collator = new Intl.Collator(language === "ko" ? "ko" : language === "zh" ? "zh" : language === "es" ? "es" : "en");
  return Array.from(unique).sort((a, b) => collator.compare(a, b));
}
