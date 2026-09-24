import { describe, expect, it } from "vitest";
import { COPY, FIELD_LIMITS, charLen, collectCopyProblems, supportUrlFor } from "./ios-update-metadata.mjs";
import en from "@/lib/i18n/dictionaries/en";
import es from "@/lib/i18n/dictionaries/es";
import ko from "@/lib/i18n/dictionaries/ko";
import zh from "@/lib/i18n/dictionaries/zh";

/**
 * 2026-09-24 앱스토어 설정 검토의 회귀 테스트.
 *
 * 스토어 문안은 ASC API 가 글자 수 외에는 아무것도 검사해 주지 않는다. 키워드에 공백을 넣거나
 * 이름에 있는 단어를 또 넣어도 200 으로 받아주고, 조용히 검색 노출만 손해 본다. 릴리스 노트가
 * 앱 탭 이름을 잘못 적어도 마찬가지다. 그래서 규칙은 여기서 못 박는다.
 */

const EXPECTED_LOCALES = ["en-US", "ko", "es-ES", "es-MX", "zh-Hans", "zh-Hant"];

/** 릴리스 노트가 탭 이름을 언급하므로 앱 사전(nav.*)과 같은 표기여야 한다. */
const NAV_KEYS = ["nav.today", "nav.dream", "nav.record", "nav.progress"];
const DICT_BY_LOCALE = { "en-US": en, ko, "es-ES": es, "es-MX": es, "zh-Hans": zh };
/** zh-Hant 는 앱 UI 가 간체뿐이라 사전이 없다 — 간체 탭 이름의 번체 표기를 직접 고정한다. */
const ZH_HANT_NAV = ["今天", "我的夢想", "記錄", "成長"];

/** 2026-09-24 에 설명으로 복구한 세 가지 — 위젯 · 언어 지원 · 무료 시작. 다시 빠지면 실패. */
const REQUIRED_DESCRIPTION_TOKENS = {
  "en-US": ["widget", "한국어", "Free to start"],
  ko: ["위젯", "English", "무료로 시작"],
  "es-ES": ["Widget", "한국어", "Empieza gratis"],
  "es-MX": ["Widget", "한국어", "Empieza gratis"],
  "zh-Hans": ["小组件", "한국어", "免费开始"],
  "zh-Hant": ["小工具", "한국어", "免費開始"],
};

describe("COPY", () => {
  it("6개 로케일이 모두 있다 (es-MX·zh-Hant 포함)", () => {
    expect(Object.keys(COPY).sort()).toEqual([...EXPECTED_LOCALES].sort());
  });

  it("모든 로케일이 Apple 상한과 키워드 규칙을 지킨다", () => {
    expect(collectCopyProblems()).toEqual([]);
  });

  it("이름·부제는 30자, 키워드는 100자 이내다 (상한 자체가 바뀌지 않았는지도 고정)", () => {
    expect(FIELD_LIMITS.name).toBe(30);
    expect(FIELD_LIMITS.subtitle).toBe(30);
    expect(FIELD_LIMITS.keywords).toBe(100);
    for (const fields of Object.values(COPY)) {
      expect(charLen(fields.name)).toBeLessThanOrEqual(FIELD_LIMITS.name);
      expect(charLen(fields.subtitle)).toBeLessThanOrEqual(FIELD_LIMITS.subtitle);
      expect(charLen(fields.keywords)).toBeLessThanOrEqual(FIELD_LIMITS.keywords);
    }
  });

  it("릴리스 노트의 탭 이름이 앱 사전(nav.*)과 일치한다", () => {
    for (const [locale, dict] of Object.entries(DICT_BY_LOCALE)) {
      for (const key of NAV_KEYS) {
        expect(COPY[locale].whatsNew, `${locale}.whatsNew 에 ${key}="${dict[key]}" 없음`).toContain(dict[key]);
      }
    }
  });

  it("zh-Hant 릴리스 노트는 탭 이름을 번체로 적는다", () => {
    for (const label of ZH_HANT_NAV) expect(COPY["zh-Hant"].whatsNew).toContain(label);
  });

  it("es-MX 는 es-ES 문안을 공유하되 키워드만 다르다 (미국·멕시코 색인 확장)", () => {
    expect(COPY["es-MX"].description).toBe(COPY["es-ES"].description);
    expect(COPY["es-MX"].name).toBe(COPY["es-ES"].name);
    expect(COPY["es-MX"].keywords).not.toBe(COPY["es-ES"].keywords);
  });

  it("설명에 위젯·언어 지원·무료 시작이 모든 로케일에 들어 있다", () => {
    for (const [locale, tokens] of Object.entries(REQUIRED_DESCRIPTION_TOKENS)) {
      for (const token of tokens) {
        expect(COPY[locale].description, `${locale}.description 에 "${token}" 없음`).toContain(token);
      }
    }
  });
});

describe("collectCopyProblems", () => {
  it("상한 초과·공백 키워드·이름 중복 키워드를 잡아낸다", () => {
    const problems = collectCopyProblems({
      "en-US": {
        ...COPY["en-US"],
        subtitle: "x".repeat(FIELD_LIMITS.subtitle + 1),
        keywords: "daily quote,affirmations,calm",
      },
    });
    expect(problems.some((p) => p.includes("subtitle") && p.includes("초과"))).toBe(true);
    expect(problems.some((p) => p.includes("공백"))).toBe(true);
    // 이름 "Anima: Daily Affirmations" 에 이미 있는 단어.
    expect(problems.some((p) => p.includes('"affirmations"'))).toBe(true);
  });

  it("빈 문구와 지원 URL 매핑이 없는 로케일을 잡아낸다", () => {
    const problems = collectCopyProblems({ "pt-BR": { ...COPY["en-US"], description: "   " } });
    expect(problems.some((p) => p.includes("pt-BR.description"))).toBe(true);
    expect(problems.some((p) => p.includes("APP_LANG_BY_LOCALE"))).toBe(true);
  });
});

describe("supportUrlFor", () => {
  it("로케일별 앱 언어(?lang=)로 연결된다", () => {
    expect(supportUrlFor("es-MX")).toBe("https://my-successful-future.vercel.app/support?lang=es");
    expect(supportUrlFor("zh-Hant")).toMatch(/\?lang=zh$/);
    expect(supportUrlFor("en-US")).toMatch(/\?lang=en$/);
    for (const locale of Object.keys(COPY)) expect(() => supportUrlFor(locale)).not.toThrow();
  });

  it("매핑 없는 로케일은 던진다 — 조용히 잘못된 URL 을 올리지 않도록", () => {
    expect(() => supportUrlFor("fr-FR")).toThrow(/fr-FR/);
  });
});

describe("charLen", () => {
  it("이모지(서로게이트 쌍)를 1자로 센다 — Apple 도 코드포인트로 센다", () => {
    expect(charLen("a😀")).toBe(2);
  });
});
