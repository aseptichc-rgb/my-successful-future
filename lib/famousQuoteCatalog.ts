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
import type { FamousQuoteCategory, UserLanguage } from "@/types";

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

/**
 * 모든 언어의 핀 가능 인물 명단을 그룹핑해서 반환.
 * - 같은 인물이라도 언어별 표기가 달라(예: "마르쿠스 아우렐리우스" / "Marcus Aurelius") 그룹별로 노출.
 * - 사용자가 다른 언어 표기로 핀해도 dailyMotivation 의 free-author 경로(Gemini)가 받아준다.
 * - currentLanguage 가 첫 그룹으로 와서 가장 익숙한 풀이 위에 보인다.
 */
export const ALL_LANGUAGES: ReadonlyArray<UserLanguage> = ["ko", "en", "es", "zh"];

export interface AuthorGroup {
  language: UserLanguage;
  authors: string[];
}

/**
 * 인물 → 가장 자주 등장하는 카테고리. 온보딩 step4 카드 태그용.
 * 같은 인물이 여러 카테고리에 등장하면 최빈값을 고르고 동률은 첫 등장 우선.
 * personal 카테고리는 제외 — getKnownAuthorsForLanguage 와 동일한 필터.
 */
export function getAuthorCategoryMap(
  language: UserLanguage | undefined,
): Map<string, FamousQuoteCategory> {
  const pool = getQuoteSeedPool(language);
  const counts = new Map<string, Map<FamousQuoteCategory, number>>();
  const order = new Map<string, FamousQuoteCategory>();
  for (const q of pool) {
    if (q.category === "personal") continue;
    const a = typeof q.author === "string" ? q.author.trim() : "";
    if (!a) continue;
    if (!order.has(a)) order.set(a, q.category);
    const inner = counts.get(a) ?? new Map<FamousQuoteCategory, number>();
    inner.set(q.category, (inner.get(q.category) ?? 0) + 1);
    counts.set(a, inner);
  }
  const result = new Map<string, FamousQuoteCategory>();
  for (const [author, inner] of counts.entries()) {
    let best: FamousQuoteCategory = order.get(author) ?? "philosophy";
    let bestCount = inner.get(best) ?? 0;
    for (const [cat, n] of inner.entries()) {
      if (n > bestCount) {
        best = cat;
        bestCount = n;
      }
    }
    result.set(author, best);
  }
  return result;
}

export function getAllKnownAuthorsGrouped(currentLanguage: UserLanguage | undefined): AuthorGroup[] {
  const current: UserLanguage = currentLanguage && ALL_LANGUAGES.includes(currentLanguage) ? currentLanguage : "ko";
  const ordered: UserLanguage[] = [current, ...ALL_LANGUAGES.filter((l) => l !== current)];
  return ordered.map((language) => ({
    language,
    authors: getKnownAuthorsForLanguage(language),
  }));
}
