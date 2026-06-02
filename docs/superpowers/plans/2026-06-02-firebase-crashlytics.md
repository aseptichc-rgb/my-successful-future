# Firebase Crashlytics 구현 계획 (안드로이드)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 안드로이드 네이티브 앱에 Firebase Crashlytics를 도입해, 출시 기기에서 발생하는 크래시와 "조용히 삼켜지던" 비치명적 오류를 사후 추적한다.

**Architecture:** 이미 연동된 Firebase(BOM 33.7.0)에 Crashlytics 플러그인+의존성만 추가해 자동 크래시 수집을 켠다. `CrashReporter` 단일 유틸로 비치명적 보고를 통일(DRY + PII 마스킹 단일 통로)하고, 워커·브릿지·스케줄링의 최상위/예상外 catch 8곳에만 배선한다. 디버그 빌드는 수집을 끈다.

**Tech Stack:** Kotlin, Firebase Crashlytics, Gradle (Kotlin DSL, version catalog), WorkManager.

**Spec:** `docs/superpowers/specs/2026-06-02-firebase-crashlytics-design.md`

---

## File Structure

- 수정 `android/gradle/libs.versions.toml` — 플러그인/라이브러리 카탈로그 항목 추가
- 수정 `android/build.gradle.kts` — 루트 플러그인 `apply false`
- 수정 `android/app/build.gradle.kts` — 플러그인 적용 + 의존성
- 생성 `android/app/src/main/java/com/michaelkim/anima/util/CrashReporter.kt` — 비치명적 보고 단일 통로
- 수정 `android/app/src/main/java/com/michaelkim/anima/AnimaApplication.kt` — 디버그 수집 비활성 + 1곳 배선
- 수정 워커/브릿지 7파일 — recordException 배선
- 수정 `scripts/play-data-safety.md` — 크래시 로그 수집 명시
- 수정 `app/privacy/page.tsx` — 진단/크래시 데이터 고지 + 날짜 갱신

비치명적 배선 대상 8곳 (최상위/예상外 실패만):
`AnimaApplication.kt:55`, `AffirmationsReminderWorker.kt:42`, `WinsReminderWorker.kt:43`, `QuoteRefreshWorker.kt:48`, `SignOutBridgeActivity.kt:55`, `WidgetRefreshBridgeActivity.kt:60`, `AuthBridgeActivity.kt:108`, `MainActivity.kt:311`.

명시적 제외(노이즈 방지): WidgetUi 파싱 폴백, MainActivity URI/TWA 폴백, QuoteWidget/Midnight 내부 네트워크 재시도, QuoteRepository 토큰 구제 흐름, ApiClient 토큰 부재, AuthBridge/HomeScreen 내부 폴백 — 모두 예상된 오프라인/제어 흐름.

---

### Task 1: Gradle 연동

**Files:** 수정 `android/gradle/libs.versions.toml`, `android/build.gradle.kts`, `android/app/build.gradle.kts`

- [ ] **Step 1:** `libs.versions.toml` `[versions]`에 추가: `firebaseCrashlyticsPlugin = "3.0.2"`
- [ ] **Step 2:** `[libraries]`에 추가: `firebase-crashlytics-ktx = { module = "com.google.firebase:firebase-crashlytics-ktx" }` (버전은 BOM 관리)
- [ ] **Step 3:** `[plugins]`에 추가: `firebase-crashlytics = { id = "com.google.firebase.crashlytics", version.ref = "firebaseCrashlyticsPlugin" }`
- [ ] **Step 4:** `android/build.gradle.kts` plugins 블록에 `alias(libs.plugins.firebase.crashlytics) apply false`
- [ ] **Step 5:** `android/app/build.gradle.kts` plugins 블록에 `alias(libs.plugins.firebase.crashlytics)`; Firebase dependencies에 `implementation(libs.firebase.crashlytics.ktx)`
- [ ] **Step 6:** 커밋 — `chore(android): add Firebase Crashlytics gradle wiring`

### Task 2: CrashReporter 유틸

**Files:** 생성 `android/app/src/main/java/com/michaelkim/anima/util/CrashReporter.kt`

- [ ] **Step 1:** 아래 내용으로 생성

```kotlin
package com.michaelkim.anima.util

import android.util.Log
import com.google.firebase.crashlytics.FirebaseCrashlytics

/**
 * 비치명적 오류 보고 단일 통로.
 *
 * - 기존처럼 Logcat 에 남기고(Log.w), 더해 Crashlytics 에 비치명적 예외로 보고한다.
 * - PII 부착 금지: message 에 이메일/토큰/사용자 본문(다짐·잘한 일/10년 후의 나)을 넣지 말 것.
 *   화면·작업 식별용 짧은 메시지만 받는다.
 * - 보고 경로 자체가 절대 던지지 않도록 가드 — 오류 보고가 앱을 죽이면 안 된다.
 */
object CrashReporter {
    fun record(tag: String, message: String, throwable: Throwable) {
        Log.w(tag, message, throwable)
        try {
            FirebaseCrashlytics.getInstance().apply {
                log("[$tag] $message")
                recordException(throwable)
            }
        } catch (_: Throwable) {
            // Crashlytics 미초기화/수집 비활성 등 — 무시.
        }
    }
}
```

- [ ] **Step 2:** 커밋 — `feat(android): add CrashReporter single-channel non-fatal reporter`

### Task 3: AnimaApplication — 디버그 수집 비활성 + 배선

**Files:** 수정 `android/app/src/main/java/com/michaelkim/anima/AnimaApplication.kt`

- [ ] **Step 1:** import 추가: `com.google.firebase.crashlytics.FirebaseCrashlytics`, `com.michaelkim.anima.BuildConfig`, `com.michaelkim.anima.util.CrashReporter`
- [ ] **Step 2:** `onCreate()` 최상단(super.onCreate() 직후)에 추가:

```kotlin
        // 디버그 빌드는 Crashlytics 전송 끔 — 릴리스에서만 수집.
        FirebaseCrashlytics.getInstance().isCrashlyticsCollectionEnabled = !BuildConfig.DEBUG
```

- [ ] **Step 3:** ForegroundWidgetRefresher의 `Log.w(TAG, "ON_START widget refresh enqueue 실패", e)` →
  `CrashReporter.record(TAG, "ON_START widget refresh enqueue 실패", e)`
- [ ] **Step 4:** 커밋 — `feat(android): disable Crashlytics collection in debug + wire app bootstrap`

### Task 4: 워커 3곳 배선

**Files:** 수정 `AffirmationsReminderWorker.kt:42`, `WinsReminderWorker.kt:43`, `QuoteRefreshWorker.kt:48`

- [ ] **Step 1:** `WinsReminderWorker` top-level `catch (e: Exception)` 블록에 첫 줄로 추가:
  `CrashReporter.record(TAG, "잘한 일 알림 처리 실패", e)` — 재예약 폴백 로직은 유지. 동반 `import com.michaelkim.anima.util.CrashReporter` + companion에 `private const val TAG = "WinsReminderWorker"` (없으면 추가).
- [ ] **Step 2:** `AffirmationsReminderWorker` 동일 패턴: `CrashReporter.record(TAG, "다짐 알림 처리 실패", e)` + import + TAG 상수.
- [ ] **Step 3:** `QuoteRefreshWorker`의 마지막 `catch (e: Exception)` (IOException 별도 처리 뒤, 영구 401/403):
  `CrashReporter.record(TAG, "위젯 refresh 구제 후에도 실패", e)` 추가 후 `Result.success()` 유지. import + `private const val TAG = "QuoteRefreshWorker"` 추가. (IOException catch는 손대지 않음 — 오프라인 재시도는 정상.)
- [ ] **Step 4:** 커밋 — `feat(android): report worker top-level failures to Crashlytics`

### Task 5: 브릿지/액티비티 4곳 배선

**Files:** 수정 `SignOutBridgeActivity.kt:55`, `WidgetRefreshBridgeActivity.kt:60`, `AuthBridgeActivity.kt:108`, `MainActivity.kt:311`

- [ ] **Step 1:** `SignOutBridgeActivity`: `Log.w(TAG, "웹 로그아웃 브릿지 처리 실패", e)` → `CrashReporter.record(TAG, "웹 로그아웃 브릿지 처리 실패", e)` + import.
- [ ] **Step 2:** `WidgetRefreshBridgeActivity`: `Log.w(TAG, "OneTime Worker enqueue 실패 — 동기 시도만 진행", e)` → `CrashReporter.record(...)` + import.
- [ ] **Step 3:** `AuthBridgeActivity` top-level(108): `Log.w(TAG, "네이티브 브릿지 signInWithCustomToken 실패", e)` → `CrashReporter.record(...)` + import. (내부 78/91/100 폴백은 제외.)
- [ ] **Step 4:** `MainActivity` onResume(311): `Log.w(TAG, "onResume widget refresh enqueue 실패", e)` → `CrashReporter.record(...)` + import. (150/164/192/258/275/282/289은 제외.)
- [ ] **Step 5:** 커밋 — `feat(android): report bridge/activity top-level failures to Crashlytics`

### Task 6: 정책 고지 갱신

**Files:** 수정 `scripts/play-data-safety.md:67`, `app/privacy/page.tsx`

- [ ] **Step 1:** `play-data-safety.md` 67행을:
  `| Crash logs | ✅ | ❌ | App functionality, 안정성 진단 (Firebase Crashlytics, 신원 비연결) |` 로 변경.
- [ ] **Step 2:** `privacy/page.tsx` Section 2 `<ul>`에 새 `<li>` 추가:
  `Crash & diagnostics: when the app crashes or hits an unexpected error, technical diagnostics (stack trace, device model, OS version, app version) are sent to Firebase Crashlytics to fix bugs. These are not linked to your identity and contain no profile content.`
- [ ] **Step 3:** Section 4 처리 파트너 `<ul>`에 `<li>Firebase Crashlytics (crash &amp; error diagnostics)</li>` 추가.
- [ ] **Step 4:** `LAST_UPDATED`를 `"2026-06-02"`로 변경.
- [ ] **Step 5:** 커밋 — `docs(privacy): disclose Crashlytics crash/diagnostics collection`

### Task 7: 빌드 검증

- [ ] **Step 1:** `android/gradlew` 존재 시 `./gradlew :app:compileDebugKotlin` (또는 `assembleDebug`)로 컴파일 확인. SDK/gradle 미가용이면 사용자에게 Android Studio 빌드 요청.
- [ ] **Step 2:** 릴리스 연동 확인(선택): 임시로 `isCrashlyticsCollectionEnabled = true` + 강제 테스트 예외 1건 → Crashlytics 콘솔 도착 확인 → 원복.
- [ ] **Step 3:** 모든 Node.js 프로세스 종료, 변경 전부 커밋, `git status` clean 확인 후 푸시(사용자 지시 시).

---

## 품질 기준 (CLAUDE.md ≥80/100)
- 예외 처리: CrashReporter 내부 가드로 보고 경로도 안전.
- PII 마스킹: 단일 통로에서 사용자 본문/이메일/토큰 부착 금지.
- DRY/매직넘버: 중앙 유틸, BuildConfig.DEBUG 플래그로 제어.
- 컨벤션: 기존 패키지/로깅 태그/주석 스타일 준수.
