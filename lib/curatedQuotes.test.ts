import { describe, expect, it } from "vitest";
import type { FamousQuoteSeed } from "@/lib/famousQuotesSeed";
import { anonymousAuthorLabel, getCuratedQuotePool } from "@/lib/curatedQuotes";
import {
  MAX_PROMPT_CANDIDATES,
  balancedPromptCandidates,
  resolveTodaysPool,
} from "@/lib/dailyMotivation";
import { getKnownAuthorsForLanguage } from "@/lib/famousQuoteCatalog";
import type { UserLanguage } from "@/types";

const LANGUAGES: UserLanguage[] = ["ko", "en", "es", "zh"];
const YMD = "2026-08-01";
const UID = "test-uid";

describe("getCuratedQuotePool", () => {
  it("언어마다 잠언 풀이 채워져 있다", () => {
    for (const lang of LANGUAGES) {
      expect(getCuratedQuotePool(lang).length).toBeGreaterThan(400);
    }
  });

  it("알 수 없는 언어는 한국어 풀로 폴백한다 (레거시 사용자 보호)", () => {
    expect(getCuratedQuotePool(undefined)).toBe(getCuratedQuotePool("ko"));
  });

  it("모든 항목이 저자 없는 wisdom 카테고리이고 id 가 유일하다", () => {
    for (const lang of LANGUAGES) {
      const pool = getCuratedQuotePool(lang);
      const ids = new Set(pool.map((q) => q.id));
      expect(ids.size).toBe(pool.length);
      for (const q of pool) {
        expect(q.author).toBeUndefined();
        expect(q.category).toBe("wisdom");
        expect(q.text.trim().length).toBeGreaterThan(3);
      }
    }
  });

  it("잠언은 핀 가능한 인물 목록을 오염시키지 않는다", () => {
    for (const lang of LANGUAGES) {
      const authors = getKnownAuthorsForLanguage(lang);
      expect(authors.every((a) => a.trim().length > 0)).toBe(true);
      expect(authors).not.toContain(anonymousAuthorLabel(lang));
    }
  });
});

describe("anonymousAuthorLabel", () => {
  it("언어별 표기를 돌려주고, 모르는 값은 한국어로 폴백한다", () => {
    expect(anonymousAuthorLabel("ko")).toBe("작자 미상");
    expect(anonymousAuthorLabel("en")).toBe("Anonymous");
    expect(anonymousAuthorLabel("es")).toBe("Anónimo");
    expect(anonymousAuthorLabel("zh")).toBe("佚名");
    expect(anonymousAuthorLabel(undefined)).toBe("작자 미상");
  });
});

describe("resolveTodaysPool — 위인 어록 + 무명 잠언 혼합", () => {
  it("기본(주간 회전) 경로에는 두 갈래가 함께 들어간다", () => {
    for (const lang of LANGUAGES) {
      const { pool, reason } = resolveTodaysPool(UID, YMD, {}, lang);
      expect(reason).toBe("weekly");
      expect(pool.some((q) => q.author)).toBe(true);
      expect(pool.some((q) => !q.author)).toBe(true);
    }
  });

  it("같은 (uid, 날짜) 면 같은 잠언 표본이 나온다 (같은 날 재조회 안정성)", () => {
    const a = resolveTodaysPool(UID, YMD, {}, "ko").pool.map((q) => q.id);
    const b = resolveTodaysPool(UID, YMD, {}, "ko").pool.map((q) => q.id);
    expect(a).toEqual(b);
  });

  it("날짜가 바뀌면 잠언 표본도 바뀐다", () => {
    const today = resolveTodaysPool(UID, YMD, {}, "ko").pool.filter((q) => !q.author);
    const other = resolveTodaysPool(UID, "2026-08-02", {}, "ko").pool.filter((q) => !q.author);
    expect(today.map((q) => q.id)).not.toEqual(other.map((q) => q.id));
  });

  it("인물을 핀한 날에는 그 인물 어록만 남는다 (잠언 미혼합)", () => {
    const author = getKnownAuthorsForLanguage("ko")[0];
    const { pool, reason } = resolveTodaysPool(
      UID,
      YMD,
      { pinnedAuthor: author, pinnedDaysPerWeek: 7 },
      "ko",
    );
    expect(reason).toBe("pinned");
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every((q) => q.author === author)).toBe(true);
  });

  it("특정 인물 즉시 받아보기(override) 경로도 잠언을 섞지 않는다", () => {
    const author = getKnownAuthorsForLanguage("ko")[0];
    const { pool, reason } = resolveTodaysPool(UID, YMD, {}, "ko", author);
    expect(reason).toBe("override");
    expect(pool.every((q) => q.author === author)).toBe(true);
  });
});

function seedOf(id: string, author?: string): FamousQuoteSeed {
  return { id, text: `text-${id}`, category: "wisdom", language: "ko", ...(author ? { author } : {}) };
}

describe("balancedPromptCandidates", () => {
  const famous = Array.from({ length: 300 }, (_, i) => seedOf(`f${i}`, `author-${i % 10}`));
  const curated = Array.from({ length: 500 }, (_, i) => seedOf(`c${i}`));

  it("상한 이하면 그대로 통과시킨다", () => {
    const small = famous.slice(0, 5);
    expect(balancedPromptCandidates(small, 1)).toBe(small);
  });

  it("건수가 많은 잠언이 후보를 독식하지 않는다", () => {
    const out = balancedPromptCandidates([...famous.slice(0, 5), ...curated], 42);
    expect(out.length).toBe(MAX_PROMPT_CANDIDATES);
    expect(out.filter((q) => q.author).length).toBe(5);
  });

  it("반대로 위인 어록이 많아도 잠언 몫이 남는다", () => {
    const out = balancedPromptCandidates([...famous, ...curated.slice(0, 5)], 42);
    expect(out.length).toBe(MAX_PROMPT_CANDIDATES);
    expect(out.filter((q) => !q.author).length).toBe(5);
  });

  it("양쪽이 넉넉하면 잠언에 최소 몫(40%)을 보장한다", () => {
    const out = balancedPromptCandidates([...famous, ...curated], 7);
    expect(out.length).toBe(MAX_PROMPT_CANDIDATES);
    expect(out.filter((q) => !q.author).length).toBe(16);
    expect(out.filter((q) => q.author).length).toBe(24);
  });

  it("한쪽만 있는 풀도 상한까지만 자른다", () => {
    const out = balancedPromptCandidates(curated, 3);
    expect(out.length).toBe(MAX_PROMPT_CANDIDATES);
  });

  it("같은 시드면 결과가 같다 (결정론)", () => {
    const a = balancedPromptCandidates([...famous, ...curated], 99).map((q) => q.id);
    const b = balancedPromptCandidates([...famous, ...curated], 99).map((q) => q.id);
    expect(a).toEqual(b);
  });
});
