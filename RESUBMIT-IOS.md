# 재심사 — Guideline 4 대응 build 1.0(9) 올리기

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

### 4) 아카이브 + 업로드
```bash
export DEVELOPMENT_TEAM=<10자 Team ID>
# 자동 업로드 시(선택):
# export ASC_API_KEY_ID=...  ASC_API_ISSUER_ID=...  ASC_API_KEY_PATH=~/AuthKey_XXXX.p8
bash scripts/ios-archive-upload.sh
```
- API 키 미설정 시: 스크립트가 `build/export/App.ipa`까지만 만든다 → **Apple Transporter 앱에 그 IPA 드래그**로 업로드.

---

## 업로드 후 (App Store Connect)

5. **TestFlight에서 빌드 9 처리 대기** (약 5~15분).
6. **배포 → iOS 앱 1.0 → 빌드 `1.0 (9)` 선택** → "앱 심사에 다시 제출" 버튼 활성화(IAP도 함께 묶임) → **제출**.

---

## 체크 포인트

- 코드 변경 불필요(로그인 수정은 서버측 이미 반영) → **빌드번호만 올리면 끝**.
- 데모 계정(`play-review@anima-test.com`)·App Review 메모는 그대로 두면 됨.
- 재심사 시 리뷰어는 라이브 URL(이미 수정됨)을 다시 테스트하므로, Google 로그인 버튼이 iOS에서 안 보이는지만 확인되면 통과 조건 충족.
- 빌드/서명 에러 발생 시 로그 전문을 확보해 원인 진단.
