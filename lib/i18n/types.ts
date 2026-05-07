/**
 * 앱 다국어(i18n) 타입.
 *
 * - "ko"(기본) / "en" / "es" / "zh" 4개 언어 지원.
 * - 사용자 프로필에 `language` 필드로 저장되며, 미설정 시 "ko" 로 폴백.
 * - 번역 사전(Dictionary) 키는 모든 언어에서 동일해야 한다 — 누락된 키가 생기면
 *   `useT()` 가 키 자체를 그대로 노출하므로 빌드/런타임 양쪽에서 즉시 눈에 띈다.
 */

export const SUPPORTED_LOCALES = ["ko", "en", "es", "zh"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ko";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as ReadonlyArray<string>).includes(value);
}

export function normalizeLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export interface LocaleMeta {
  code: Locale;
  /** 자기 언어로 표기한 라벨 — 언어 선택 화면에서 사용. */
  nativeLabel: string;
  /** 영어 라벨 — 디버그/관리자 노출용. */
  englishLabel: string;
  /** 깃발 이모지(시각 단서). */
  flag: string;
  /** Gemini 프롬프트에서 출력 언어를 명시할 때 쓰는 영문 표기. */
  geminiName: string;
  /** 명언 시드의 originalLang 자동 매칭에 활용할 ISO 힌트. */
  isoHint: string;
}

export const LOCALE_META: Readonly<Record<Locale, LocaleMeta>> = {
  ko: {
    code: "ko",
    nativeLabel: "한국어",
    englishLabel: "Korean",
    flag: "🇰🇷",
    geminiName: "Korean",
    isoHint: "ko",
  },
  en: {
    code: "en",
    nativeLabel: "English",
    englishLabel: "English",
    flag: "🇺🇸",
    geminiName: "English",
    isoHint: "en",
  },
  es: {
    code: "es",
    nativeLabel: "Español",
    englishLabel: "Spanish",
    flag: "🇪🇸",
    geminiName: "Spanish",
    isoHint: "es",
  },
  zh: {
    code: "zh",
    nativeLabel: "中文",
    englishLabel: "Chinese (Simplified)",
    flag: "🇨🇳",
    geminiName: "Simplified Chinese",
    isoHint: "zh",
  },
} as const;
