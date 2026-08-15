/**
 * 번역 사전 접근 + 보간 — React 무의존 순수 모듈.
 *
 * lib/i18n/index.tsx 는 `"use client"` + React Context 라 서버 라우트에서 쓸 수 없다.
 * 그런데 알림 문구는 **서버가 조립해서 내려줘야 한다**(app/api/widget/today) —
 * Android 는 strings.xml 한국어 하드코딩이라 문구를 스스로 로컬라이즈하지 못하고,
 * iOS 는 웹이 넘긴 문구를 그대로 실어 나르기 때문이다.
 *
 * 그래서 사전 맵과 보간기를 여기로 **이동**했다(복사 아님 — 사전이 두 벌이 되면
 * 한쪽만 갱신되는 사고가 난다). index.tsx 는 이 모듈을 import 해서 훅으로 감싸기만 한다.
 */
import { DEFAULT_LOCALE, type Locale } from "./types";
import koDict, { type DictKey } from "./dictionaries/ko";
import enDict from "./dictionaries/en";
import esDict from "./dictionaries/es";
import zhDict from "./dictionaries/zh";

export type { DictKey };

// 비공개 — 소비처는 translate()/getServerT() 만 쓴다. 사전을 직접 읽게 열어 두면
// 기본 로케일 폴백 체인을 우회해 누락된 키가 화면에 원문 그대로 노출된다.
const DICTIONARIES: Readonly<Record<Locale, Record<DictKey, string>>> = {
  ko: koDict,
  en: enDict,
  es: esDict,
  zh: zhDict,
};

export type Translator = (key: DictKey, vars?: Record<string, string | number>) => string;

/** {name} 형식 보간. 누락된 변수는 토큰을 그대로 둠. */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (full, name: string) => {
    const v = vars[name];
    return v === undefined || v === null ? full : String(v);
  });
}

/** 키 하나를 특정 로케일로 번역. 사전에 없으면 기본 로케일 → 키 자체 순으로 폴백. */
export function translate(
  locale: Locale,
  key: DictKey,
  vars?: Record<string, string | number>,
): string {
  const dict = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
  const template = dict[key] ?? DICTIONARIES[DEFAULT_LOCALE][key] ?? key;
  return interpolate(template, vars);
}

/**
 * 서버(API 라우트·워커)용 번역기. 훅과 달리 로케일을 인자로 받는다 —
 * 호출부는 users/{uid}.language 를 normalizeLocale() 로 정규화해 넘긴다.
 */
export function getServerT(locale: Locale): Translator {
  return (key, vars) => translate(locale, key, vars);
}
