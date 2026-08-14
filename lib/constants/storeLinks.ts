/**
 * 스토어 설치 링크 — 단일 출처.
 *
 * 마케팅 랜딩([app/page.tsx])과 광고용 리다이렉트([app/go/app/route.ts])가 같은 주소를 써야
 * 하므로 여기 모아둔다. 스토어 URL 이 바뀌면 이 파일만 고친다.
 *
 * ── 캠페인 파라미터 정책 ────────────────────────────────────────────
 *   Google Play  utm_* 를 그대로 붙인다. Play 콘솔 "사용자 획득 → 획득 보고서" 가 이 값을
 *                읽으므로 어트리뷰션 SDK 없이 유입 출처를 볼 수 있다.
 *   App Store    Apple 은 utm_* 을 무시한다. 대신 캠페인 토큰 ct 를 쓰면 App Store Connect
 *                "앱 분석 → 캠페인" 에 집계되므로 utm_campaign 을 ct 로 옮겨 붙인다.
 *
 * 이 방식은 광고 식별자를 수집하지 않고 스토어가 자체 집계한 값만 읽는다. 추적 SDK 를 붙이지
 * 않는다는 개인정보 정책([app/privacy/page.tsx] 7항 "Advertising and tracking")을 그대로
 * 지키면서 유입 출처만 확인하기 위한 최소 수단이다 — 이 원칙을 깨는 변경은 정책 문구를 먼저
 * 고쳐야 한다.
 */

/** iOS 앱은 같은 웹 URL 을 로드하는 Capacitor 래퍼다. 제품은 하나, 스토어만 둘. */
export const PLAY_STORE_URL =
  process.env.NEXT_PUBLIC_PLAY_STORE_URL ||
  "https://play.google.com/store/apps/details?id=com.michaelkim.anima";

/**
 * 로케일(/kr/)을 뺀 형태. Apple 이 접속자의 스토어프론트로 자동 연결해 주므로 해외 캠페인까지
 * 그대로 쓸 수 있다. 로케일을 박으면 다른 국가 사용자가 빈 페이지를 본다.
 */
export const APP_STORE_URL =
  process.env.NEXT_PUBLIC_APP_STORE_URL ||
  "https://apps.apple.com/app/id6774140443";

/** Apple 캠페인 토큰(ct) 상한 — 40자. 초과분은 잘라 보낸다. */
const APPLE_CAMPAIGN_TOKEN_MAX = 40;

/** Apple 캠페인 링크의 미디어 타입 (8 = Mobile Software Applications). */
const APPLE_MEDIA_TYPE = "8";

/** Play 콘솔이 읽는 파라미터. 이 목록만 스토어로 넘긴다(임의 쿼리 전달 방지). */
const FORWARDED_UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

export type StorePlatform = "ios" | "android" | "unknown";

/** 판정에 성공한 플랫폼 — buildStoreUrl 은 unknown 을 받지 않는다. */
export type ResolvedStorePlatform = Exclude<StorePlatform, "unknown">;

/**
 * User-Agent 로 설치 대상 스토어를 판정한다.
 *
 * Facebook/Instagram 인앱 브라우저는 iOS 에서 FBIOS 토큰을 실어 보내는데, iPadOS 13+ 의
 * 데스크톱 모드는 UA 에 "Macintosh" 만 남겨 iPad 임을 숨긴다. 그래서 기기 토큰과 인앱 브라우저
 * 토큰을 함께 본다.
 *
 * 판정에 실패하면 unknown 으로 두고 호출부가 랜딩으로 보낸다. 설치할 수 없는 스토어로 보내는
 * 것보다 랜딩에서 직접 고르게 하는 편이 낫다.
 */
export function resolveStorePlatform(userAgent: string | null): StorePlatform {
  if (!userAgent) return "unknown";
  const ua = userAgent.toLowerCase();

  // Android 를 먼저 본다. Android 판 Facebook 인앱 브라우저 UA 에도 "safari" 계열 토큰이
  // 섞여 들어오므로 순서를 뒤집으면 오판할 여지가 생긴다.
  if (ua.includes("android")) return "android";
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (ua.includes("fbios")) return "ios";
  return "unknown";
}

/**
 * 플랫폼별 스토어 URL 에 캠페인 파라미터를 붙여 돌려준다.
 *
 * @param platform 판정된 스토어.
 * @param params   광고 링크로 들어온 쿼리스트링.
 */
export function buildStoreUrl(
  platform: ResolvedStorePlatform,
  params: URLSearchParams
): string {
  const target = new URL(platform === "ios" ? APP_STORE_URL : PLAY_STORE_URL);

  if (platform === "android") {
    for (const key of FORWARDED_UTM_KEYS) {
      const value = params.get(key);
      if (value) target.searchParams.set(key, value);
    }
    return target.toString();
  }

  // App Store 는 utm 대신 ct 하나로 축약한다. utm_campaign 이 없으면 utm_source 로 대체.
  const campaign = params.get("utm_campaign") || params.get("utm_source");
  const token = campaign ? toAppleCampaignToken(campaign) : "";
  if (token) {
    target.searchParams.set("ct", token);
    target.searchParams.set("mt", APPLE_MEDIA_TYPE);
  }
  return target.toString();
}

/** ct 는 영문·숫자·밑줄·하이픈만 안전하게 통과한다. 나머지는 버리고 상한까지 자른다. */
function toAppleCampaignToken(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_-]/g, "").slice(0, APPLE_CAMPAIGN_TOKEN_MAX);
}
