# Anima iOS 출시 — Mac-side 작업 안내서

> 이 문서는 Windows 환경에서 Claude 가 준비한 골격 위에, Mac/Xcode 에서 이어 진행할 작업을
> 단계별로 정리한 안내서다. 단계마다 "왜 필요한가 / 거절 위험" 을 함께 적어 두어, 심사 거절
> 직전에 허둥대지 않도록 한다.
>
> 전략 배경: [scripts/ios-strategy.md](scripts/ios-strategy.md) 참고. 권장 경로는 B 안
> (Capacitor + 네이티브 위젯·결제·로그인) 으로, 4–6주 작업이다.

---

## TL;DR — Mac 에서 가장 먼저 할 다섯 가지

```bash
# 1. 저장소 클론 (또는 git pull)
git clone https://github.com/aseptichc-rgb/my-successful-future.git
cd my-successful-future

# 2. 의존성 설치
npm install
sudo gem install cocoapods   # 이미 있으면 생략

# 3. Capacitor 가 iOS 프로젝트를 생성
npx cap add ios

# 4. Pod 설치 + Xcode workspace 열기
cd ios/App && pod install && cd ../..
open ios/App/App.xcworkspace

# 5. Xcode 에서: Signing & Capabilities → Team 선택 → "Sign in with Apple" / "App Groups" 추가
```

이후 단계는 아래 절을 차례대로 따라가면 된다.

---

## 0. 사전 준비 (Apple Developer Console)

이미 Apple Developer Program 가입 상태라고 가정한다.

### 0-1. App ID 등록

`https://developer.apple.com/account/resources/identifiers/list/bundleId` 에서:

- **Bundle ID**: `com.michaelkim.anima` (Explicit)
- **Capabilities** 체크:
  - `Sign in with Apple`
  - `App Groups` → `group.com.michaelkim.anima` 생성 후 연결
  - `Push Notifications` (FCM 도입 시점에)

### 0-2. Sign in with Apple — Services ID & Key (Firebase 연동용)

`https://developer.apple.com/account/resources/identifiers/list/serviceId` 에서:

- **Services ID**: `com.michaelkim.anima.web` (Firebase Auth 가 OAuth callback 으로 호출)
  - Domain: `<프로젝트>.firebaseapp.com`
  - Return URL: `https://<프로젝트>.firebaseapp.com/__/auth/handler`

`https://developer.apple.com/account/resources/authkeys/list` 에서:

- **Key**: "Sign in with Apple" 활성화 + Apple ID `com.michaelkim.anima` 선택 후 `.p8` 다운로드 (한 번만 가능, 분실 시 재발급).
- **Key ID** (10자) 와 **Team ID** 를 기록.

### 0-3. App Store Connect — IAP & 앱 레코드

`https://appstoreconnect.apple.com/apps` 에서:

1. "+" → 새 App → Bundle ID 선택, SKU 자유 입력 (예: `ANIMA-IOS-001`)
2. App Information → Privacy Policy URL, Subscription Terms URL 등록
3. In-App Purchases → **anima_lifetime** Non-Consumable 1건 만들기 (안드로이드와 동일 ID 권장 — 양 플랫폼 코드 통일)
   - 가격: 안드로이드와 동일 또는 ±1단계 (수수료 차이는 마진으로 흡수)
4. App Store Server API → 인증 키 발급 (위 0-2 와 별도). `.p8` + Issuer ID + Key ID 메모.

### 0-4. Vercel 환경변수 추가 (서버 측 영수증 검증용)

```
APPLE_ISSUER_ID=<App Store Connect Issuer ID>
APPLE_KEY_ID=<App Store Server API Key ID>
APPLE_PRIVATE_KEY=<-----BEGIN PRIVATE KEY-----\n...-----END PRIVATE KEY-----\n>
APPLE_BUNDLE_ID=com.michaelkim.anima
APPLE_LIFETIME_PRODUCT_IDS=anima_lifetime
APPLE_USE_SANDBOX=false      # TestFlight 빌드는 true, App Store 배포 후엔 false
```

`APPLE_PRIVATE_KEY` 의 개행은 `\n` 으로 이스케이프해 한 줄로 저장한다.

---

## 1. Capacitor iOS 프로젝트 생성

```bash
npx cap add ios
```

이렇게 하면 `ios/App/App.xcworkspace` 가 만들어진다. `capacitor.config.ts` 가 `server.url`
모드라 WKWebView 가 매번 운영 URL 을 직접 로드한다.

### 1-1. Pod 설치

```bash
cd ios/App
pod install
```

### 1-2. Info.plist / Privacy Manifest / Entitlements 적용

`ios-templates/` 디렉터리에 준비된 템플릿을 다음 위치에 병합·복사한다:

- **Info.plist 병합**: `ios-templates/Info.plist` 의 키들을 `ios/App/App/Info.plist` 에
  하나씩 옮긴다(전부 덮어쓰지 말고 키별 추가).
- **PrivacyInfo.xcprivacy 복사**: `ios-templates/PrivacyInfo.xcprivacy` 를 `ios/App/App/`
  로 복사하고 Xcode 프로젝트에 "Create folder references" 로 추가.
- **App.entitlements 복사**: `ios-templates/App.entitlements` 를 `ios/App/App/` 로 복사 후
  Xcode > Build Settings > Code Signing Entitlements 에 경로 지정.

---

## 2. Firebase 통합

### 2-1. iOS 앱을 Firebase Console 에 등록

`https://console.firebase.google.com/project/<프로젝트>/settings/general` 에서:

- "앱 추가" → iOS → Bundle ID `com.michaelkim.anima`
- `GoogleService-Info.plist` 다운로드 → `ios/App/App/` 에 추가 (Xcode 가 자동으로 target
  에 포함시키도록 "Copy items if needed" 체크)
- Firebase SDK 는 Capacitor 의 `@capacitor-firebase/authentication` 플러그인을 통해 사용
  (다음 절에서 설치).

### 2-2. Apple Sign-In Provider 활성화

`https://console.firebase.google.com/project/<프로젝트>/authentication/providers` 에서:

- Apple 활성화
- Services ID: `com.michaelkim.anima.web`
- Apple Team ID: `<Team ID>`
- Key ID: `<Key ID>`
- Private Key: `.p8` 파일 내용 그대로 붙여넣기

---

## 3. Sign in with Apple (네이티브)

iOS WebView 의 Firebase `signInWithPopup(apple)` 은 핸들러 페이지(`<project>.firebaseapp.com`)
와 앱 오리진이 달라 WKWebView storage 파티셔닝으로 깨진다("missing initial state"). 그래서
네이티브 ASAuthorizationController 로 idToken/nonce 만 받아 Firebase **JS** SDK 의
`signInWithCredential` 로 세션을 만든다.

### 3-1. JS 배선 — 이미 완료(Windows 단계)

- 의존성: `@capacitor-firebase/authentication` 이 `package.json` 에 추가돼 있다.
- 분기 코드: [lib/nativeAuth.ts](lib/nativeAuth.ts) 의 `signInWithAppleNative()` 가 네이티브
  로그인 + JS SDK `signInWithCredential` 을 수행하고, [lib/firebase.ts](lib/firebase.ts) 의
  `signInWithApple()` 가 `isIosNative()` 로 iOS=네이티브 / 그 외=웹 popup 을 자동 분기한다.
- 플러그인 설정: [capacitor.config.ts](capacitor.config.ts) 에 `FirebaseAuthentication`
  (`skipNativeAuth: true`, `providers: ["apple.com"]`) 가 들어 있다.

### 3-2. Mac 에서 남은 일

```bash
npm install          # package.json 에 이미 명시 → 플러그인 설치
npx cap sync ios     # 플러그인 네이티브 코드 + capacitor.config 동기화
cd ios/App && pod install && cd ../..
```

그다음 Xcode 에서:

- **Signing & Capabilities → "Sign in with Apple"** 추가(§0-1 의 App ID Capability 와 일치).
- `GoogleService-Info.plist` 가 타깃에 포함돼 있는지 확인(§2-1) — 플러그인이 iOS FirebaseApp
  을 초기화하므로 필수.
- Firebase Console 의 Apple Provider(§2-2) 가 활성화돼 있어야 토큰 검증이 통과한다.

> 검증 포인트: TestFlight 빌드에서 Apple 버튼 → 네이티브 시트가 뜨고(웹 페이지로 안 넘어감),
> 로그인 후 홈으로 진입하면 성공. 시트를 닫으면 에러 없이 로그인 화면 유지(cancelled 처리).

자세한 플러그인 API: https://capawesome.io/plugins/firebase/authentication/

---

## 4. WidgetKit — 잠금화면 / 홈 화면 위젯

Android Glance 위젯의 iOS 등가물. Capacitor 는 위젯 익스텐션을 자동 생성하지 않으므로
Xcode 에서 수동으로 추가한다.

### 4-1. 위젯 익스텐션 타깃 추가

Xcode > File > New > Target → "Widget Extension" → "Anima Widget" 으로 생성.

### 4-2. App Group 공유 데이터스토어

메인 앱과 위젯 익스텐션이 같은 `UserDefaults(suiteName: "group.com.michaelkim.anima")` 를
바라보도록 양 타깃에 App Group 권한 부여. 이 디렉터리에 `widgetCache.json` 형식으로
`/api/widget/today` 응답을 그대로 직렬화해 저장한다.

### 4-3. TimelineProvider 구현 가이드

```swift
struct QuoteTimelineProvider: TimelineProvider {
    func getTimeline(in context: Context, completion: @escaping (Timeline<QuoteEntry>) -> Void) {
        // 1) /api/widget/today 호출 (Firebase ID Token 헤더)
        // 2) 응답을 App Group UserDefaults 에 저장
        // 3) 다음 자정까지의 한 장짜리 Timeline 반환 (Android 의 MidnightQuoteRefreshWorker 와 일치)
    }
}
```

URLSession + URLRequest 로 직접 호출. Firebase ID Token 은 `@capacitor-firebase/authentication`
플러그인이 메인 앱에서 갱신한 뒤 같은 App Group 의 UserDefaults 에 캐시해 둔다.

---

## 5. StoreKit 2 — 인앱 결제

### 5-1. Configuration.storekit 파일 추가

Xcode > File > New File > "StoreKit Configuration File" → 시뮬레이터에서 결제 테스트.

### 5-2. 결제 흐름

```swift
import StoreKit

let products = try await Product.products(for: ["anima_lifetime"])
let product = products.first!
let result = try await product.purchase()
switch result {
case .success(let verification):
    // verification 안의 jwsRepresentation 을 서버에 전달
    let jws = verification.jwsRepresentation
    await sendToBackend(jws)
case .userCancelled, .pending: break
@unknown default: break
}
```

`sendToBackend(jws)` 는 `POST /api/entitlement/verify-apple` 에 `signedTransactionInfo: jws`
를 실어 보낸다. 서버는 Apple StoreKit Server API 로 재검증한 뒤 Firebase claim 에
`ent: { kind: "lifetime", platform: "ios", productId, grantedAt }` 를 박는다.

---

## 6. 로컬 알림 — UNUserNotificationCenter

Android 의 `WinsReminderWorker` / `AffirmationsReminderWorker` 등가물.

```swift
let center = UNUserNotificationCenter.current()
let granted = try await center.requestAuthorization(options: [.alert, .sound, .badge])

// 매일 08:00 — 다짐 따라쓰기
var trigger = UNCalendarNotificationTrigger(dateMatching: DateComponents(hour: 8), repeats: true)
let req = UNNotificationRequest(identifier: "morning-affirmation", content: makeContent(), trigger: trigger)
try await center.add(req)

// 매일 21:00 — 잘한 일 3가지
trigger = UNCalendarNotificationTrigger(dateMatching: DateComponents(hour: 21), repeats: true)
```

알림 탭 시 `anima://home` deep link 로 라우팅 — 안드로이드의 `EXTRA_OPEN_TARGET=wins` 와 매핑.

---

## 7. 앱 아이콘 / 스플래시 / 스크린샷

### 7-1. 아이콘

`android/app/src/main/res/mipmap-*/` 에 있는 아이콘을 iOS 사이즈로 재생성한다.

- 원본 1024x1024 PNG 한 장 → `https://www.appicon.co/` 또는 `npx @capacitor/assets` 로 일괄 생성
- 결과를 `ios/App/App/Assets.xcassets/AppIcon.appiconset/` 에 넣는다.

### 7-2. 스크린샷 (App Store Connect 업로드용 필수)

- iPhone 6.7" (iPhone 16 Pro Max): 1290 x 2796 — **3장 이상 필수**
- iPhone 6.5" (옵션) / 5.5" (옵션)
- iPad 13": 2064 x 2752 — iPad 지원 시 필수

권장 컷:
1. 위젯이 잠금화면에 떠 있는 모습
2. 홈 화면 (오늘의 한 마디 + 체크리스트)
3. 다짐 따라쓰기 화면
4. 잘한 일 3가지 입력 화면
5. 결제 화면 (Apple IAP)

---

## 8. 심사 제출 (App Store Connect)

`docs/app-store-listing-ko.md` 의 한국어 메타데이터와 `docs/app-store-listing-en.md` 의
영어 메타데이터를 그대로 붙여넣는다.

### 8-1. App Review 정보

- **데모 계정**: 평가자가 결제 없이 모든 기능을 볼 수 있도록 `entitlements/{uid}` 에
  수동으로 `ent.kind = "lifetime"` 을 박은 테스트 계정을 제공.
- **데모 영상 1분**: 위젯 추가 → 잠금화면에서 카드 확인 → 다짐 따라쓰기 → 결제 → 계정 삭제.

### 8-2. 자주 걸리는 거절 사유 체크리스트

- [ ] Sign in with Apple 동작 확인 (Guideline 5.1.1(v))
- [ ] 계정 삭제 메뉴 동작 (Settings → 계정 삭제 → `DELETE /api/account/delete`)
- [ ] IAP 외 결제 안내·링크 없음 (Guideline 3.1.1)
- [ ] Privacy Manifest 와 App Privacy 일치 (Guideline 5.1.2)
- [ ] 단순 WebView 아님 — 위젯·알림·IAP 가 네이티브 (Guideline 4.2)

---

## 9. 출시 후 운영

- **결제 환불**: Apple Server-to-Server Notifications V2 webhook 을
  `POST /api/apple-webhook` 으로 받아 `ent` claim 을 무효화한다.
  (이번 세션 범위 밖 — 별도 PR 로 추가 예정.)
- **iOS / Android 백엔드 통일**: Next.js 코드는 단일 소스. `ent.platform` 만 다르고
  나머지 로직은 동일.
- **iOS 만 다른 가격**: Apple 수수료 (30%, 소규모 개발자 15%) 차이 흡수 결정 — 동일 가격
  유지 시 마진 15% 차이.

---

## 10. 참고

- 전략 문서: [scripts/ios-strategy.md](scripts/ios-strategy.md)
- 안드로이드 Data Safety 대응본: [scripts/play-data-safety.md](scripts/play-data-safety.md) — App Privacy 답안에 그대로 매핑 가능.
- Apple Guideline 전체: https://developer.apple.com/app-store/review/guidelines/
- StoreKit 2 공식 가이드: https://developer.apple.com/storekit/
- App Store Server API: https://developer.apple.com/documentation/appstoreserverapi
