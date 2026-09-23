"use client";

/**
 * 유입 출처(utm_*) 보존 — 랜딩에 도착한 URL 의 utm 을 기기에 남겨 두고, 가입 퍼널 이벤트에 실어 보낸다.
 *
 * 왜: 광고 → 랜딩 → 웹 가입 경로는 스토어의 획득 보고서(Play utm / App Store ct)에 잡히지 않는다.
 * 어트리뷰션 SDK 없이 "어느 캠페인이 온보딩 완료까지 이어졌는가" 를 보려면 utm 을 첫 방문에
 * 저장했다가 onboarding_completed 의 props 로 넘기는 것이 가장 싸다(lib/track → /api/events).
 *
 * 규칙:
 *  - 첫 방문(first-touch)만 남긴다. 이미 저장돼 있으면 덮어쓰지 않는다 — 광고 성과는 처음
 *    데려온 캠페인에 귀속시키는 것이 관례다.
 *  - 값은 짧게 자른다(개인정보·자유 텍스트가 실려 오지 않도록). 키는 표준 3개만.
 *  - localStorage 를 못 쓰는 환경에서는 조용히 아무것도 하지 않는다.
 */
const STORAGE_KEY = "anima.utm.first";
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign"] as const;
const VALUE_MAX = 60;

export type UtmParams = Partial<Record<(typeof UTM_KEYS)[number], string>>;

/** 현재 URL 의 utm_* 을 첫 방문 기준으로 저장한다. 저장했으면 true. */
export function captureUtmFromLocation(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(STORAGE_KEY)) return false;
    const params = new URLSearchParams(window.location.search);
    const utm: UtmParams = {};
    for (const key of UTM_KEYS) {
      const value = params.get(key)?.trim();
      if (value) utm[key] = value.slice(0, VALUE_MAX);
    }
    if (Object.keys(utm).length === 0) return false;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(utm));
    return true;
  } catch {
    return false;
  }
}

/** 저장된 첫 방문 utm. 없으면 빈 객체 — 이벤트 props 에 그대로 펼쳐 넣을 수 있다. */
export function readUtm(): UtmParams {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: UtmParams = {};
    for (const key of UTM_KEYS) {
      const value = (parsed as Record<string, unknown>)[key];
      if (typeof value === "string" && value) out[key] = value.slice(0, VALUE_MAX);
    }
    return out;
  } catch {
    return {};
  }
}
