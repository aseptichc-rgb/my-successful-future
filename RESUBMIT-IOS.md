# 재심사 — Guideline 4 대응 build 1.0(9) 올리기

> ## ✅ 현재 상태(2026-08-08): **1.0.2 (11) 심사 제출 완료** — INVALID_BINARY 해소
>
> Mac 에서 아래 [§ 1.0.2 INVALID_BINARY 복구](#102-invalid_binary-복구-2026-08-07-진단) 절차를 그대로
> 실행: `UPLOAD SUCCEEDED`(Delivery UUID `afa96583-5880-40cf-a796-0e15ac68e07d`) → TestFlight
> `1.0.2 (11) VALID` → `--submit --cancel-stuck-submission` 으로 심사 대기열 진입.
> 스토어 문구 4개 로케일(설명·키워드·릴리스 노트)도 같은 심사에 묶였다.
> 실행 중 겪은 409 경합은 [§ 실행 기록](#실행-기록-2026-08-08-mac) 참고.
>
> <details><summary>이전 상태(2026-08-07): 1.0.2 가 <code>INVALID_BINARY</code></summary>
>
> 2026-08-06 20:44(KST) 제출한 1.0.2 가 Apple 사후 검증에서 "잘못된 바이너리"로 반려됐다.
> 조치 절차는 아래 § 1.0.2 INVALID_BINARY 복구 참고.
> </details>
>
> **상태(2026-07-28): build 1.0(9) 업로드 완료** — 위젯 수동 서명 경로로 archive→export→altool 성공.
> ASC TestFlight 처리 후 §5~6 대로 "앱 심사에 다시 제출" 하면 됨. 아래는 그 재현 절차.
>
> Mac 빌드 시 참고용. App Store 거절(Guideline 4 — Design) 대응 후 **정식 재제출**을 위한 절차다.
> 전체 iOS 셋업은 [README-IOS.md](README-IOS.md) 참고. 이 문서는 "이미 build 8까지 올린 상태에서
> Guideline 4 수정본을 재심사에 넣는" 최소 절차만 담는다.

---

## 배경 (왜 새 빌드가 필요한가)

- **거절 사유**: Guideline 4 (Design) — iOS에서 로그인/가입 시 Google 로그인이 **기본 브라우저(Safari)로 튕겨나감**.
  - 원인: WKWebView 안의 웹 `signInWithPopup(google)`을 Google이 임베디드 웹뷰라 차단 → Capacitor가 외부 브라우저로 엶.
- **수정 (완료)**: 커밋 `7901537` — iOS 앱에서 Google 버튼을 `<WebOnly>`([components/landing/PlatformGate.tsx])로 감싸 숨김. iOS엔 Apple(네이티브)·이메일 로그인만 남아 외부 브라우저 경로가 사라짐. 웹·안드로이드는 그대로 노출.
- **중요**: `server.url` 모드라 이 수정은 **Vercel 배포만으로 이미 라이브**다. 즉 **네이티브 코드 변경은 전혀 없다** — build 9는 "build 8 + 빌드번호만 9".
- **왜 그래도 새 빌드가 필요한가**: App Store Connect의 "앱 심사에 다시 제출" 버튼이 비활성. 앱 버전 1.0(8)은 "심사 준비됨"이나, 거절된 IAP `anima_lifetime`(첫 IAP는 새 앱 버전과 함께만 제출 가능)이 미해결로 남아 막고 있음. 리뷰어 회신도 "resubmit the app". → **새 빌드 1.0(9)로 IAP까지 묶어 정식 재제출**해야 함.

---

## Mac에서 (순서대로)

### 1) 최신 코드 반영
```bash
cd my-successful-future
git pull            # 로그인 수정 커밋(7901537) 포함
npm install
```

### 2) iOS 프로젝트 준비
- **build 8을 만든 그 Mac이면 (권장)**: `ios/`가 이미 있고 Sign in with Apple·위젯·StoreKit·서명이 다 돼 있음 → 3번으로.
- **새/다른 Mac이면**: `ios/`는 gitignore(.gitignore) 대상이라 저장소에 없음 → [README-IOS.md](README-IOS.md) §1~5 재구성 필요(`npx cap add ios` → GoogleService-Info.plist·Capability·위젯·서명). 수 시간 소요이므로 가능하면 build 8 Mac 사용.

### 3) 빌드 번호 8 → 9
```bash
cd ios/App && xcrun agvtool new-version -all 9 && cd ../..
```
또는 Xcode에서 Target **App** → General → Build = **9**.

### 4) 아카이브 + 업로드 (위젯 = **수동 서명** 경로)

> ⚠️ `scripts/ios-archive-upload.sh` 는 **자동 서명**을 강제해 쓰지 말 것. 위젯(AnimaWidget)
> 타깃이 생긴 뒤로 자동 서명은 "no devices" 로 막히고, pbxproj 는 이미 두 타깃 **수동 서명**
> (프로파일 `Anima AppStore Main 2` / `AnimaWidget AppStore`)으로 세팅돼 있다. 아래 경로를 쓴다.

```bash
# 0) 서명 키체인 잠금해제 (배포 인증서는 anima-build 키체인, 암호 anima)
security unlock-keychain -p anima ~/Library/Keychains/anima-build.keychain-db
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k anima \
  ~/Library/Keychains/anima-build.keychain-db

# 1) Archive (수동 서명 — pbxproj 값 그대로 사용, 인증 인자 불필요)
xcodebuild -scheme App -project ios/App/App.xcodeproj -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/Anima.xcarchive \
  CODE_SIGN_STYLE=Manual archive

# 2) Export IPA (두 프로파일 매핑한 위젯용 ExportOptions)
xcodebuild -exportArchive -archivePath build/Anima.xcarchive \
  -exportPath build/export -exportOptionsPlist scripts/ExportOptions-widget.plist

# 3) 업로드 (altool, ASC API 키 — .p8 는 ~/.appstoreconnect/private_keys/)
xcrun altool --upload-app -f build/export/App.ipa -t ios \
  --apiKey 8ZJ3Y6N6J7 --apiIssuer daa5537d-77cb-44e3-904f-6df67f61ffde
```
- `UPLOAD SUCCEEDED with no errors` 가 뜨면 완료. App Store Connect > TestFlight 에서 5~15분 뒤 처리됨.
- 대안: API 키 없이 하려면 **Apple Transporter 앱에 `build/export/App.ipa` 드래그**.

---

## 업로드 후 (App Store Connect)

5. **TestFlight에서 빌드 9 처리 대기** (약 5~15분).
6. **배포 → iOS 앱 1.0 → 빌드 `1.0 (9)` 선택** → "앱 심사에 다시 제출" 버튼 활성화(IAP도 함께 묶임) → **제출**.

---

## TestFlight 빌드 → 정식 앱스토어 승격 (Windows 에서 가능)

이미 TestFlight 에 올라간 빌드를 정식 출시로 넘기는 건 **아카이브·서명이 필요 없다** —
App Store Connect 쪽 조작뿐이라 Mac 없이 API 로 끝난다. 웹 변경은 `server.url` 모드라
Vercel 배포 시점에 이미 라이브이므로 **새 빌드를 만들 필요도 없다**.

```powershell
# 1) ASC API 키(.p8) 경로 지정 — App Store Connect > 사용자 및 액세스 > 통합 에서 App Manager 키 발급
$env:ASC_API_KEY_PATH = "C:\Users\kjykj\OneDrive\IDEA\anima\AuthKey_8ZJ3Y6N6J7.p8"

# 2) 상태 점검 (아무것도 바꾸지 않음) — 빌드 목록·버전 상태·실행 계획만 출력
npm run ios:submit

# 3) 실제 심사 제출 (직전 버전이 이미 출시중이면 새 버전 번호 + 릴리스 노트가 필수)
node scripts/ios-appstore-submit.mjs --submit --version 1.0.1 --whats-new "..." --release-type auto
```

실제 실행 기록(2026-08-04): 위 명령으로 **1.0.1 / build 10 을 심사 제출 완료** —
`WAITING_FOR_REVIEW`, 승인 즉시 자동 출시(AFTER_APPROVAL). 1.0(build 9)은 이미 출시중이었고
`anima_lifetime` IAP 도 APPROVED 라 더 묶을 항목은 없었다.

### 실행하며 알게 된 함정

- **JWT 유효기간을 정확히 1200초(20분)로 두면 `NOT_AUTHORIZED` 로 거절된다.** Apple 문서의
  "최대 20분"은 경계값을 포함하지 않는다. 900초로 두면 통과. 401 이 뜨면 키를 의심하기 전에
  이걸 먼저 볼 것.
- `fields[builds]` 를 지정할 때 `preReleaseVersion` 을 빼면 **관계 자체가 응답에서 사라져**
  마케팅 버전을 못 읽는다.
- `READY_FOR_DISTRIBUTION` 은 "심사 중"이 아니라 **"이미 출시돼 살아 있음"**이다.
  여기에 새 빌드를 얹으려면 반드시 새 버전 번호를 만들어야 한다.
- 업데이트 버전은 **릴리스 노트가 비어 있으면 제출이 거부된다.** 첫 출시(1.0)에는 없어도 됐다.
- **"새 빌드 없이" 문구(설명·키워드)만 심사받는 길은 없다 (2026-08-06 실측).** 출시에 이미 쓰인
  빌드(1.0.1 의 build 10)는 새 버전에 연결하는 순간 409 로 거부되고, 출시된 적 없는 구 빌드
  (build 8)는 제출까지는 통과하지만 몇 분 뒤 사후 검증에서 `INVALID_BINARY` 로 반려된다.
  심사 없이 즉시 바뀌는 건 프로모션 텍스트뿐. `INVALID_BINARY` 는 편집 가능 상태라 스테이징한
  문구는 그대로 남으며, 마케팅 버전 1.0.2 새 빌드를 올린 뒤 `--submit` 하면 정상 진행된다.

스크립트([scripts/ios-appstore-submit.mjs](scripts/ios-appstore-submit.mjs))가 하는 일:
최신 VALID 빌드 선택 → 앱 버전에 연결 → 대기 중인 인앱결제(`anima_lifetime` 등)를 같은
심사 요청에 묶음 → `reviewSubmissions.submitted = true`. `--build` 로 특정 빌드,
`--no-iap` 로 인앱결제 제외 가능.

스토어 문구(설명·키워드·프로모션) 갱신은 [scripts/ios-update-metadata.mjs](scripts/ios-update-metadata.mjs):
설명·키워드는 출시된 버전에서 수정 불가라 편집용 새 버전을 만들어 스테이징하고, 심사 없이
반영되는 프로모션 텍스트만 라이브에 즉시 적용한다. 실행 기록(2026-08-06): **1.0.2 편집 버전
생성 + en-US·ko·es-ES·zh-Hans 4개 로케일 문구 스테이징 + 라이브 1.0.1 프로모션 텍스트 갱신 완료** —
1.0.2 빌드가 올라오면 `--submit` 으로 문구 변경이 함께 심사된다.

> 키 ID/Issuer ID 는 기본값이 박혀 있고 비밀은 `.p8` 파일뿐이다. `.p8` 은 저장소에 커밋하지 말 것.

---

## 1.0.2 `INVALID_BINARY` 복구 (2026-08-07 진단)

App Store Connect 화면의 **"1.0.2 잘못된 바이너리"** + 심사 제출 **"해결되지 않은 문제"** 의 실제 원인.

### 진단 결과 (ASC API 실측)

| 항목 | 값 |
|---|---|
| 앱 버전 1.0.2 | `INVALID_BINARY` — 연결된 빌드 **1.0 (8)** |
| 앱 버전 1.0.1 | `READY_FOR_DISTRIBUTION` — 빌드 **1.0.1 (10)** (출시중) |
| 심사 제출 `76679926…` | `UNRESOLVED_ISSUES`, 항목 `REJECTED` (2026-08-06 11:44 UTC) |
| TestFlight 최신 빌드 | `1.0.1 (10)` — **마케팅 버전 1.0.2 인 빌드는 존재하지 않음** |

**원인: 1.0.2 에 구 빌드 8 을 붙였고, 그 빌드가 두 규칙을 동시에 어긴다.**

1. **마케팅 버전 불일치** — 바이너리의 `CFBundleShortVersionString` 은 `1.0` 인데 앱스토어 버전은 `1.0.2`.
2. **빌드번호 역행** — 이미 출시된 1.0.1 이 build `10` 을 쓰는데 붙인 건 build `8`.

ASC API 는 이 제출을 **200 으로 통과시킨다.** Apple 사후 검증이 몇 분 뒤 조용히 반려하므로,
제출 시점에는 성공한 것처럼 보인다. 이건 위 "함정" 절의 마지막 항목이 실제로 터진 사례다.

### 살아남은 것 (다시 만들 필요 없음)

`INVALID_BINARY` 는 **편집 가능** 상태라 스테이징한 자산이 전부 그대로 남아 있다 — 실측 확인:

- 4개 로케일(`en-US`·`ko`·`es-ES`·`zh-Hans`) 의 설명·키워드·릴리스 노트·프로모션 텍스트
- 심사 정보(데모 계정 `play-review@anima-test.com`, App Review 메모)
- 앱 가격 **0.0 (무료)** — 무료 전환은 정상 반영됨
- 인앱결제 `anima_lifetime` = `APPROVED` (추가로 묶을 항목 없음)

### 복구 절차 — **Mac 필수** (Windows 에서는 API 로 해결 불가)

빌드 번호만 올린 새 바이너리가 반드시 필요하다. 위 §"Mac에서" 절차와 같되 **버전 값이 다르다**:

```bash
# 1) 마케팅 버전 1.0.2 + 빌드번호 11 (10 보다 커야 한다)
cd ios/App
xcrun agvtool new-marketing-version 1.0.2
xcrun agvtool new-version -all 11
cd ../..

# 2) 서명 키체인 잠금해제 → archive → export → 업로드 (위 §4 와 동일)
security unlock-keychain -p anima ~/Library/Keychains/anima-build.keychain-db
xcodebuild -scheme App -project ios/App/App.xcodeproj -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/Anima.xcarchive \
  CODE_SIGN_STYLE=Manual archive
xcodebuild -exportArchive -archivePath build/Anima.xcarchive \
  -exportPath build/export -exportOptionsPlist scripts/ExportOptions-widget.plist
xcrun altool --upload-app -f build/export/App.ipa -t ios \
  --apiKey 8ZJ3Y6N6J7 --apiIssuer daa5537d-77cb-44e3-904f-6df67f61ffde
```

TestFlight 에서 `1.0.2 (11)` 이 `VALID` 로 처리된 뒤(5~15분), Windows/Mac 어디서든:

```powershell
$env:ASC_API_KEY_PATH = "...\AuthKey_8ZJ3Y6N6J7.p8"

# 계획 확인 — 막혀 있는 심사 요청도 함께 알려준다
npm run ios:submit

# 재제출. 반려로 멈춰 선 심사 요청(UNRESOLVED_ISSUES)을 취소하고 새로 올린다
node scripts/ios-appstore-submit.mjs --submit --cancel-stuck-submission
```

`--whats-new` 는 생략해도 된다 — 4개 로케일 릴리스 노트가 이미 스테이징돼 있다.

### 실행 기록 (2026-08-08, Mac)

위 절차를 그대로 실행해 **1.0.2 (11) 업로드 성공**. 실측 메모:

- 웹 변경은 `server.url` 모드라 이미 라이브 → **네이티브 코드 변경 0**, 버전 값만 올렸다.
  `cap sync` 도 불필요(위젯/플러그인 변동 없음 — 괜히 돌리면 위젯 서명이 리셋된다).
- `agvtool new-marketing-version` 은 **Info.plist 만 고치고 pbxproj 의 `MARKETING_VERSION` 은
  건드리지 않는다.** 바이너리 자체는 Info.plist 리터럴을 쓰므로 업로드는 통과하지만,
  `scripts/ios-preflight.mjs` 는 pbxproj 를 읽어 옛 버전을 보고한다 → **pbxproj 4곳(App/위젯 ×
  Debug/Release)도 함께 1.0.2 로 맞출 것.**
- 아카이브/익스포트 산출물은 버전별 경로로 분리했다(`build/Anima-1.0.2.xcarchive`,
  `build/export-1.0.2`). 기존 `build/Anima.xcarchive` 를 덮어쓰면 실패 시 옛 IPA 를 올릴 위험이 있다.
- 아카이브 후 **업로드 전에** 앱·위젯 Info.plist 의 버전이 둘 다 `1.0.2 / 11` 인지 확인:
  `plutil -extract CFBundleVersion raw build/Anima-1.0.2.xcarchive/Products/Applications/App.app/Info.plist`
- `ios/` 는 gitignore 대상이라 **버전 상향은 커밋에 잡히지 않는다.** 다음 빌드 때 Mac 로컬
  pbxproj 가 이미 1.0.2/11 인 상태에서 시작한다는 뜻 — 새 빌드는 12 부터.

**제출까지 완료** — `--submit --cancel-stuck-submission` 으로 1.0.2 / build 11 심사 대기열 진입.
스토어 문구(4개 로케일 설명·키워드·릴리스 노트)도 이 심사에 함께 올라갔다.

#### 함정: 빌드 연결 직후 제출하면 409 가 난다

첫 `--submit` 이 마지막 단계에서 실패했다:

```
빌드 연결 완료: 1.0.2 ← build 11
멈춰 있던 심사 요청 취소: 76679926-…
REJECT: API POST /v1/reviewSubmissionItems → 409:
  appStoreVersions with id '889385315' is not in valid state.
```

원인은 **상태 전이 지연**이다. `INVALID_BINARY` 버전에 새 빌드를 붙이면 상태가
`PREPARE_FOR_SUBMISSION` 으로 돌아가는데, ASC 가 그걸 반영하기 전에 같은 실행 안에서
`reviewSubmissionItems` 를 POST 하면 아직 옛 상태로 보여 409 로 막힌다.

**대응: 그냥 다시 실행하면 된다.** 잠시 뒤 드라이런으로 `1.0.2 — PREPARE_FOR_SUBMISSION` 을
확인한 뒤 같은 명령을 재실행하니 통과했다. 이때 앞선 실행이 만들어 둔 미제출 심사 요청을
스크립트가 재사용하므로(`기존 미제출 심사 요청 재사용: 8e466537-…`) 중복 제출은 생기지 않는다.
409 를 보고 빌드를 다시 만들 필요는 전혀 없다.

### 재발 방지 (스크립트에 반영 완료)

`scripts/ios-appstore-submit.mjs` 가 제출 **전에** 아래를 검사하고, 걸리면 `REJECT` 로 중단한다:

- 빌드의 마케팅 버전 ≠ 대상 앱스토어 버전 → 중단
- 빌드번호 ≤ 이미 출시된 최대 빌드번호 → 중단
- `UNRESOLVED_ISSUES` 심사 요청이 남아 있음 → 중단(`--cancel-stuck-submission` 으로만 취소)

회귀 테스트는 [scripts/ios-appstore-submit.test.mjs](scripts/ios-appstore-submit.test.mjs) — 이번 사고
조합(1.0.2 ← build 8/마케팅 1.0)을 그대로 재현해 막히는지 검증한다. `npm test` 로 실행.

---

## 체크 포인트

- 코드 변경 불필요(로그인 수정은 서버측 이미 반영) → **빌드번호만 올리면 끝**.
- 데모 계정(`play-review@anima-test.com`)·App Review 메모는 그대로 두면 됨.
- 재심사 시 리뷰어는 라이브 URL(이미 수정됨)을 다시 테스트하므로, Google 로그인 버튼이 iOS에서 안 보이는지만 확인되면 통과 조건 충족.
- 빌드/서명 에러 발생 시 로그 전문을 확보해 원인 진단.
