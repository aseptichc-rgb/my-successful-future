/**
 * App Store Connect — TestFlight 최신 빌드를 "정식 앱스토어" 심사에 제출한다.
 *
 * Mac/Xcode 없이 Windows 에서도 동작한다. 이미 TestFlight 에 올라간 빌드를 고르는 일이라
 * 아카이브·서명·업로드 단계가 필요 없기 때문이다. (server.url 모드라 웹 변경은 이미 라이브 —
 * 자세한 배경은 [RESUBMIT-IOS.md](../RESUBMIT-IOS.md) 참고.)
 *
 * 사용:
 *   node scripts/ios-appstore-submit.mjs                      # 상태 점검만 (기본, 아무것도 바꾸지 않음)
 *   node scripts/ios-appstore-submit.mjs --submit             # 편집 가능한 기존 버전에 빌드 붙이고 심사 제출
 *   node scripts/ios-appstore-submit.mjs --submit --version 1.0.1   # 새 앱 버전을 만들어 제출
 *   node scripts/ios-appstore-submit.mjs --submit --build 12  # 특정 빌드 번호 지정 (기본: 최신 VALID)
 *   node scripts/ios-appstore-submit.mjs --submit --no-iap    # 대기 중 인앱결제를 함께 묶지 않음
 *   node scripts/ios-appstore-submit.mjs --submit --cancel-stuck-submission
 *                                                             # 반려돼 "해결되지 않은 문제"로 멈춘 심사 요청을 취소하고 재제출
 *
 * 업데이트 버전(첫 출시가 아닌 경우)은 릴리스 노트가 필수다:
 *   node scripts/ios-appstore-submit.mjs --submit --version 1.0.1 --whats-new "..." --release-type auto
 *   --release-type auto(기본, 승인 즉시 출시) | manual(승인 후 수동 출시)
 *
 * 인증(App Store Connect API 키):
 *   ASC_API_KEY_PATH   (필수) AuthKey_XXXXXXXXXX.p8 파일 경로
 *   ASC_API_KEY_ID     (선택) 기본값 아래 DEFAULT_KEY_ID
 *   ASC_API_ISSUER_ID  (선택) 기본값 아래 DEFAULT_ISSUER_ID
 *
 * 필요 권한: 해당 API 키가 App Manager 이상이어야 한다. 403 이면 App Store Connect >
 * 사용자 및 액세스 > 통합 에서 키 역할을 올릴 것.
 */
import { readFileSync, existsSync } from "node:fs";
import { createSign } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// ─────────────────────────────── 상수 ───────────────────────────────
const API = "https://api.appstoreconnect.apple.com";
const BUNDLE_ID = "com.michaelkim.anima";
const PLATFORM = "IOS";

// RESUBMIT-IOS.md 에 기록된 배포용 키 식별자. 비밀은 .p8 파일뿐이라 식별자는 기본값으로 둔다.
const DEFAULT_KEY_ID = "8ZJ3Y6N6J7";
const DEFAULT_ISSUER_ID = "daa5537d-77cb-44e3-904f-6df67f61ffde";

// ASC 의 상한은 20분이지만 경계값(정확히 1200초)은 NOT_AUTHORIZED 로 거절된다 — 실측 확인.
// 서버와의 미세한 시계 차이도 흡수하도록 15분으로 여유를 둔다.
const JWT_TTL_SEC = 15 * 60;
const HTTP_TIMEOUT_MS = 60_000;
const BUILD_PAGE_LIMIT = 20;
const VERSION_PAGE_LIMIT = 10;
const NO_CONTENT = 204;

/** 빌드를 붙이고 심사에 넣을 수 있는 앱 버전 상태. */
const EDITABLE_VERSION_STATES = new Set([
  "PREPARE_FOR_SUBMISSION",
  "DEVELOPER_REJECTED",
  "REJECTED",
  "METADATA_REJECTED",
  "INVALID_BINARY",
]);

/** 이미 심사 파이프라인에 들어가 있어 재제출이 불필요한 상태. */
const IN_FLIGHT_VERSION_STATES = new Set([
  "READY_FOR_REVIEW",
  "WAITING_FOR_REVIEW",
  "IN_REVIEW",
  "PENDING_APPLE_RELEASE",
  "PENDING_DEVELOPER_RELEASE",
  "PROCESSING_FOR_DISTRIBUTION",
  "WAITING_FOR_EXPORT_COMPLIANCE",
]);

/**
 * 이미 출시가 끝난 상태. READY_FOR_DISTRIBUTION 은 "심사 중"이 아니라 "앱스토어에 살아 있음"이다 —
 * 여기에 새 빌드를 얹으려면 반드시 새 버전 번호를 만들어야 한다.
 */
const LIVE_VERSION_STATES = new Set([
  "READY_FOR_DISTRIBUTION",
  "ACCEPTED",
  "REPLACED_WITH_NEW_VERSION",
  "DEVELOPER_REMOVED_FROM_SALE",
]);

/** 이번 심사에 함께 묶어야 하는 인앱결제 상태 (첫 IAP 는 앱 버전과 같이 제출해야 통과된다). */
const IAP_NEEDS_SUBMISSION_STATES = new Set([
  "READY_TO_SUBMIT",
  "REJECTED",
  "DEVELOPER_ACTION_NEEDED",
]);

/** 마케팅 버전을 읽지 못했을 때 fetchBuilds 가 채우는 자리표시자. 이 값이면 검증을 건너뛴다. */
const UNKNOWN_MARKETING_VERSION = "?";

/** 아직 제출 버튼을 누르지 않은 심사 요청 — 그대로 이어서 쓴다. */
const REUSABLE_SUBMISSION_STATE = "READY_FOR_REVIEW";
/** 반려 후 개발자 조치를 기다리는 상태. 남아 있으면 새 심사 요청 생성이 막힌다. */
const STUCK_SUBMISSION_STATE = "UNRESOLVED_ISSUES";

const log = (msg) => console.log(`[ios-submit] ${msg}`);

// ─────────────────────── 제출 전 검증 (순수 함수) ───────────────────────

/**
 * "8" vs "10" 처럼 점으로 구분된 빌드번호를 자리별 숫자로 비교한다.
 * 문자열 비교로 두면 "8" > "10" 이 되어 빌드번호 역행을 놓친다.
 * @returns 음수 a<b / 0 a==b / 양수 a>b
 */
export function compareBuildNumbers(a, b) {
  const parts = (v) => String(v ?? "").split(".").map((n) => Number(n) || 0);
  const [pa, pb] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * 이 빌드를 이 앱 버전에 붙여도 되는지 검사한다.
 *
 * ASC API 는 규칙 위반 빌드도 200 으로 받아주고, Apple 사후 검증이 몇 분 뒤 조용히
 * INVALID_BINARY("잘못된 바이너리")로 반려한다 — 2026-08-06 실사고. API 가 안 막으므로
 * 여기서 막는다. 자세한 경위는 [RESUBMIT-IOS.md](../RESUBMIT-IOS.md) 참고.
 *
 * @param {{buildNumber: string, marketingVersion: string}} build 붙이려는 빌드
 * @param {string} versionString 대상 앱스토어 버전 (예: "1.0.2")
 * @param {string[]} releasedBuildNumbers 이미 출시된 버전들이 쓴 빌드번호
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function validateBuildForVersion({ build, versionString, releasedBuildNumbers = [] }) {
  const mv = build?.marketingVersion;

  // 1) 바이너리의 CFBundleShortVersionString 이 앱스토어 버전과 다르면 반려된다.
  //    조회 실패("?")로 막아 정상 제출까지 못 하게 되는 일은 피한다.
  if (mv && mv !== UNKNOWN_MARKETING_VERSION && mv !== versionString) {
    return {
      ok: false,
      reason:
        `빌드의 마케팅 버전(${mv})이 앱스토어 버전(${versionString})과 다릅니다. ` +
        `Apple 은 이 조합을 제출 직후 INVALID_BINARY 로 반려합니다 — ` +
        `Xcode 에서 MARKETING_VERSION 을 ${versionString} 로 올린 새 빌드가 필요합니다.`,
    };
  }

  // 2) 빌드번호는 이미 출시에 쓰인 것보다 반드시 커야 한다 (같으면 재사용이라 409).
  const highest = releasedBuildNumbers.reduce(
    (max, n) => (max === null || compareBuildNumbers(n, max) > 0 ? n : max),
    null,
  );
  if (highest !== null && compareBuildNumbers(build.buildNumber, highest) <= 0) {
    return {
      ok: false,
      reason:
        `빌드번호 ${build.buildNumber} 이(가) 이미 출시된 빌드 ${highest} 보다 크지 않습니다. ` +
        `빌드번호는 항상 증가해야 하며, 낮거나 같으면 INVALID_BINARY 로 반려됩니다.`,
    };
  }

  return { ok: true };
}

/** "1.0" → "1.0.1", "1.0.3" → "1.0.4". 제안용일 뿐 자동 적용하지 않는다. */
function suggestNextVersion(current) {
  if (!current) return "1.0.1";
  const parts = current.split(".").map(Number);
  if (parts.some(Number.isNaN)) return "1.0.1";
  while (parts.length < 3) parts.push(0);
  parts[parts.length - 1] += 1;
  return parts.join(".");
}

function fail(msg) {
  console.error(`[ios-submit] REJECT: ${msg}`);
  process.exit(1);
}

/** 키 식별자를 로그에 남길 때 앞 4자만 노출한다 (자격증명 유출 방지). */
const maskId = (id) => (id && id.length > 4 ? `${id.slice(0, 4)}${"*".repeat(id.length - 4)}` : "****");

// ─────────────────────────────── 인자 ───────────────────────────────
const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(name);
function argValue(name) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
}

const RELEASE_TYPES = { auto: "AFTER_APPROVAL", manual: "MANUAL" };

const opts = {
  submit: hasFlag("--submit"),
  versionString: argValue("--version"),
  buildNumber: argValue("--build"),
  includeIap: !hasFlag("--no-iap"),
  cancelStuckSubmission: hasFlag("--cancel-stuck-submission"),
  whatsNew: argValue("--whats-new"),
  releaseType: RELEASE_TYPES[argValue("--release-type") ?? "auto"],
};

if (!opts.releaseType) {
  fail(`--release-type 은 ${Object.keys(RELEASE_TYPES).join(" 또는 ")} 여야 합니다.`);
}

// ───────────────────────────── ASC 클라이언트 ─────────────────────────────

/** ES256 JWT 를 외부 의존성 없이 직접 서명한다 (node:crypto 만 사용). */
function makeToken(keyId, issuerId, keyPath) {
  let privateKey;
  try {
    privateKey = readFileSync(keyPath, "utf8");
  } catch (e) {
    fail(`.p8 키를 읽지 못했습니다 (${keyPath}): ${e.message}`);
  }
  const now = Math.floor(Date.now() / 1000);
  const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const header = b64url({ alg: "ES256", kid: keyId, typ: "JWT" });
  const payload = b64url({ iss: issuerId, iat: now, exp: now + JWT_TTL_SEC, aud: "appstoreconnect-v1" });
  const signingInput = `${header}.${payload}`;
  try {
    const signer = createSign("SHA256");
    signer.update(signingInput);
    // ASC 는 JOSE 형식(r||s 고정 64바이트) 서명을 요구한다. DER 이 아니다.
    const sig = signer.sign({ key: privateKey, dsaEncoding: "ieee-p1363" });
    return `${signingInput}.${sig.toString("base64url")}`;
  } catch (e) {
    fail(`.p8 키로 JWT 서명에 실패했습니다 (키 형식이 EC P-256 이 맞는지 확인): ${e.message}`);
  }
}

let TOKEN = null;

/**
 * ASC API 호출. 기본은 실패 시 즉시 중단하고, `{ soft: true }` 면 null 을 돌려줘
 * 호출부가 폴백을 시도할 수 있게 한다.
 */
async function api(method, path, body, { soft = false } = {}) {
  const url = path.startsWith("http") ? path : API + path;
  const bail = (msg) => {
    if (soft) return null;
    fail(msg);
  };

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
  } catch (e) {
    return bail(`네트워크 오류 (${method} ${path}): ${e.message}`);
  }

  const raw = await res.text().catch(() => "");
  if (!res.ok) {
    let detail = raw;
    try {
      const parsed = JSON.parse(raw);
      detail =
        (parsed.errors || [])
          .map((err) => `${err.title}${err.detail ? ` — ${err.detail}` : ""}`)
          .join(" / ") || raw;
    } catch {
      /* 본문이 JSON 이 아니면 원문 그대로 노출한다. */
    }
    return bail(`API ${method} ${path} → ${res.status}: ${detail}`);
  }
  if (res.status === NO_CONTENT || !raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    return bail(`API 응답을 JSON 으로 파싱하지 못했습니다 (${method} ${path}): ${e.message}`);
  }
}

// ─────────────────────────── 조회 헬퍼 ───────────────────────────

async function fetchApp() {
  const res = await api("GET", `/v1/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}&limit=1`);
  const app = res.data?.[0];
  if (!app) fail(`번들 ID ${BUNDLE_ID} 인 앱을 찾지 못했습니다. API 키 권한/팀을 확인하세요.`);
  return app;
}

async function fetchBuilds(appId) {
  const res = await api(
    "GET",
    // fields[builds] 에 preReleaseVersion 을 반드시 포함해야 한다 — 빼면 관계(relationship) 자체가
    // 응답에서 사라져 마케팅 버전을 "?" 로 잃는다.
    `/v1/builds?filter[app]=${appId}&sort=-uploadedDate&limit=${BUILD_PAGE_LIMIT}` +
      `&include=preReleaseVersion` +
      `&fields[builds]=version,uploadedDate,processingState,expired,preReleaseVersion`,
  );
  const preVersions = new Map(
    (res.included || []).filter((i) => i.type === "preReleaseVersions").map((i) => [i.id, i.attributes?.version]),
  );
  return (res.data || []).map((b) => ({
    id: b.id,
    buildNumber: b.attributes?.version,
    marketingVersion: preVersions.get(b.relationships?.preReleaseVersion?.data?.id) ?? "?",
    processingState: b.attributes?.processingState,
    expired: b.attributes?.expired,
    uploadedDate: b.attributes?.uploadedDate,
  }));
}

async function fetchVersions(appId) {
  const res = await api(
    "GET",
    // include=build 로 각 버전이 물고 있는 빌드번호까지 받아 온다 — 빌드번호 역행 검증에 쓴다.
    `/v1/apps/${appId}/appStoreVersions?filter[platform]=${PLATFORM}&limit=${VERSION_PAGE_LIMIT}&include=build`,
  );
  const buildNumbers = new Map(
    (res.included || []).filter((i) => i.type === "builds").map((i) => [i.id, i.attributes?.version]),
  );
  return (res.data || []).map((v) => ({
    id: v.id,
    versionString: v.attributes?.versionString,
    // appStoreState 는 deprecated 지만 아직 응답에 남아 있어 폴백으로 쓴다.
    state: v.attributes?.appVersionState ?? v.attributes?.appStoreState,
    createdDate: v.attributes?.createdDate,
    buildNumber: buildNumbers.get(v.relationships?.build?.data?.id) ?? null,
  }));
}

/**
 * 대기 중인 인앱결제 조회. Apple 이 이 목록을 v1/v2 두 경로로 노출해 온 이력이 있어 둘 다 시도하고,
 * 실패해도 제출 자체는 막지 않는다 (IAP 동봉은 부가 기능이므로 hard-fail 시키지 않는다).
 */
async function fetchPendingIaps(appId) {
  const paths = [
    `/v1/apps/${appId}/inAppPurchasesV2?limit=${VERSION_PAGE_LIMIT}`,
    `/v2/apps/${appId}/inAppPurchases?limit=${VERSION_PAGE_LIMIT}`,
  ];
  for (const path of paths) {
    const res = await api("GET", path, undefined, { soft: true });
    if (!res) continue;
    return (res.data || [])
      .map((p) => ({ id: p.id, productId: p.attributes?.productId, state: p.attributes?.state }))
      .filter((p) => IAP_NEEDS_SUBMISSION_STATES.has(p.state));
  }
  log("주의: 인앱결제 목록을 조회하지 못했습니다 — 앱 버전만 심사에 제출합니다.");
  return [];
}

async function fetchLocalizations(versionId) {
  const res = await api(
    "GET",
    `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations?limit=${VERSION_PAGE_LIMIT}`,
  );
  return (res.data || []).map((l) => ({
    id: l.id,
    locale: l.attributes?.locale,
    whatsNew: l.attributes?.whatsNew,
  }));
}

/**
 * 업데이트 버전은 "이번 버전의 새로운 기능"이 비어 있으면 심사 제출이 거부된다.
 * 비어 있는 로케일에만 채워 넣어 이미 번역해 둔 문구를 덮어쓰지 않는다.
 */
async function fillMissingWhatsNew(versionId, text) {
  const locales = await fetchLocalizations(versionId);
  const empty = locales.filter((l) => !l.whatsNew?.trim());
  for (const loc of empty) {
    await api("PATCH", `/v1/appStoreVersionLocalizations/${loc.id}`, {
      data: {
        type: "appStoreVersionLocalizations",
        id: loc.id,
        attributes: { whatsNew: text },
      },
    });
    log(`릴리스 노트 입력: ${loc.locale}`);
  }
  return locales.filter((l) => l.whatsNew?.trim()).map((l) => l.locale);
}

// ─────────────────────────── 변경 동작 ───────────────────────────

async function attachBuild(versionId, buildId) {
  await api("PATCH", `/v1/appStoreVersions/${versionId}/relationships/build`, {
    data: { type: "builds", id: buildId },
  });
}

async function createVersion(appId, versionString, releaseType) {
  const res = await api("POST", "/v1/appStoreVersions", {
    data: {
      type: "appStoreVersions",
      attributes: { platform: PLATFORM, versionString, releaseType },
      relationships: { app: { data: { type: "apps", id: appId } } },
    },
  });
  return { id: res.data.id, versionString, state: res.data.attributes?.appVersionState };
}

/**
 * 아직 제출되지 않은(READY_FOR_REVIEW) 심사 요청이 있으면 재사용, 없으면 새로 만든다.
 *
 * 앱당 진행 중인 심사 요청은 하나뿐이라, 반려돼 UNRESOLVED_ISSUES 로 멈춰 선 요청이 남아 있으면
 * 새 요청 생성이 409 로 막힌다. 그 경우 원인을 명확히 알리고, 취소는 --cancel-stuck-submission
 * 을 붙였을 때만 한다 (앱스토어 계정 상태를 건드리는 일이라 기본값은 '건드리지 않음').
 */
async function fetchOpenSubmissions(appId) {
  const res = await api(
    "GET",
    `/v1/reviewSubmissions?filter[app]=${appId}&filter[platform]=${PLATFORM}` +
      `&filter[state]=${REUSABLE_SUBMISSION_STATE},${STUCK_SUBMISSION_STATE}&limit=${VERSION_PAGE_LIMIT}`,
  );
  return (res.data || []).map((s) => ({
    id: s.id,
    state: s.attributes?.state,
    submittedDate: s.attributes?.submittedDate,
  }));
}

/** 반려돼 개발자 조치를 기다리는 심사 요청 (있으면 새 요청 생성이 막힌다). */
async function findStuckSubmission(appId) {
  return (await fetchOpenSubmissions(appId)).find((s) => s.state === STUCK_SUBMISSION_STATE) ?? null;
}

async function openReviewSubmission(appId, { cancelStuck = false } = {}) {
  const found = await fetchOpenSubmissions(appId);

  const reusable = found.find((s) => s.state === REUSABLE_SUBMISSION_STATE);
  if (reusable) {
    log(`기존 미제출 심사 요청 재사용: ${reusable.id}`);
    return reusable.id;
  }

  const stuck = found.find((s) => s.state === STUCK_SUBMISSION_STATE);
  if (stuck) {
    if (!cancelStuck) {
      fail(
        `반려된 심사 요청이 ${STUCK_SUBMISSION_STATE}("해결되지 않은 문제") 로 남아 있어 새 요청을 만들 수 없습니다.\n` +
          `  요청 id ${stuck.id} (제출 ${stuck.submittedDate ?? "-"})\n` +
          `  같은 명령에 --cancel-stuck-submission 을 붙이면 이 요청을 취소하고 새로 제출합니다.`,
      );
    }
    await api("PATCH", `/v1/reviewSubmissions/${stuck.id}`, {
      data: { type: "reviewSubmissions", id: stuck.id, attributes: { canceled: true } },
    });
    log(`멈춰 있던 심사 요청 취소: ${stuck.id}`);
  }

  const created = await api("POST", "/v1/reviewSubmissions", {
    data: {
      type: "reviewSubmissions",
      attributes: { platform: PLATFORM },
      relationships: { app: { data: { type: "apps", id: appId } } },
    },
  });
  return created.data.id;
}

async function addSubmissionItem(submissionId, relationship) {
  await api("POST", "/v1/reviewSubmissionItems", {
    data: {
      type: "reviewSubmissionItems",
      relationships: {
        reviewSubmission: { data: { type: "reviewSubmissions", id: submissionId } },
        ...relationship,
      },
    },
  });
}

async function submitForReview(submissionId) {
  await api("PATCH", `/v1/reviewSubmissions/${submissionId}`, {
    data: { type: "reviewSubmissions", id: submissionId, attributes: { submitted: true } },
  });
}

// ─────────────────────────────── 메인 ───────────────────────────────

async function main() {
  const keyId = process.env.ASC_API_KEY_ID || DEFAULT_KEY_ID;
  const issuerId = process.env.ASC_API_ISSUER_ID || DEFAULT_ISSUER_ID;
  const keyPath = process.env.ASC_API_KEY_PATH;

  if (!keyPath) {
    fail(
      "ASC_API_KEY_PATH 가 필요합니다 (AuthKey_XXXXXXXXXX.p8 경로).\n" +
        "  발급: App Store Connect > 사용자 및 액세스 > 통합 > App Store Connect API > 키 생성(App Manager)\n" +
        '  예: $env:ASC_API_KEY_PATH="C:\\keys\\AuthKey_8ZJ3Y6N6J7.p8"',
    );
  }
  const keyAbs = resolve(keyPath);
  if (!existsSync(keyAbs)) fail(`.p8 키 파일이 없습니다: ${keyAbs}`);

  TOKEN = makeToken(keyId, issuerId, keyAbs);
  log(`인증: key ${maskId(keyId)} / issuer ${maskId(issuerId)}`);

  const app = await fetchApp();
  log(`앱: ${app.attributes?.name} (${BUNDLE_ID}) — id ${app.id}`);

  // 1) TestFlight 빌드 목록에서 대상 고르기
  const builds = await fetchBuilds(app.id);
  if (!builds.length) fail("TestFlight 에 빌드가 없습니다.");
  log("TestFlight 빌드 (최신순):");
  for (const b of builds.slice(0, 5)) {
    const marks = [b.processingState, b.expired ? "만료" : null].filter(Boolean).join(", ");
    log(`  · ${b.marketingVersion} (${b.buildNumber})  [${marks}]  ${b.uploadedDate}`);
  }

  const usable = builds.filter((b) => b.processingState === "VALID" && !b.expired);
  const target = opts.buildNumber
    ? usable.find((b) => b.buildNumber === opts.buildNumber)
    : usable[0];
  if (!target) {
    fail(
      opts.buildNumber
        ? `빌드 ${opts.buildNumber} 을(를) 찾지 못했거나 제출 가능한 상태가 아닙니다.`
        : "제출 가능한(VALID·미만료) 빌드가 없습니다. TestFlight 처리 완료를 기다리세요.",
    );
  }
  log(`→ 제출 대상 빌드: ${target.marketingVersion} (${target.buildNumber})`);

  // 2) 앱 버전 상태 확인
  const versions = await fetchVersions(app.id);
  log("앱 스토어 버전:");
  for (const v of versions.slice(0, 5)) log(`  · ${v.versionString} — ${v.state}`);

  const inFlight = versions.find((v) => IN_FLIGHT_VERSION_STATES.has(v.state));
  if (inFlight) {
    log(`버전 ${inFlight.versionString} 이(가) 이미 ${inFlight.state} 입니다 — 추가 제출이 필요 없습니다.`);
    return;
  }

  let version = versions.find((v) => EDITABLE_VERSION_STATES.has(v.state));
  const needsNewVersion = !version;

  if (needsNewVersion && !opts.versionString) {
    const live = versions.find((v) => LIVE_VERSION_STATES.has(v.state)) ?? versions[0];
    fail(
      `편집 가능한 앱 버전이 없습니다 — ${live?.versionString} 이(가) ${live?.state} (이미 출시됨).\n` +
        `  build ${target.buildNumber} 을(를) 앱스토어에 올리려면 새 버전 번호가 필요합니다.\n` +
        `  예: --submit --version ${suggestNextVersion(live?.versionString)}`,
    );
  }

  // 3) 제출해도 되는 조합인지 먼저 검증한다 — ASC API 는 규칙 위반을 200 으로 통과시키고
  //    Apple 사후 검증이 나중에 INVALID_BINARY 로 반려하기 때문에 여기서 걸러야 한다.
  const targetVersionString = version?.versionString ?? opts.versionString;
  const releasedBuildNumbers = versions
    .filter((v) => LIVE_VERSION_STATES.has(v.state) && v.buildNumber)
    .map((v) => v.buildNumber);
  const check = validateBuildForVersion({
    build: target,
    versionString: targetVersionString,
    releasedBuildNumbers,
  });
  if (!check.ok) {
    fail(
      `${check.reason}\n` +
        `  대상 버전 ${targetVersionString} / 선택된 빌드 ${target.marketingVersion} (${target.buildNumber})` +
        `${releasedBuildNumbers.length ? ` / 이미 출시된 빌드: ${releasedBuildNumbers.join(", ")}` : ""}\n` +
        `  Mac 에서 새 빌드를 올린 뒤 다시 실행하세요 — 절차는 RESUBMIT-IOS.md 참고.`,
    );
  }

  // 4) dry-run 이면 여기서 계획만 출력하고 끝낸다.
  const pendingIaps = opts.includeIap ? await fetchPendingIaps(app.id) : [];
  if (pendingIaps.length) {
    log(`함께 제출할 인앱결제: ${pendingIaps.map((p) => `${p.productId}(${p.state})`).join(", ")}`);
  }

  if (!opts.submit) {
    log("─── 실행 계획 (dry-run — 아무것도 변경하지 않았습니다) ───");
    log(
      needsNewVersion
        ? `  1. 새 앱 버전 ${opts.versionString} 생성 (출시 방식 ${opts.releaseType})`
        : `  1. 기존 버전 ${version.versionString} (${version.state}) 사용`,
    );
    log(`  2. 빌드 ${target.marketingVersion} (${target.buildNumber}) 연결`);
    log(`  3. 릴리스 노트 ${opts.whatsNew ? `입력 (${opts.whatsNew.length}자)` : "미지정 — 비어 있으면 중단"}`);
    log(`  4. 심사 제출${pendingIaps.length ? ` (+ 인앱결제 ${pendingIaps.length}건)` : ""}`);
    const stuck = await findStuckSubmission(app.id);
    if (stuck) {
      log(
        `주의: 심사 요청 ${stuck.id} 이(가) ${STUCK_SUBMISSION_STATE}("해결되지 않은 문제") 로 남아 있습니다 — ` +
          `--cancel-stuck-submission 을 함께 붙여야 제출이 진행됩니다.`,
      );
    }
    log("실제로 제출하려면 --submit 을 붙여 다시 실행하세요.");
    return;
  }

  // 5) 실제 제출
  if (needsNewVersion) {
    version = await createVersion(app.id, opts.versionString, opts.releaseType);
    log(`새 앱 버전 생성: ${version.versionString} (출시 방식 ${opts.releaseType})`);
  } else if (opts.versionString && opts.versionString !== version.versionString) {
    log(`주의: 편집 가능한 버전 ${version.versionString} 이(가) 이미 있어 --version ${opts.versionString} 은 무시합니다.`);
  }

  await attachBuild(version.id, target.id);
  log(`빌드 연결 완료: ${version.versionString} ← build ${target.buildNumber}`);

  // 첫 버전이 아니면 릴리스 노트가 필수다. 없으면 제출 API 가 거부하므로 여기서 막는다.
  if (opts.whatsNew) {
    const kept = await fillMissingWhatsNew(version.id, opts.whatsNew);
    if (kept.length) log(`기존 릴리스 노트 유지: ${kept.join(", ")}`);
  } else {
    const empty = (await fetchLocalizations(version.id)).filter((l) => !l.whatsNew?.trim());
    if (empty.length) {
      fail(
        `릴리스 노트가 비어 있는 언어가 있습니다: ${empty.map((l) => l.locale).join(", ")}\n` +
          `  업데이트 버전은 릴리스 노트 없이 제출할 수 없습니다. --whats-new "내용" 으로 지정하세요.\n` +
          `  (버전 ${version.versionString} 과 빌드 연결은 이미 만들어졌으니 같은 명령에 --whats-new 만 추가해 다시 실행하면 됩니다.)`,
      );
    }
  }

  const submissionId = await openReviewSubmission(app.id, {
    cancelStuck: opts.cancelStuckSubmission,
  });
  await addSubmissionItem(submissionId, {
    appStoreVersion: { data: { type: "appStoreVersions", id: version.id } },
  });
  for (const iap of pendingIaps) {
    await addSubmissionItem(submissionId, {
      inAppPurchaseV2: { data: { type: "inAppPurchases", id: iap.id } },
    });
    log(`심사 항목 추가: 인앱결제 ${iap.productId}`);
  }

  await submitForReview(submissionId);
  log(`제출 완료 — 버전 ${version.versionString} / build ${target.buildNumber} 이(가) 심사 대기열에 들어갔습니다.`);
  log("App Store Connect > 배포 에서 '심사 대기 중(Waiting for Review)' 으로 바뀌었는지 확인하세요.");
}

// 단위 테스트가 순수 헬퍼만 import 할 수 있도록, 직접 실행했을 때만 main() 을 돌린다.
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) main().catch((e) => fail(e?.stack || String(e)));
