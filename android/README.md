# Anima — Android 앱 (위젯 중심)

매일 바뀌는 동기부여 카드(개인화 한 마디) + 큐레이션 명언을 홈/잠금화면 위젯으로 띄우는 안드로이드 앱.
앱 자체는 위젯 컨트롤 패널 + 미리보기 + 로그인이고, "Anima 열기" 버튼으로 기존 Anima 웹앱(페르소나 채팅·데일리 리추얼 등) 으로 이동한다.

## 1. 사전 준비

### 1-1. Android Studio
- **Android Studio Hedgehog (2023.1.1) 이상**, 또는 최신 Stable.
- JDK 17 (Android Studio 가 번들로 제공).

### 1-2. Firebase 프로젝트
이 앱은 **Anima 웹앱과 같은 Firebase 프로젝트** 를 공유합니다 (같은 사용자 계정 / Firestore).
- Firebase Console → 본인 Anima 프로젝트 → "Android 앱 추가"
- 패키지명: `com.michaelkim.anima`
- SHA-1 fingerprint 등록 (debug 용은 아래 명령으로 추출):
  ```powershell
  & "$env:JAVA_HOME\bin\keytool.exe" -list -v -keystore $env:USERPROFILE\.android\debug.keystore -alias androiddebugkey -storepass android -keypass android
  ```
- 생성된 `google-services.json` 을 `android/app/google-services.json` 으로 저장 (`.gitignore` 됨).

### 1-3. Google Sign-In
- Firebase Console → Authentication → Sign-in method → **Google 활성화**.
- 같은 화면 하단 "웹 SDK 구성" 에서 **웹 클라이언트 ID** 복사.
- `android/local.properties` 에 `ANIMA_GOOGLE_WEB_CLIENT_ID=<웹 클라이언트 ID>` 입력.

### 1-4. 백엔드 URL
- 같은 `local.properties` 에 `ANIMA_API_BASE_URL=https://<deployed-anima>.vercel.app` 입력.
- 로컬 dev 서버를 에뮬레이터에서 부르려면 `http://10.0.2.2:3000` 사용.
- `local.properties.example` 파일을 복사해서 시작.

## 2. 빌드 / 실행

```powershell
# 1) Android Studio 에서 android/ 폴더를 열기 (Open an existing project)
#    Gradle sync 가 자동으로 실행됨.

# 2) CLI 로 디버그 APK 빌드 (선택)
cd android
.\gradlew.bat :app:assembleDebug

# 3) 연결된 기기/에뮬레이터에 설치
.\gradlew.bat :app:installDebug
```

> **gradlew/gradlew.bat 은 Android Studio 가 처음 sync 할 때 자동 생성**됩니다.
> CLI 만으로 시작하려면 한 번 `gradle wrapper --gradle-version 8.10.2` 실행.

## 3. 위젯 추가

1. 빌드된 앱을 한 번 실행 → Google 로그인.
2. 홈 화면 빈 곳을 길게 누름 → "위젯" → **Anima 오늘의 한 마디** 선택.
3. 사이즈 (small / medium / large) 중 선택해서 추가.

## 4. 백엔드 (Next.js) 측 준비

1. Firestore 보안 규칙 배포: `firebase deploy --only firestore:rules`
2. 큐레이션 명언 시드 적재:
   - 웹앱 로그인 후 `/admin/quotes` 진입 → "코드 시드 → Firestore 동기화" 버튼 클릭.
   - 또는 직접 API 호출:
     ```bash
     curl -X POST https://<anima>.vercel.app/api/admin/seed-famous-quotes \
       -H "Authorization: Bearer <ID_TOKEN>"
     ```
3. `ADMIN_EMAILS` 환경변수에 본인 Google 계정 이메일이 들어 있어야 어드민 라우트 통과.

## 5. 아키텍처 한눈에

```
[Anima Web (Next.js, Firestore)]
          │  GET /api/widget/today  (Bearer <Firebase ID Token>)
          ▼
[Android — WorkManager (3시간 주기)]
          │  refresh() — Retrofit
          ▼
[QuoteCache — DataStore Preferences]
          │  observe()
          ▼
[QuoteWidget (Glance) + HomeScreen (Compose)]
```

- `slots[0]` = 오늘의 동기부여 카드 (사용자 목표/미래자아 기반 AI 한 마디).
- `slots[1..7]` = `famousQuotes` 컬렉션에서 결정론적으로 7개 회전.
- `currentSlotIndex` 는 서버가 KST 3시간 슬롯 기준으로 계산해 알려줌.

## 6. 배포 (내부 테스트 트랙)

1. `release` keystore 생성 (`keystore.properties` 에 비밀번호 — `.gitignore` 됨).
2. `app/build.gradle.kts` 에 `signingConfigs` 추가 (현재는 미설정 — 배포 단계에서 추가).
3. `.\gradlew.bat :app:bundleRelease` → `app/build/outputs/bundle/release/app-release.aab`.
4. Play Console "내부 테스트" 트랙 업로드.

## 7. 알려진 제약

- 일부 제조사(삼성/샤오미) 절전 모드는 WorkManager 를 죽일 수 있음 → 배터리 최적화 예외 처리 필요. (TODO: 첫 실행 안내 화면)
- 잠금화면 위젯 노출 여부는 OS/제조사가 최종 결정 (`widgetCategory="keyguard"` 명시했지만 보장 X).
- Glance 위젯은 RemoteViews 기반 — 복잡한 레이아웃·이미지·애니메이션 사용 금지.
