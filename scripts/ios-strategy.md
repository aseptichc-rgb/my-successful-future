# iOS 출시 전략 — 거절 위험 정리와 권장 경로

> 작성일: 2026-05-13
> 대상: 현재 안드로이드 우선(TWA + Glance 위젯) 으로 출시된 Anima 의 iOS 진출.

---

## TL;DR

| 옵션 | 거절 위험 | 개발 비용 | 권장도 |
|---|---|---|---|
| A. 현재 Next.js 를 WKWebView 로 감싼 단순 래퍼 | 🔴 매우 높음 (Guideline 4.2) | 1주 | ❌ 비권장 |
| B. **Capacitor / React Native + 네이티브 위젯·결제·로그인** | 🟡 중간 | 4–6주 | ✅ **권장** |
| C. Swift 풀 네이티브 재작성 | 🟢 낮음 | 8–12주 | ⏳ 매출 검증 후 |

**현재 안드로이드의 강점(잠금화면 위젯, 푸시 리마인더, Play Billing, 네이티브 Firebase Auth)
을 iOS 에 그대로 옮기려면 단순 WebView 래퍼로는 불가능합니다.** Capacitor 위에
WidgetKit / StoreKit / Sign in with Apple 을 네이티브로 얹는 B 안이 비용·심사 통과
관점에서 최적입니다.

---

## 1. iOS App Store 의 핵심 거절 사유 (현재 구조 그대로 옮기면)

### 1-1. Guideline 4.2 — Minimum Functionality
> "Your app should include features, content, and UI that elevate it beyond a
> repackaged website."

웹사이트를 그대로 감싸 띄우는 앱은 거의 자동 거절입니다. 안드로이드 TWA 처럼
**도메인 검증 한 줄로 통과되는 우회로가 iOS 에는 없습니다.**

✅ 대응:
- iOS 위젯 (WidgetKit) 으로 잠금화면/홈스크린에 명언 노출 — 현재 Glance 위젯의 iOS 등가물.
- 로컬 알림 (UNUserNotificationCenter) 으로 아침 다짐·저녁 잘한 일 리마인더.
- "오늘의 한 마디" 메인 화면을 네이티브 UI 로 — WebView 는 페르소나 채팅/온보딩
  등 콘텐츠가 많은 부수 화면만 호스팅.

### 1-2. Guideline 5.1.1(v) — Sign in with Apple 강제
> 앱이 제3자 로그인(Google, Facebook 등)을 제공하면 동등하게 Apple 로그인도 제공해야 함.

현재 Google 로그인만 사용 → iOS 에서는 **Sign in with Apple 추가 의무.**

✅ 대응:
- `AuthenticationServices` 의 `ASAuthorizationAppleIDProvider` 로 Apple Sign-In 추가.
- Firebase Auth 의 Apple provider 와 연동 — 백엔드는 동일 uid 체계 유지.
- 기존 Google 계정과 같은 이메일이면 Firebase `linkWithCredential` 로 자동 병합.

### 1-3. Guideline 3.1.1 — In-App Purchase 강제
> 디지털 콘텐츠/구독은 **반드시 Apple IAP** 를 통해 결제. 외부 결제 안내·링크도 금지.

현재 Play Billing 사용 → iOS 에서는 **StoreKit 으로 별도 결제 흐름 필수**, 30% (소형
개발자 프로그램 가입 시 15%) 수수료. 가격을 양 플랫폼에서 다르게 설정 가능.

✅ 대응:
- StoreKit2 + 서버 측 영수증 검증 (`POST /api/entitlement/verify-apple`).
- 기존 `lib/entitlement.ts` 의 `ent` 객체 claim 형식을 그대로 사용 — 영수증 검증
  로직만 플랫폼별로 분기.
- 가격은 안드로이드와 동일하게 보여도 되지만, 수수료 차이만큼 마진이 다르므로
  KRW 가격대를 함께 검토.

### 1-4. Guideline 5.1.1(v) — 계정 삭제 의무
> 계정 생성을 지원하는 앱은 앱 내에서 계정 삭제도 지원해야 함.

이미 `DELETE /api/account/delete` 가 있으므로 **iOS 클라이언트에서도 동일 엔드포인트
호출** 하면 OK.

### 1-5. 기타 자주 걸리는 항목

- **Guideline 4.7**: 동적 코드 로딩 금지 — JavaScript 로 동작하는 콘텐츠는
  WebView 안에서만 허용. JSBridge 로 네이티브 권한을 늘리는 건 위험.
- **App Tracking Transparency**: AdID 비사용이면 무관. 분석 SDK 도입 시 ATT 다이얼로그 필수.
- **Privacy Manifest** (2024+): 사용하는 API 와 데이터 카테고리를 plist 로 선언 의무.
  Anima 는 거의 비어있어도 OK.

---

## 2. 권장 아키텍처 (B 안)

```
┌──────────────────────────────────────────────────────────────┐
│  iOS 앱 (Swift + SwiftUI)                                     │
│  ─ 메인 화면 (오늘의 한 마디) ─ SwiftUI 네이티브               │
│  ─ 위젯 (WidgetKit) ─ 잠금화면 / 홈스크린 / StandBy            │
│  ─ Sign in with Apple + Google (Firebase Auth)                │
│  ─ StoreKit2 (구매 / 영수증)                                  │
│  ─ UNUserNotificationCenter (로컬 알림)                       │
│  ─ Capacitor WebView ─ 페르소나 채팅, 온보딩, 통계 등          │
│       └─ 기존 Next.js (Anima 웹) 그대로 호스팅                 │
└──────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│  공유 백엔드 (Next.js on Vercel, 변경 거의 없음)              │
│  ─ /api/widget/today          (기존)                          │
│  ─ /api/entitlement/verify    (Android)                       │
│  ─ /api/entitlement/verify-apple  ★ 신규 — App Store 영수증   │
│  ─ /api/account/delete        (기존, iOS 도 동일 호출)        │
│  ─ Firestore: ent claim 은 객체 형식으로 통일                 │
│       { ent: { kind: 'lifetime' | 'subscription',             │
│                platform: 'ios' | 'android', productId,        │
│                grantedAt, expiresAt? } }                      │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. 단계별 작업 (4–6주)

### Week 1 — 프로젝트 골격
- [ ] Xcode 프로젝트 생성 (`com.michaelkim.anima`, App Group ID).
- [ ] Capacitor 설치 후 기존 Next.js `/home` 을 WebView 로 띄워 동작 확인.
- [ ] Firebase iOS SDK 통합 (`GoogleService-Info.plist`).

### Week 2 — 인증
- [ ] Sign in with Apple 통합 + Firebase Auth Apple provider.
- [ ] Google Sign-In (`@GoogleSignIn` SwiftPM) 병행 — 기존 사용자 호환.
- [ ] iOS → Web 세션 브릿지: 현재 Android 의 `nativeToken=customToken` 흐름을
      그대로 사용. WKWebView 의 `WKUserContentController` 로 주입.

### Week 3 — 위젯 + 알림
- [ ] WidgetKit `IntentTimelineProvider` 로 `/api/widget/today` 호출 후 카드 렌더.
- [ ] iOS 16.4+ Lock Screen / StandBy 모드 지원.
- [ ] `UNUserNotificationCenter` 로 일일 다짐/잘한 일 로컬 알림 스케줄.
      (안드로이드의 WorkManager 등가.)

### Week 4 — 결제
- [ ] StoreKit2 구성 (Configuration.storekit 파일로 디버그).
- [ ] 영수증 검증 라우트 `/api/entitlement/verify-apple` — 서버 to App Store API
      (`https://buy.itunes.apple.com/verifyReceipt` 또는 새 JWS 방식).
- [ ] 기존 `lib/entitlement.ts` 의 객체 claim 형식 활성화 — `platform` 필드 추가.

### Week 5 — 심사 준비
- [ ] 앱 내 계정 삭제 메뉴 (Settings) — `DELETE /api/account/delete` 호출.
- [ ] App Privacy / Data Safety 매니페스트 = `scripts/play-data-safety.md` 와 일치하게 매핑.
- [ ] App Store Connect 메타데이터: 스크린샷, 키워드, 데모 계정.
- [ ] 심사용 데모 동영상 1분 — 위젯 추가 → 카드 갱신 → 결제 흐름 → 계정 삭제.

### Week 6 — 베타 / TestFlight
- [ ] TestFlight 내부 테스트 → 외부 100명.
- [ ] 크래시·심사 거절 사유 정리 → 출시.

---

## 4. 의사결정 트리거

iOS 출시는 다음 중 **둘 이상**이 만족된 시점에 시작하는 걸 권장합니다.

1. 안드로이드 MAU 가 1,000 명을 돌파.
2. 안드로이드 결제 전환율 > 2%.
3. 사용자 피드백에 "iOS 도 내주세요" 요청이 월 5건 이상 누적.
4. 본 프로젝트의 월 매출 > 200 만 원 (Apple 수수료 + 개발 인건비 회수 가능 구간).

이전에 iOS 부터 손대면 안드로이드의 핵심 가설(잠금화면 위젯이 실제로 동기부여를
지속시키는가) 검증이 늦어집니다.

---

## 5. 출시 후에도 유지할 원칙

- **iOS 와 안드로이드 백엔드는 단일 코드베이스(Next.js)** — 결제·entitlement 만
  플랫폼별로 분기.
- **콘텐츠 변경은 양 플랫폼 동시 반영** — 한 쪽만 갱신하면 사용자 신뢰 손상.
- **개인정보 처리방침/약관은 양 스토어에서 동일 URL** (`/privacy`, `/terms`).
