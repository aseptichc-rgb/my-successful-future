# Firebase Crashlytics 도입 설계 (안드로이드)

- 날짜: 2026-06-02
- 범위: 안드로이드 네이티브(Kotlin) 앱
- 도입 깊이: **옵션 B** — 자동 크래시 수집 + 비치명적 오류(`recordException`) 수집
- 비범위: 웹 화면(TWA 안의 Next.js) JS 오류, iOS, 사용자 식별(`setUserId`)

## 배경

앱 사용 중 발생한 오류의 원인을 사후에 추적할 인프라가 없다. 현재는:

- 서버/웹(Next.js): API 라우트가 `try-catch` 후 `console.error`로만 출력 → 수집·저장 안 됨. 전역 에러 바운더리 없음.
- 안드로이드: 17개 파일에 `try-catch` + `Log.e/Log.w` 산재 → Logcat에만 남아 출시 기기에서 볼 수 없음. 전역 크래시 핸들러 없음.

안드로이드 앱은 본문을 **TWA**로 감싸고 그 위에 네이티브 **위젯·백그라운드 워커·로그인 브릿지**가 올라간 구조다. 따라서 Crashlytics가 잡는 건 네이티브(Kotlin) 크래시/오류이며, 웹 화면 내부 JS 오류는 별도 도구(Sentry 등)가 필요하다 — 이번 범위 밖.

Firebase는 이미 연동돼 있다: BOM 33.7.0, `google-services` 플러그인, `firebase-auth-ktx`, `firebase-analytics-ktx`, `google-services.json`. 따라서 Crashlytics는 플러그인 + 의존성만 추가하면 자동 수집이 동작한다.

## 결정 사항 (사용자 확정)

1. **수집 동의**: 기본 수집 + 정책 고지 (opt-in UI 없음).
2. **디버그 빌드**: 전송 끔 — 릴리스에서만 수집.
3. **비치명적 범위**: 예외를 삼키고 로그만 남기던 "조용히 실패하던" catch 블록에만 `recordException` 부착. 정상 흐름 제어용 catch는 제외.

## 설계

### 1. Gradle 연동

- `android/gradle/libs.versions.toml`
  - `[versions]`: `firebaseCrashlyticsPlugin = "3.0.2"` (Crashlytics Gradle 플러그인)
  - `[libraries]`: `firebase-crashlytics-ktx = { module = "com.google.firebase:firebase-crashlytics-ktx" }` (버전은 BOM이 관리 → 명시 안 함)
  - `[plugins]`: `firebase-crashlytics = { id = "com.google.firebase.crashlytics", version.ref = "firebaseCrashlyticsPlugin" }`
- `android/build.gradle.kts`: `alias(libs.plugins.firebase.crashlytics) apply false` 추가
- `android/app/build.gradle.kts`:
  - `plugins { ... alias(libs.plugins.firebase.crashlytics) }`
  - `dependencies { ... implementation(libs.firebase.crashlytics.ktx) }`
- Firebase BOM·analytics가 이미 있어 버전 충돌·추가 google-services 설정 불필요.

### 2. 디버그 수집 비활성

`AnimaApplication.onCreate()`에 추가:

```kotlin
FirebaseCrashlytics.getInstance().isCrashlyticsCollectionEnabled = !BuildConfig.DEBUG
```

매직값 없이 빌드 플래그로 제어. 릴리스 빌드에서만 전송.

### 3. 중앙 리포터 유틸 — `util/CrashReporter.kt`

DRY + 프라이버시 단일 통로. `FirebaseCrashlytics.getInstance()`를 코드 전반에 흩지 않는다.

- `object CrashReporter`
- `fun record(tag: String, message: String, throwable: Throwable)`:
  - 기존과 동일하게 `Log.w/e(tag, message, throwable)`로 Logcat에 남기고
  - `FirebaseCrashlytics.getInstance()`에 `log(message)` + `recordException(throwable)` 보고
- 선택적 비-PII 커스텀 키만 부착(화면/워커명, `ymd` 등). **이메일·인증 토큰·다짐/잘한 일 본문 등 PII는 절대 부착 금지** — 단일 통로라 마스킹 누락 위험을 한 곳에서 통제.
- 모든 보고 경로를 `try` 밖에서도 안전하게(보고 자체가 던지지 않게) 감싼다.

### 4. "조용히 실패하던" catch 블록 배선

예외를 삼키고 로그만 남기던 지점만 `CrashReporter.record(...)`로 교체. 대상 카테고리:

- **워커**: `work/QuoteRefreshWorker.kt`, `work/MidnightQuoteRefreshWorker.kt`, `work/AffirmationsReminderWorker.kt`, `work/WinsReminderWorker.kt`, `work/WorkScheduler.kt`
- **위젯**: `widget/QuoteWidget.kt`, `widget/QuoteWidgetReceiver.kt`, `widget/WidgetUi.kt`, `AnimaApplication.kt`(ForegroundWidgetRefresher)
- **인증·브릿지**: `AuthBridgeActivity.kt`, `SignOutBridgeActivity.kt`, `WidgetRefreshBridgeActivity.kt`
- **데이터 계층(swallow-and-continue)**: `data/api/ApiClient.kt`, `data/QuoteRepository.kt`, `data/local/QuoteCache.kt` 및 기타 예외를 삼키는 지점

제외:
- 정상 흐름 제어용 catch(예: 빈 바디 허용 같은 의도된 무시)
- 호출자에게 그대로 전파되는(이미 상위에서 처리되는) 예외
- 옵션 B이므로 `setUserId`(사용자 식별)는 하지 않음

각 사이트의 정확한 라인은 구현 계획(writing-plans) 단계에서 파일별로 확정한다.

### 5. 정책 고지

- `scripts/play-data-safety.md`: 크래시 로그 행을 `(미수집)` → **수집함**으로 갱신. 목적: 앱 기능/안정성, 신원 비연결, 미공유.
- `app/privacy/page.tsx`(개인정보처리방침): 진단/크래시 데이터 수집 문구 추가.
- iOS `PrivacyInfo.xcprivacy`: 이번 범위 밖 — 손대지 않음.

## 에러 처리 / 안전성

- `CrashReporter`의 보고 로직 자체가 예외를 던지지 않도록 내부 가드. 수집 비활성(디버그) 시에도 무해하게 동작.
- 기존 catch의 동작(예: 워커 `Result.retry()`/`failure()`, 위젯 fallback 렌더) 의미는 보존하고 보고만 추가.

## 테스트 / 검증

1. 디버그·릴리스 변형 컴파일 통과 (`assembleDebug`/`assembleRelease` 또는 `compile*Kotlin`).
2. 연동 확인: 디버그 수집이 꺼져 있으므로, 임시로 수집을 켜고 강제 테스트 예외 1건을 발생시켜 Crashlytics 콘솔 도착 확인 후 원복. 영구 테스트 트리거(버튼 등)는 남기지 않는다.
3. 기존 워커/위젯 동작 회귀 없음 확인.

## 품질 기준 (CLAUDE.md, 목표 ≥80/100)

- 예외 처리: 보고 경로 포함 모든 비동기/콜백 경로 가드.
- 민감정보 마스킹: `CrashReporter` 단일 통로에서 PII 부착 금지로 보장.
- DRY/매직넘버: 중앙 유틸로 중복 제거, 빌드 플래그로 상수화.
- 기존 컨벤션: 파일/패키지 구조·로깅 태그 관례 준수.
