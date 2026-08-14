/**
 * GET /go/app — 광고 클릭을 기기에 맞는 스토어로 넘기는 리다이렉트.
 *
 * Meta 광고는 광고 하나당 도착지 URL 이 하나뿐이라, 같은 광고로 Android·iOS 를 함께 받으려면
 * 서버가 갈라줘야 한다. 이 라우트가 그 역할을 한다.
 *
 *   Android  → Google Play  (utm_* 전달)
 *   iOS      → App Store    (utm_campaign → Apple ct 로 변환)
 *   그 외    → 마케팅 랜딩 "/"  (데스크톱·봇·판정 실패)
 *
 * 광고에 넣는 주소:
 *   https://<host>/go/app?utm_source=facebook&utm_medium=cpc&utm_campaign=anima_launch_kr
 *
 * ── 캐시 금지 ────────────────────────────────────────────────────
 * 응답이 User-Agent 에 따라 갈리므로 한 번 캐시되면 iOS 사용자가 Play 스토어로 가는 사고가 난다.
 * force-dynamic 과 no-store 를 둘 다 건다. 301 도 쓰지 않는다 — 브라우저가 UA 별 분기를
 * 영구 캐시해버린다.
 *
 * ── 검증 ────────────────────────────────────────────────────────
 * ?p=ios / ?p=android 를 붙이면 UA 판정을 건너뛰고 해당 스토어로 보낸다. 배포 후 데스크톱에서
 * 양쪽 경로를 확인하는 용도이며, 광고 링크에는 넣지 않는다.
 *
 * 미들웨어([middleware.ts])의 matcher 는 /login·/signup·/home 만 잡으므로 이 경로는 인증
 * 없이 열린다.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  buildStoreUrl,
  resolveStorePlatform,
  type ResolvedStorePlatform,
} from "@/lib/constants/storeLinks";

export const dynamic = "force-dynamic";

/** 임시 리다이렉트. UA 별로 결과가 달라지므로 영구(301)로 굳히면 안 된다. */
const TEMPORARY_REDIRECT_STATUS = 302;

export function GET(request: NextRequest) {
  const landingUrl = new URL("/", request.nextUrl.origin).toString();

  try {
    const params = request.nextUrl.searchParams;
    const platform =
      readPlatformOverride(params) ??
      resolveStorePlatform(request.headers.get("user-agent"));

    if (platform === "unknown") return redirectTo(landingUrl);
    return redirectTo(buildStoreUrl(platform, params));
  } catch (err) {
    // 광고 도착지에서 500 을 내면 그 클릭에 쓴 예산이 그대로 버려진다. 스토어 URL 이 잘못
    // 주입돼 new URL 이 던지는 경우까지 포함해, 어떤 실패든 랜딩으로 흘려보낸다.
    console.error("[go/app] 리다이렉트 실패 — 랜딩으로 폴백", err);
    return redirectTo(landingUrl);
  }
}

function redirectTo(destination: string): NextResponse {
  const response = NextResponse.redirect(destination, TEMPORARY_REDIRECT_STATUS);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

/** ?p=ios|android 검증용 우회. 알 수 없는 값은 무시하고 UA 판정에 맡긴다. */
function readPlatformOverride(
  params: URLSearchParams
): ResolvedStorePlatform | null {
  const raw = params.get("p");
  if (raw === "ios" || raw === "android") return raw;
  return null;
}
