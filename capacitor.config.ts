/**
 * Capacitor 설정 — iOS 빌드 전용 골격.
 *
 * 전략:
 *   - 안드로이드 TWA 처럼 "서버 URL 모드" 로 운영. Capacitor 가 `server.url` 을 가리키면
 *     WKWebView 가 매번 그 URL 을 직접 로드한다 — 별도 정적 export 불필요, 백엔드는 그대로.
 *   - iOS 의 Apple App Review (Guideline 4.2 — Minimum Functionality) 를 통과하려면
 *     단순 WebView 래퍼만으로는 부족하다. Mac 작업 단계에서 다음을 네이티브로 추가한다:
 *       1) WidgetKit 으로 잠금화면/홈 화면 위젯 (Android Glance 위젯의 iOS 등가물)
 *       2) StoreKit 2 로 인앱 결제 (Guideline 3.1.1 강제)
 *       3) Sign in with Apple (Guideline 5.1.1(v) 강제 — Google 만 있으면 거절)
 *       4) UNUserNotificationCenter 로 일일 다짐/잘한 일 로컬 알림
 *
 *   - server.url 을 환경변수로 분리 — 운영(Vercel) / 스테이징 / 로컬 dev 를 빌드 시점에 선택.
 *
 * Mac 에서 첫 셋업:
 *   1) npx cap add ios            # ios/ 디렉터리 생성, Xcode 프로젝트 부트스트랩
 *   2) cd ios/App && pod install
 *   3) open ios/App/App.xcworkspace  # Xcode 에서 GoogleService-Info.plist 추가, 코드 사인
 *
 * 자세한 단계는 [README-IOS.md](./README-IOS.md) 참고.
 */
import type { CapacitorConfig } from "@capacitor/cli";

// 운영 URL — 안드로이드와 동일한 호스트를 사용한다 (assetlinks/세션 호환).
//   android/app/src/main/res/values/asset_statements.xml 의 정식 호스트와 일치시킨다.
//   커스텀 도메인(successfulfuture.app)은 DNS 미등록 상태(NXDOMAIN)라 라이브 Vercel
//   배포 URL 을 기본값으로 둔다. 커스텀 도메인 등록 후에는 이 기본값을 바꾸거나
//   빌드 시 IOS_SERVER_URL 환경변수로 덮어쓰면 된다 (스테이징/PR 프리뷰 등).
const SERVER_URL = process.env.IOS_SERVER_URL || "https://my-successful-future.vercel.app";

const config: CapacitorConfig = {
  appId: "com.michaelkim.anima",
  appName: "Anima",
  // Capacitor 의 정적 자산 디렉터리. 우리는 server.url 모드를 쓰므로 비어 있어도 무방하지만,
  // 빌드 도구가 디렉터리 존재를 요구하므로 더미 폴더로 둔다. iOS 빌드 직전 npm run ios:sync
  // 가 빈 디렉터리를 생성/동기화한다.
  webDir: "ios-webview-shell",
  server: {
    // WKWebView 가 매 부팅마다 이 URL 을 직접 로드한다.
    url: SERVER_URL,
    // androidScheme 는 iOS 동작과 무관하지만 Capacitor 가 요구함.
    androidScheme: "https",
    // iOS WKWebView 가 self-signed 인증서를 허용할지 — 운영은 false.
    cleartext: false,
  },
  ios: {
    // 백 버튼 동작: WebView 가 history.back 가능하면 history.back, 아니면 시스템 기본.
    // iOS 는 백 버튼이 없지만 swipe back 제스처를 위해 이 옵션을 명시.
    backgroundColor: "#F0EDE6", // 안드로이드 Theme.Anima 와 동일 베이지.
    // WKWebView 로딩 실패 시 보여줄 텍스트 (네이티브 alert 로 노출).
    loggingBehavior: "production",
    // iOS 16.4+ 에서 표준이 된 WKWebView 인스펙터 활성화 — TestFlight 빌드도 디버깅 가능.
    webContentsDebuggingEnabled: true,
    // App Group ID — 위젯 익스텐션과 데이터 공유 시 사용. Apple Developer Account 에서
    // group.com.michaelkim.anima 를 등록한 뒤 Xcode Capabilities 에서 활성화한다.
    // 위 ID 와 Info.plist 의 NSAppTransportSecurity 도 함께 설정해야 한다.
    scheme: "Anima",
  },
};

export default config;
