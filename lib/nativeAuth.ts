/**
 * 네이티브(iOS) Sign in with Apple 플러밍.
 *
 * 왜 별도 경로인가:
 *   iOS 앱은 Capacitor WKWebView 가 운영 URL 을 직접 로드하는 래퍼다([capacitor.config.ts]).
 *   웹 표준 OAuth 인 `signInWithPopup(apple)` 은 핸들러 페이지(`<project>.firebaseapp.com/__/auth/handler`)
 *   가 앱 오리진(`successfulfuture.app`) 과 다르고, WKWebView 가 오리진별로 sessionStorage 를
 *   파티셔닝해서 "missing initial state" 로 깨진다(README-IOS §3 의 예견된 한계).
 *
 *   해결: `@capacitor-firebase/authentication` 으로 네이티브 ASAuthorizationController 를 띄워
 *   Apple ID 토큰 + nonce 만 받고(`skipNativeAuth`), Firebase **JS** SDK 의 signInWithCredential
 *   로 동일 세션을 만든다. 이렇게 하면 popup/리다이렉트·크로스오리진 storage 가 전혀 개입하지
 *   않는다. JS SDK 가 그대로 권위 세션이라 Firestore/위젯 브릿지 등 기존 흐름과 100% 호환.
 *
 * Mac 단계 의존: 이 코드가 실제로 동작하려면 Xcode 에서 `npx cap sync ios` + GoogleService-Info.plist
 *   + "Sign in with Apple" Capability 가 적용돼야 한다(README-IOS §1~3).
 */
import { Capacitor } from "@capacitor/core";
import { OAuthProvider, signInWithCredential, type Auth } from "firebase/auth";

/** iOS 네이티브(Capacitor WKWebView) 위에서 실행 중인지. SSR/웹/안드로이드에선 false. */
export function isIosNative(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
  } catch {
    // Capacitor 가 주입되지 않은 일반 웹 — 네이티브 아님.
    return false;
  }
}

// ASAuthorizationError.canceled — 사용자가 Apple 시트를 닫았을 때의 코드.
const APPLE_CANCEL_CODE = "1001";

/**
 * Apple 로그인을 사용자가 "취소" 해서 던져진 에러인지 판정.
 * 플러그인/OS 버전에 따라 code 가 문자열/숫자거나 메시지로만 오는 경우가 있어 폭넓게 매칭한다.
 * 취소는 실패가 아니므로 호출부가 에러 토스트 없이 조용히 로그인 화면을 유지하도록 구분한다.
 */
export function isAppleSignInCancelled(err: unknown): boolean {
  const code = (err as { code?: string | number } | null)?.code;
  if (code === APPLE_CANCEL_CODE || code === Number(APPLE_CANCEL_CODE)) return true;
  const message = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  return message.includes("cancel"); // "canceled" / "cancelled" 양철자 모두 포함.
}

/**
 * 네이티브 ASAuthorizationController 로 Apple 로그인 후, 받은 idToken/nonce 로 Firebase JS SDK
 * 세션을 만든다. 동적 import 로 웹/안드로이드 번들에는 네이티브 플러그인 코드를 끌어오지 않는다.
 *
 * @throws idToken 미수신·취소·account-exists 등은 그대로 throw — 호출부([signInWithApple])가
 *   needsLink/cancelled 분기와 에러 처리를 담당한다.
 */
export async function signInWithAppleNative(auth: Auth): Promise<void> {
  const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
  // skipNativeAuth: 네이티브 Firebase SDK 로그인은 건너뛰고 credential 만 받는다 — JS SDK 가 권위.
  const result = await FirebaseAuthentication.signInWithApple({ skipNativeAuth: true });

  const idToken = result.credential?.idToken;
  const rawNonce = result.credential?.nonce;
  if (!idToken) {
    // 정상 흐름이면 항상 idToken 이 온다. 없으면 Firebase 가 거절하므로 명시적으로 끊는다.
    throw new Error("Apple 네이티브 로그인 응답에 idToken 이 없습니다.");
  }

  // 네이티브가 hash(rawNonce) 로 Apple 에 요청했으므로, Firebase 검증엔 rawNonce 를 넘겨야 한다.
  const provider = new OAuthProvider("apple.com");
  const credential = provider.credential({ idToken, rawNonce });
  await signInWithCredential(auth, credential);
}
