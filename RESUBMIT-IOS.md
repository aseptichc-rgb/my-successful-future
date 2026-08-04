# 재심사 — Guideline 4 대응 build 1.0(9) 올리기

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
$env:ASC_API_KEY_PATH = "C:\keys\AuthKey_8ZJ3Y6N6J7.p8"

# 2) 상태 점검 (아무것도 바꾸지 않음) — 빌드 목록·버전 상태·실행 계획만 출력
npm run ios:submit

# 3) 실제 심사 제출
node scripts/ios-appstore-submit.mjs --submit
#   편집 가능한 버전이 없으면(직전 버전이 이미 판매중) 새 버전 번호를 명시:
node scripts/ios-appstore-submit.mjs --submit --version 1.0.1
```

스크립트([scripts/ios-appstore-submit.mjs](scripts/ios-appstore-submit.mjs))가 하는 일:
최신 VALID 빌드 선택 → 앱 버전에 연결 → 대기 중인 인앱결제(`anima_lifetime` 등)를 같은
심사 요청에 묶음 → `reviewSubmissions.submitted = true`. `--build` 로 특정 빌드,
`--no-iap` 로 인앱결제 제외 가능.

> 키 ID/Issuer ID 는 기본값이 박혀 있고 비밀은 `.p8` 파일뿐이다. `.p8` 은 저장소에 커밋하지 말 것.

---

## 체크 포인트

- 코드 변경 불필요(로그인 수정은 서버측 이미 반영) → **빌드번호만 올리면 끝**.
- 데모 계정(`play-review@anima-test.com`)·App Review 메모는 그대로 두면 됨.
- 재심사 시 리뷰어는 라이브 URL(이미 수정됨)을 다시 테스트하므로, Google 로그인 버튼이 iOS에서 안 보이는지만 확인되면 통과 조건 충족.
- 빌드/서명 에러 발생 시 로그 전문을 확보해 원인 진단.
