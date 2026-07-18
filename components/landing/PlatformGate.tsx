"use client";

/**
 * 랜딩 페이지 플랫폼 게이트 — iOS 앱(WKWebView) 안에서는 타 스토어/플랫폼 참조를 절대
 * 노출하지 않기 위한 클라이언트 게이트.
 *
 * 왜 필요한가 (Apple Guideline 2.3.10 — Accurate Metadata):
 *   iOS 앱은 Capacitor `server.url` 모드라 WKWebView 가 운영 웹 URL 을 그대로 로드한다
 *   ([capacitor.config.ts]). 즉 앱 바이너리가 이 랜딩 페이지를 그대로 띄우므로, 웹의
 *   "Google Play 에서 받기" 버튼과 "안드로이드 앱에서 동작"·"잠금화면" 문구가 앱 안에서
 *   보여 2.3.10 위반으로 심사 거절됐다.
 *
 * 안전 기본값 (iOS-safe by default):
 *   같은 URL 을 웹·iOS 가 공유하고, 플랫폼 판정은 Capacitor 전역 주입에 의존해 클라이언트에서만
 *   가능하다(서버/User-Agent 로는 iOS 앱과 iOS 사파리 방문자를 구분 불가). 그래서 SSR·하이드레이션
 *   스냅샷은 항상 false(=iOS 안전 변형: 스토어 버튼 없음, 타 플랫폼 문구 없음)를 돌려주고, 웹
 *   브라우저로 확정된 뒤에만 마케팅 변형(Play 버튼·잠금화면 카피)으로 승격한다.
 *   → iOS 에는 어떤 프레임에서도 노출되지 않아 깜빡임(flash)조차 없다.
 *
 *   useSyncExternalStore 를 쓰는 이유: (1) 하이드레이션 시 서버 스냅샷을 사용해 미스매치 없이
 *   iOS 안전 마크업으로 맞춘 뒤 클라이언트 스냅샷으로 승격하고, (2) effect 안 setState 를 피해
 *   프로젝트 lint 규칙(react-hooks/set-state-in-effect)을 위반하지 않는다.
 *
 * 이 판정은 [lib/nativeAuth.ts#isIosNative] 와 동일 로직이지만, 마케팅 페이지가 firebase/auth
 * 번들을 끌어오지 않도록 @capacitor/core 만 의존하는 경량 사본으로 분리해 둔다.
 */
import { useSyncExternalStore, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";

/** iOS 네이티브(Capacitor WKWebView) 위에서 실행 중인지. SSR/웹/안드로이드에선 false. */
function isIosNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
  } catch {
    // Capacitor 가 주입되지 않은 일반 웹 — 네이티브 아님.
    return false;
  }
}

// 플랫폼은 마운트 이후 불변이라 최초 1회만 계산해 캐시한다.
// (getSnapshot 은 렌더마다 호출되므로 안정된 원시값을 돌려줘야 무한 렌더가 없다.)
let cachedIsWeb: boolean | null = null;

/** 클라이언트 스냅샷: iOS 앱이 아니면 true. 최초 계산 후 캐시. */
function getClientSnapshot(): boolean {
  if (cachedIsWeb === null) cachedIsWeb = !isIosNativeApp();
  return cachedIsWeb;
}

/** 서버/하이드레이션 스냅샷: 항상 iOS 안전(false). 하이드레이션 후 클라이언트 값으로 승격. */
function getServerSnapshot(): boolean {
  return false;
}

/** 값이 마운트 이후 바뀌지 않으므로 구독은 no-op. */
function subscribe(): () => void {
  return () => {};
}

/**
 * "iOS 앱이 아닌 웹 브라우저" 로 확정됐는지.
 * SSR·하이드레이션 동안 false(iOS 안전) → 클라이언트에서 웹으로 확인되면 true 로 승격된다.
 */
export function useIsWebBrowser(): boolean {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}

/** 웹 브라우저에서만 자식을 렌더. iOS 앱·SSR 에선 아무것도 그리지 않는다. */
export function WebOnly({ children }: { children: ReactNode }) {
  return useIsWebBrowser() ? <>{children}</> : null;
}

/** 플랫폼별 문구 스위처 — iOS 안전 문구를 기본으로, 웹에서만 마케팅 문구로 바뀐다. */
export function PlatformText({ web, ios }: { web: string; ios: string }) {
  return <>{useIsWebBrowser() ? web : ios}</>;
}
