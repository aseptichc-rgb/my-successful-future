#!/usr/bin/env bash
#
# Anima iOS — Archive → IPA export → TestFlight(App Store Connect) 업로드 자동화.
#
# 사전 조건:
#   1) Xcode 정식 설치 + iOS 플랫폼 다운로드 완료
#   2) Xcode > Settings > Accounts 에 Apple Developer 계정 로그인 (자동 서명 인증서 생성)
#   3) (업로드 시) App Store Connect API 키 .p8 + Key ID + Issuer ID
#        - https://appstoreconnect.apple.com/access/integrations/api 에서 발급
#        - 또는 ASC_API_KEY_PATH 미설정 시: 아카이브/내보내기까지만 하고 업로드는 수동
#
# 사용법:
#   export DEVELOPMENT_TEAM=XXXXXXXXXX           # 필수 (10자 Team ID)
#   export ASC_API_KEY_ID=XXXXXXXXXX             # 업로드용 (선택)
#   export ASC_API_ISSUER_ID=xxxx-xxxx-...       # 업로드용 (선택)
#   export ASC_API_KEY_PATH=~/AuthKey_XXXX.p8    # 업로드용 (선택)
#   bash scripts/ios-archive-upload.sh
#
# 결과물: build/Anima.xcarchive, build/export/App.ipa
#
set -euo pipefail

# ---- 매직 넘버/경로 상수 ----
readonly PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly IOS_APP_DIR="${PROJECT_DIR}/ios/App"
readonly BUILD_DIR="${PROJECT_DIR}/build"
readonly ARCHIVE_PATH="${BUILD_DIR}/Anima.xcarchive"
readonly EXPORT_DIR="${BUILD_DIR}/export"
readonly EXPORT_OPTIONS="${PROJECT_DIR}/scripts/ExportOptions.plist"
readonly SCHEME="App"

# ---- 샌드박스 환경에서 SPM 해석을 막는 GIT_CONFIG env 제거 ----
unset GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0 2>/dev/null || true

# ---- 필수 입력 검증 ----
if [[ -z "${DEVELOPMENT_TEAM:-}" ]]; then
  echo "REJECT: DEVELOPMENT_TEAM 환경변수가 필요합니다 (10자 Apple Team ID)." >&2
  echo "        Xcode > Settings > Accounts > 팀 선택 시 보이는 ID 또는" >&2
  echo "        https://developer.apple.com/account 우상단에서 확인." >&2
  exit 1
fi

mkdir -p "${BUILD_DIR}"

# ---- API 키가 있으면 xcodebuild 클라우드 서명 인증 인자를 구성 ----
#   (Xcode GUI 로그인 없이 인증서/프로파일을 자동 생성·갱신할 수 있게 한다)
AUTH_ARGS=()
HAVE_API_KEY=false
if [[ -n "${ASC_API_KEY_ID:-}" && -n "${ASC_API_ISSUER_ID:-}" && -n "${ASC_API_KEY_PATH:-}" ]]; then
  if [[ ! -f "${ASC_API_KEY_PATH}" ]]; then
    echo "REJECT: ASC_API_KEY_PATH 파일을 찾을 수 없습니다: ${ASC_API_KEY_PATH}" >&2
    exit 1
  fi
  HAVE_API_KEY=true
  AUTH_ARGS=(
    -authenticationKeyPath "${ASC_API_KEY_PATH}"
    -authenticationKeyID "${ASC_API_KEY_ID}"
    -authenticationKeyIssuerID "${ASC_API_ISSUER_ID}"
  )
  # altool 이 Key ID 로 .p8 를 찾는 표준 디렉터리에 키를 배치
  mkdir -p "${HOME}/.appstoreconnect/private_keys"
  cp -f "${ASC_API_KEY_PATH}" "${HOME}/.appstoreconnect/private_keys/AuthKey_${ASC_API_KEY_ID}.p8"
fi

# ---- ExportOptions.plist 동적 생성 (Team ID 주입) ----
cat > "${EXPORT_OPTIONS}" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store-connect</string>
    <key>destination</key>
    <string>export</string>
    <key>teamID</key>
    <string>${DEVELOPMENT_TEAM}</string>
    <key>signingStyle</key>
    <string>automatic</string>
    <key>uploadSymbols</key>
    <true/>
    <key>generateAppStoreInformation</key>
    <false/>
</dict>
</plist>
PLIST

# ---- [0/3] 앱 아이콘/스플래시 생성 (assets/icon-only.png → AppIcon.appiconset) ----
#   왜 필요한가: `npx cap add ios` 는 Capacitor 기본 placeholder 아이콘만 넣는다.
#   이 단계를 건너뛰면 빌드/홈 화면에 Anima 아이콘이 안 보이고 기본 아이콘만 뜬다.
#   거절 위험: 아이콘 누락/투명 알파는 App Store 심사에서 즉시 거절(아이콘 검정 렌더).
#   capacitor-assets 는 iOS 아이콘을 알파 없이 평탄화해 생성하므로 안전하다.
echo "==> [0/3] 앱 아이콘/스플래시 생성"
readonly ICON_SOURCE="${PROJECT_DIR}/assets/icon-only.png"
readonly CAP_ASSETS_BIN="${PROJECT_DIR}/node_modules/.bin/capacitor-assets"
if [[ ! -f "${ICON_SOURCE}" ]]; then
  echo "REJECT: 아이콘 소스가 없습니다: ${ICON_SOURCE} (1024x1024 PNG, 알파 없음)" >&2
  exit 1
fi
if [[ ! -x "${CAP_ASSETS_BIN}" ]]; then
  echo "REJECT: @capacitor/assets 미설치 — 먼저 'npm install' 을 실행하세요." >&2
  exit 1
fi
( cd "${PROJECT_DIR}" && "${CAP_ASSETS_BIN}" generate --ios )

echo "==> [1/3] Archive (Release, 자동 서명)"
xcodebuild -scheme "${SCHEME}" \
  -project "${IOS_APP_DIR}/App.xcodeproj" \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "${ARCHIVE_PATH}" \
  DEVELOPMENT_TEAM="${DEVELOPMENT_TEAM}" \
  CODE_SIGN_STYLE=Automatic \
  -allowProvisioningUpdates \
  ${AUTH_ARGS[@]+"${AUTH_ARGS[@]}"} \
  archive

echo "==> [2/3] Export IPA"
xcodebuild -exportArchive \
  -archivePath "${ARCHIVE_PATH}" \
  -exportPath "${EXPORT_DIR}" \
  -exportOptionsPlist "${EXPORT_OPTIONS}" \
  -allowProvisioningUpdates \
  ${AUTH_ARGS[@]+"${AUTH_ARGS[@]}"}

IPA_PATH="$(/usr/bin/find "${EXPORT_DIR}" -maxdepth 1 -name '*.ipa' | head -1)"
echo "    IPA: ${IPA_PATH}"

# ---- [3/3] 업로드: API 키가 있으면 자동, 없으면 안내 ----
if [[ -n "${ASC_API_KEY_ID:-}" && -n "${ASC_API_ISSUER_ID:-}" && -n "${ASC_API_KEY_PATH:-}" ]]; then
  echo "==> [3/3] TestFlight 업로드 (App Store Connect API 키)"
  xcrun altool --upload-app -f "${IPA_PATH}" -t ios \
    --apiKey "${ASC_API_KEY_ID}" \
    --apiIssuer "${ASC_API_ISSUER_ID}"
  echo "✅ 업로드 완료. App Store Connect > TestFlight 에서 처리(약 5~15분) 후 내부 테스터에 배포."
else
  echo "==> [3/3] 업로드 건너뜀 (ASC_API_* 미설정)"
  echo "    아래 중 하나로 업로드하세요:"
  echo "    A) Apple Transporter 앱에 ${IPA_PATH} 드래그"
  echo "    B) API 키 설정 후 재실행:"
  echo "       xcrun altool --upload-app -f \"${IPA_PATH}\" -t ios --apiKey KEYID --apiIssuer ISSUERID"
fi
