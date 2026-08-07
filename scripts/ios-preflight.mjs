/**
 * iOS 빌드/제출 전 체크리스트 — `npm run ios:*` 앞에 자동으로 붙는다(package.json 의 pre 훅).
 *
 * 목적은 딱 하나: **RESUBMIT-IOS.md 를 안 보고 빌드해서 같은 사고를 반복하지 않게 하는 것.**
 * 2026-08-06 에 마케팅 버전이 안 맞는 구 빌드를 붙여 제출했다가 Apple 사후 검증에서
 * INVALID_BINARY("잘못된 바이너리")로 반려된 적이 있다. ASC API 는 그 제출을 막아주지 않는다.
 *
 * 절대 빌드를 막지 않는다(항상 exit 0). 게이트가 아니라 알림이므로, 읽다가 실패해도 조용히 넘어간다.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PBXPROJ = join(ROOT, "ios", "App", "App.xcodeproj", "project.pbxproj");
const DOC = "RESUBMIT-IOS.md";
const RULE = "─".repeat(78);

const log = (msg = "") => console.log(msg);

/**
 * pbxproj 에서 설정값을 읽는다. 타깃마다 값이 달라 중복이 나오므로 고유값만 모은다.
 * @returns {string[]} 발견된 값들 (없으면 빈 배열)
 */
export function readBuildSetting(source, key) {
  const matches = source.matchAll(new RegExp(`^\\s*${key}\\s*=\\s*([^;]+);`, "gm"));
  return [...new Set([...matches].map((m) => m[1].trim().replace(/^"|"$/g, "")))];
}

function reportCurrentVersions() {
  if (!existsSync(PBXPROJ)) {
    log("  현재 값: ios/ 디렉터리가 없습니다 (Windows 이거나 `npx cap add ios` 전).");
    return;
  }
  try {
    const src = readFileSync(PBXPROJ, "utf8");
    const marketing = readBuildSetting(src, "MARKETING_VERSION");
    const build = readBuildSetting(src, "CURRENT_PROJECT_VERSION");
    log(`  현재 값: MARKETING_VERSION = ${marketing.join(", ") || "(못 읽음)"}`);
    log(`           CURRENT_PROJECT_VERSION = ${build.join(", ") || "(못 읽음)"}`);
  } catch (e) {
    log(`  현재 값: pbxproj 를 읽지 못했습니다 (${e.message}) — 무시하고 진행합니다.`);
  }
}

function printChecklist() {
  log(RULE);
  log("iOS 빌드 전 필독 — 앱스토어 반려를 부르는 실수 두 가지");
  log(RULE);
  log(`▶ 반드시 ${DOC} 를 먼저 읽으세요. 특히 "1.0.2 INVALID_BINARY 복구" 절.`);
  log("");
  log('Apple 사후 검증이 아래를 어기면 INVALID_BINARY("잘못된 바이너리")로 반려합니다.');
  log("ASC API 는 제출을 200 으로 통과시키므로 제출 시점엔 성공한 것처럼 보입니다.");
  log("");
  log("  1. MARKETING_VERSION 은 App Store Connect 의 앱 버전과 정확히 같아야 한다.");
  log("     (예: 앱스토어 버전이 1.0.2 면 바이너리도 1.0.2 — 1.0 이면 반려)");
  log("  2. CURRENT_PROJECT_VERSION 은 이미 출시된 최대 빌드번호보다 커야 한다.");
  log("     (예: 1.0.1 이 build 10 으로 출시중이면 11 이상)");
  log("");
  reportCurrentVersions();
  log("");
  log("  버전 올리기:  cd ios/App \\");
  log("                && xcrun agvtool new-marketing-version <앱스토어 버전> \\");
  log("                && xcrun agvtool new-version -all <빌드번호>");
  log("");
  log("  제출 시:      node scripts/ios-appstore-submit.mjs        # 계획 확인(dry-run)");
  log("                node scripts/ios-appstore-submit.mjs --submit");
  log("                (위 두 규칙은 제출 스크립트가 다시 한 번 검사해 막습니다)");
  log(RULE);
}

// 단위 테스트가 readBuildSetting 만 import 할 수 있도록, 직접 실행일 때만 출력한다.
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) printChecklist();
