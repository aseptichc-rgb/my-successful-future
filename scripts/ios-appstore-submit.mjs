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

// ─────────────────────────────── 상수 ───────────────────────────────
const API = "https://api.appstoreconnect.apple.com";
const BUNDLE_ID = "com.michaelkim.anima";
const PLATFORM = "IOS";

// RESUBMIT-IOS.md 에 기록된 배포용 키 식별자. 비밀은 .p8 파일뿐이라 식별자는 기본값으로 둔다.
const DEFAULT_KEY_ID = "8ZJ3Y6N6J7";
const DEFAULT_ISSUER_ID = "daa5537d-77cb-44e3-904f-6df67f61ffde";

const JWT_TTL_SEC = 20 * 60; // ASC 는 최대 20분까지만 허용한다.
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
  "WAITING_FOR_REVIEW",
  "IN_REVIEW",
  "PENDING_APPLE_RELEASE",
  "PENDING_DEVELOPER_RELEASE",
  "PROCESSING_FOR_DISTRIBUTION",
  "READY_FOR_DISTRIBUTION",
]);

/** 이번 심사에 함께 묶어야 하는 인앱결제 상태 (첫 IAP 는 앱 버전과 같이 제출해야 통과된다). */
const IAP_NEEDS_SUBMISSION_STATES = new Set([
  "READY_TO_SUBMIT",
  "REJECTED",
  "DEVELOPER_ACTION_NEEDED",
]);

const log = (msg) => console.log(`[ios-submit] ${msg}`);

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

const opts = {
  submit: hasFlag("--submit"),
  versionString: argValue("--version"),
  buildNumber: argValue("--build"),
  includeIap: !hasFlag("--no-iap"),
};

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
    `/v1/builds?filter[app]=${appId}&sort=-uploadedDate&limit=${BUILD_PAGE_LIMIT}` +
      `&include=preReleaseVersion&fields[builds]=version,uploadedDate,processingState,expired`,
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
    `/v1/apps/${appId}/appStoreVersions?filter[platform]=${PLATFORM}&limit=${VERSION_PAGE_LIMIT}`,
  );
  return (res.data || []).map((v) => ({
    id: v.id,
    versionString: v.attributes?.versionString,
    // appStoreState 는 deprecated 지만 아직 응답에 남아 있어 폴백으로 쓴다.
    state: v.attributes?.appVersionState ?? v.attributes?.appStoreState,
    createdDate: v.attributes?.createdDate,
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

/** 새 버전은 "이번 버전의 새로운 기능"이 없으면 제출이 거부된다 — 미리 확인해 알려준다. */
async function findLocalesMissingWhatsNew(versionId) {
  const res = await api(
    "GET",
    `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations?limit=${VERSION_PAGE_LIMIT}`,
  );
  return (res.data || [])
    .filter((l) => !l.attributes?.whatsNew?.trim())
    .map((l) => l.attributes?.locale);
}

// ─────────────────────────── 변경 동작 ───────────────────────────

async function attachBuild(versionId, buildId) {
  await api("PATCH", `/v1/appStoreVersions/${versionId}/relationships/build`, {
    data: { type: "builds", id: buildId },
  });
}

async function createVersion(appId, versionString) {
  const res = await api("POST", "/v1/appStoreVersions", {
    data: {
      type: "appStoreVersions",
      attributes: { platform: PLATFORM, versionString },
      relationships: { app: { data: { type: "apps", id: appId } } },
    },
  });
  return { id: res.data.id, versionString, state: res.data.attributes?.appVersionState };
}

/** 아직 제출되지 않은(READY_FOR_REVIEW) 심사 요청이 있으면 재사용, 없으면 새로 만든다. */
async function openReviewSubmission(appId) {
  const existing = await api(
    "GET",
    `/v1/reviewSubmissions?filter[app]=${appId}&filter[platform]=${PLATFORM}&filter[state]=READY_FOR_REVIEW&limit=1`,
  );
  if (existing.data?.[0]) {
    log(`기존 미제출 심사 요청 재사용: ${existing.data[0].id}`);
    return existing.data[0].id;
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
  if (inFlight && !opts.versionString) {
    log(`버전 ${inFlight.versionString} 이(가) 이미 ${inFlight.state} 입니다 — 추가 제출이 필요 없습니다.`);
    return;
  }

  let version = versions.find((v) => EDITABLE_VERSION_STATES.has(v.state));
  const needsNewVersion = !version;

  if (needsNewVersion && !opts.versionString) {
    const live = versions[0];
    fail(
      `편집 가능한 앱 버전이 없습니다 (최근: ${live?.versionString} — ${live?.state}).\n` +
        `  새 버전을 만들려면 버전 번호를 명시하세요: --version <번호>  (예: --version 1.0.1)`,
    );
  }

  // 3) dry-run 이면 여기서 계획만 출력하고 끝낸다.
  const pendingIaps = opts.includeIap ? await fetchPendingIaps(app.id) : [];
  if (pendingIaps.length) {
    log(`함께 제출할 인앱결제: ${pendingIaps.map((p) => `${p.productId}(${p.state})`).join(", ")}`);
  }

  if (!opts.submit) {
    log("─── 실행 계획 (dry-run — 아무것도 변경하지 않았습니다) ───");
    log(
      needsNewVersion
        ? `  1. 새 앱 버전 ${opts.versionString} 생성`
        : `  1. 기존 버전 ${version.versionString} (${version.state}) 사용`,
    );
    log(`  2. 빌드 ${target.marketingVersion} (${target.buildNumber}) 연결`);
    log(`  3. 심사 제출${pendingIaps.length ? ` (+ 인앱결제 ${pendingIaps.length}건)` : ""}`);
    log("실제로 제출하려면 --submit 을 붙여 다시 실행하세요.");
    return;
  }

  // 4) 실제 제출
  if (needsNewVersion) {
    version = await createVersion(app.id, opts.versionString);
    log(`새 앱 버전 생성: ${version.versionString} (id ${version.id})`);
  } else if (opts.versionString && opts.versionString !== version.versionString) {
    log(`주의: 편집 가능한 버전 ${version.versionString} 이(가) 이미 있어 --version ${opts.versionString} 은 무시합니다.`);
  }

  await attachBuild(version.id, target.id);
  log(`빌드 연결 완료: ${version.versionString} ← build ${target.buildNumber}`);

  const missingWhatsNew = await findLocalesMissingWhatsNew(version.id);
  if (missingWhatsNew.length) {
    log(`주의: "이번 버전의 새로운 기능"이 비어 있는 언어 — ${missingWhatsNew.join(", ")}`);
  }

  const submissionId = await openReviewSubmission(app.id);
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

main().catch((e) => fail(e?.stack || String(e)));
