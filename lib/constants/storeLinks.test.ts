/**
 * 스토어 리다이렉트 회귀 테스트.
 *
 * 이 판정이 틀리면 광고비가 그대로 버려진다 — iPhone 사용자를 Play 스토어로 보내면 설치할 수
 * 없는 웹 페이지만 뜨고 그대로 이탈한다. 그래서 실제 Facebook·Instagram 인앱 브라우저가 보내는
 * UA 문자열을 그대로 고정해 두고 검증한다.
 *
 * 캠페인 파라미터도 함께 본다. Play 콘솔은 utm_*, App Store Connect 는 ct 만 읽으므로 둘을
 * 뒤바꿔 붙이면 어느 쪽에서도 유입 출처가 보이지 않는다.
 */
import { describe, expect, it } from "vitest";
import {
  APP_STORE_URL,
  PLAY_STORE_URL,
  buildStoreUrl,
  resolveStorePlatform,
} from "@/lib/constants/storeLinks";

/** 실제 수집된 UA 표본. 광고 트래픽의 대부분이 인앱 브라우저에서 온다. */
const UA = {
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  androidFacebook:
    "Mozilla/5.0 (Linux; Android 13; SM-S911N Build/TP1A.220624.014) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/440.0.0.30.108;]",
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneFacebook:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBDV/iPhone14,2;FBMD/iPhone;]",
  ipadDesktopModeFacebook:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBDV/iPad13,4;]",
  windowsChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
} as const;

const AD_PARAMS = new URLSearchParams(
  "utm_source=facebook&utm_medium=cpc&utm_campaign=anima_launch_kr"
);

describe("resolveStorePlatform", () => {
  it("Android 기기는 android 로 판정한다", () => {
    expect(resolveStorePlatform(UA.androidChrome)).toBe("android");
    expect(resolveStorePlatform(UA.androidFacebook)).toBe("android");
  });

  it("iPhone 은 ios 로 판정한다", () => {
    expect(resolveStorePlatform(UA.iphoneSafari)).toBe("ios");
    expect(resolveStorePlatform(UA.iphoneFacebook)).toBe("ios");
  });

  it("기기 토큰을 숨긴 iPadOS 데스크톱 모드도 FBIOS 토큰으로 ios 로 잡는다", () => {
    // UA 에 "Macintosh" 만 남아 iPad 임이 드러나지 않는다. 이 케이스가 Play 스토어로 새면
    // iPad 사용자는 설치 경로를 아예 못 찾는다.
    expect(resolveStorePlatform(UA.ipadDesktopModeFacebook)).toBe("ios");
  });

  it("데스크톱과 UA 부재는 unknown 으로 두어 랜딩으로 보낸다", () => {
    expect(resolveStorePlatform(UA.windowsChrome)).toBe("unknown");
    expect(resolveStorePlatform(null)).toBe("unknown");
    expect(resolveStorePlatform("")).toBe("unknown");
  });
});

describe("buildStoreUrl — Android", () => {
  it("Play 스토어로 utm_* 을 그대로 넘긴다", () => {
    const url = new URL(buildStoreUrl("android", AD_PARAMS));

    expect(url.origin + url.pathname).toBe(
      new URL(PLAY_STORE_URL).origin + new URL(PLAY_STORE_URL).pathname
    );
    expect(url.searchParams.get("utm_source")).toBe("facebook");
    expect(url.searchParams.get("utm_medium")).toBe("cpc");
    expect(url.searchParams.get("utm_campaign")).toBe("anima_launch_kr");
  });

  it("스토어 URL 원본의 id 파라미터를 잃지 않는다", () => {
    const url = new URL(buildStoreUrl("android", AD_PARAMS));
    expect(url.searchParams.get("id")).toBe(
      new URL(PLAY_STORE_URL).searchParams.get("id")
    );
  });

  it("허용 목록에 없는 쿼리는 스토어로 넘기지 않는다", () => {
    const url = new URL(
      buildStoreUrl("android", new URLSearchParams("utm_source=facebook&uid=abc123"))
    );
    expect(url.searchParams.has("uid")).toBe(false);
  });
});

describe("buildStoreUrl — iOS", () => {
  it("utm_campaign 을 Apple 캠페인 토큰 ct 로 옮긴다", () => {
    const url = new URL(buildStoreUrl("ios", AD_PARAMS));

    expect(url.origin + url.pathname).toBe(
      new URL(APP_STORE_URL).origin + new URL(APP_STORE_URL).pathname
    );
    expect(url.searchParams.get("ct")).toBe("anima_launch_kr");
    expect(url.searchParams.get("mt")).toBe("8");
  });

  it("Apple 이 무시하는 utm_* 은 붙이지 않는다", () => {
    const url = new URL(buildStoreUrl("ios", AD_PARAMS));
    expect(url.searchParams.has("utm_source")).toBe(false);
    expect(url.searchParams.has("utm_campaign")).toBe(false);
  });

  it("utm_campaign 이 없으면 utm_source 로 대체한다", () => {
    const url = new URL(
      buildStoreUrl("ios", new URLSearchParams("utm_source=facebook"))
    );
    expect(url.searchParams.get("ct")).toBe("facebook");
  });

  it("ct 는 안전한 문자만 남기고 40자로 자른다", () => {
    const url = new URL(
      buildStoreUrl("ios", new URLSearchParams(`utm_campaign=한글 캠페인/${"a".repeat(60)}`))
    );
    const ct = url.searchParams.get("ct") ?? "";

    expect(ct).toBe("a".repeat(40));
    expect(ct.length).toBe(40);
  });

  it("남는 토큰이 없으면 ct 를 아예 붙이지 않는다", () => {
    const url = new URL(
      buildStoreUrl("ios", new URLSearchParams("utm_campaign=한글만"))
    );
    expect(url.searchParams.has("ct")).toBe(false);
    expect(url.searchParams.has("mt")).toBe(false);
  });

  it("캠페인 파라미터가 없으면 스토어 주소를 그대로 돌려준다", () => {
    const url = buildStoreUrl("ios", new URLSearchParams());
    expect(url).toBe(new URL(APP_STORE_URL).toString());
  });
});
