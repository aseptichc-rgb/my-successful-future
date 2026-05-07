/**
 * 클라이언트 i18n 진입점.
 *
 * - `LanguageProvider` 가 사용자 프로필(User.language) 을 추적하고,
 *   비로그인 / 온보딩 시작 직전에는 localStorage 의 fallback 을 본다.
 * - `useT()` 로 키를 받아 번역된 문자열을 반환. 보간 변수는 {name} 형식.
 *
 * 의도적으로 아주 작은 자체 구현. (next-intl / react-i18next 미사용)
 *  - 빌드 의존성 0
 *  - 사전이 클라이언트 번들에 모두 포함됨 (4개 언어 × ~5KB 정도)
 */
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_LOCALE,
  LOCALE_META,
  SUPPORTED_LOCALES,
  isLocale,
  normalizeLocale,
  type Locale,
} from "./types";
import koDict, { type DictKey } from "./dictionaries/ko";
import enDict from "./dictionaries/en";
import esDict from "./dictionaries/es";
import zhDict from "./dictionaries/zh";

export { SUPPORTED_LOCALES, LOCALE_META, DEFAULT_LOCALE, isLocale, normalizeLocale };
export type { Locale };
export type { DictKey };

const DICTIONARIES: Readonly<Record<Locale, Record<DictKey, string>>> = {
  ko: koDict,
  en: enDict,
  es: esDict,
  zh: zhDict,
};

const STORAGE_KEY = "anima.locale";

export type Translator = (key: DictKey, vars?: Record<string, string | number>) => string;

interface LanguageContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: Translator;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

/** {name} 형식 보간. 누락된 변수는 토큰을 그대로 둠. */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (full, name: string) => {
    const v = vars[name];
    return v === undefined || v === null ? full : String(v);
  });
}

function readStoredLocale(): Locale | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isLocale(raw) ? raw : null;
  } catch {
    return null;
  }
}

function writeStoredLocale(locale: Locale): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // SecurityError(시크릿 모드 등) 무시 — 다음 페이지 새로고침 때 다시 시도됨.
  }
}

function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const raw of langs) {
    if (typeof raw !== "string") continue;
    const lower = raw.toLowerCase();
    if (lower.startsWith("ko")) return "ko";
    if (lower.startsWith("en")) return "en";
    if (lower.startsWith("es")) return "es";
    if (lower.startsWith("zh")) return "zh";
  }
  return DEFAULT_LOCALE;
}

interface LanguageProviderProps {
  /** Firestore User.language — 로그인 시 주어지면 우선순위 최고. */
  serverLocale?: Locale | null;
  children: ReactNode;
}

export function LanguageProvider({ serverLocale, children }: LanguageProviderProps) {
  // SSR 일관성을 위해 초기값은 항상 DEFAULT_LOCALE.
  // 클라이언트에서 마운트되면 stored → browser 순으로 한번 보정.
  const [locale, setLocaleState] = useState<Locale>(() => normalizeLocale(serverLocale));

  useEffect(() => {
    if (serverLocale) {
      setLocaleState(serverLocale);
      writeStoredLocale(serverLocale);
      return;
    }
    const stored = readStoredLocale();
    if (stored) {
      setLocaleState(stored);
      return;
    }
    setLocaleState(detectBrowserLocale());
  }, [serverLocale]);

  // <html lang="…"> 도 동기화 — 접근성 / 폰트 hinting 도움.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("lang", locale);
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) return;
    setLocaleState(next);
    writeStoredLocale(next);
  }, []);

  const t = useCallback<Translator>(
    (key, vars) => {
      const dict = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
      const template = dict[key] ?? DICTIONARIES[DEFAULT_LOCALE][key] ?? key;
      return interpolate(template, vars);
    },
    [locale],
  );

  const value = useMemo<LanguageContextValue>(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    // Provider 가 없는 환경(예: 테스트)에서도 안전한 기본 동작 — 한국어 그대로 반환.
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      t: (key, vars) => interpolate(DICTIONARIES[DEFAULT_LOCALE][key] ?? key, vars),
    };
  }
  return ctx;
}

export function useT(): Translator {
  return useLanguage().t;
}
