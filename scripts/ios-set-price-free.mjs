/**
 * App Store Connect — 앱 가격을 "무료"로 전환한다.
 *
 * 배경:
 *   Anima 는 2주 무료 체험 후 인앱결제(anima_lifetime)로 지속 이용하는 모델이다.
 *   그런데 iOS 는 앱 자체가 유료(선불)로 올라가 있어 모델과 정면 충돌한다
 *   (다운로드에 이미 돈을 냈는데 14일 뒤 또 결제를 요구받는다).
 *   이 스크립트가 가격표를 무료로 바꿔 선불 장벽을 없앤다.
 *
 * 하는 일:
 *   1) 번들 ID 로 앱과 현재 가격 일정(appPriceSchedule)을 읽는다.
 *   2) 기준 지역(baseTerritory)의 "customerPrice = 0" 가격 포인트를 찾는다.
 *   3) 기준 지역 무료 가격 하나만 담은 새 가격 일정을 POST 한다.
 *      → POST 는 일정 전체를 교체하므로 기존 지역별 수동 가격(KOR 등)이 함께 제거되고,
 *        모든 지역이 기준 지역 가격(무료)으로 자동 균등화된다.
 *   4) 적용 후 일정을 다시 읽어 실제로 0 이 됐는지 검증한다.
 *
 * 주의:
 *   - 가격 변경은 심사가 필요 없고 몇 분 내 스토어에 반영된다.
 *   - 이미 유료로 구매한 사용자는 환불되지 않으며 앱을 계속 보유한다. 다만 그들은
 *     인앱결제 영수증이 없어 서버 entitlement 가 없다 — 체험 만료 후 막히므로
 *     별도 구제(수동 claim 부여)가 필요하다. README-IOS.md 참고.
 *   - 무료 → 유료 되돌리기는 같은 API 로 가능하지만, 무료로 받은 사용자에게서
 *     앱을 회수할 수는 없다. 되돌릴 때는 --price-point 로 포인트 ID 를 지정한다.
 *
 * 사용:
 *   node scripts/ios-set-price-free.mjs            # 현재 가격 + 변경 계획만 (아무것도 안 바꿈)
 *   node scripts/ios-set-price-free.mjs --apply    # 실제 무료 전환
 *
 * 인증(App Store Connect API 키):
 *   ASC_API_KEY_PATH   (필수) AuthKey_XXXXXXXXXX.p8 파일 경로
 *   ASC_API_KEY_ID     (선택) 기본값 아래 DEFAULT_KEY_ID
 *   ASC_API_ISSUER_ID  (선택) 기본값 아래 DEFAULT_ISSUER_ID
 */
import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";

// ─────────────────────────────── 상수 ───────────────────────────────
// makeToken/api 는 ios-update-metadata.mjs / ios-appstore-submit.mjs 와 의도적 중복 —
// 이 저장소의 배포 스크립트는 play-*.mjs 와 마찬가지로 파일 하나로 자기완결이 컨벤션이다.
const API = "https://api.appstoreconnect.apple.com";
const BUNDLE_ID = "com.michaelkim.anima";

const DEFAULT_KEY_ID = "8ZJ3Y6N6J7";
const DEFAULT_ISSUER_ID = "daa5537d-77cb-44e3-904f-6df67f61ffde";

const JWT_TTL_SEC = 15 * 60;
const HTTP_TIMEOUT_MS = 60_000;
const NO_CONTENT = 204;

/** 가격 포인트 페이지 크기 — 지역당 티어가 650개를 넘어 페이지 순회가 필요하다. */
const PRICE_POINT_PAGE_LIMIT = 200;
/** 가격 포인트 순회 상한 — 무한 루프 방지 (650여 개 ÷ 200 = 4페이지면 충분). */
const PRICE_POINT_MAX_PAGES = 12;
/**
 * 개별 가격 포인트 조회는 v3 에서만 열려 있다.
 * (/v1·/v2/appPrices 는 404·403 — 실측 확인)
 */
const PRICE_POINT_PATH = "/v3/appPricePoints";
/** POST 본문에서 included ↔ relationships 를 잇는 임시 ID (Apple 문서 표기 관례). */
const NEW_PRICE_REF = "${price-free}";

/**
 * 무료 판정 — customerPrice 는 지역마다 표기가 갈린다 (KOR "0", USA "0.0").
 * 문자열 비교로는 새는 값이 있어 숫자로 환산해 비교한다.
 */
function isFreePrice(customerPrice) {
  if (customerPrice === null || customerPrice === undefined) return false;
  const n = Number(customerPrice);
  return Number.isFinite(n) && n === 0;
}

// ─────────────────────────── 로깅/종료 ───────────────────────────
const log = (msg) => console.log(`[ios-price] ${msg}`);

function fail(msg) {
  console.error(`[ios-price] REJECT: ${msg}`);
  process.exit(1);
}

const maskId = (v) => (v ? `${v.slice(0, 4)}${"*".repeat(Math.max(0, v.length - 4))}` : "(없음)");

// ─────────────────────────────── 인자 ───────────────────────────────
const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(name);
function argValue(name) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
}

const opts = {
  apply: hasFlag("--apply"),
  /** 무료 대신 특정 가격 포인트로 되돌릴 때 사용 (되돌리기 경로). */
  pricePointId: argValue("--price-point"),
};

// ───────────────────────────── ASC 클라이언트 ─────────────────────────────

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
  const payload = b64url({
    iss: issuerId,
    iat: now,
    exp: now + JWT_TTL_SEC,
    aud: "appstoreconnect-v1",
  });
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

/**
 * 가격/가격포인트 ID 는 base64url JSON 이다.
 *   가격포인트: {s: appId, t: territory, p: tier}
 *   수동 가격 : {s, t, p, sd: startDate, ed: endDate}
 * 해독 실패는 표시용 정보이므로 조용히 null 로 떨어뜨린다.
 */
function decodeId(id) {
  if (!id) return null;
  try {
    const parsed = JSON.parse(Buffer.from(id, "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * 수동 가격 ID 에서 대응하는 가격 포인트 ID 를 만든다.
 * 수동 가격은 가격 포인트 ID 에 기간(sd/ed)만 덧붙인 형태라 그 둘을 떼면 된다.
 * appPrices 리소스 자체는 조회가 막혀 있어(403) 이 경로로 금액을 얻는다.
 */
function pricePointIdFromPriceId(priceId) {
  const d = decodeId(priceId);
  if (!d || typeof d.s !== "string" || typeof d.t !== "string" || typeof d.p !== "string") {
    return null;
  }
  return Buffer.from(JSON.stringify({ s: d.s, t: d.t, p: d.p })).toString("base64url");
}

/** 가격 포인트 하나의 실제 금액. 조회 실패는 표시용이므로 null 로 흘린다. */
async function fetchPricePointAmount(pricePointId) {
  if (!pricePointId) return null;
  const res = await api("GET", `${PRICE_POINT_PATH}/${pricePointId}`, undefined, { soft: true });
  return res?.data?.attributes?.customerPrice ?? null;
}

/**
 * 현재 가격 일정 — 기준 지역과, 지역별로 걸린 수동 가격의 실제 금액까지 풀어서 반환한다.
 * 가격 일정이 아예 없는 앱(미출시 등)은 404 가 날 수 있어 soft 로 조회한다.
 */
async function fetchSchedule(appId) {
  const res = await api(
    "GET",
    `/v1/apps/${appId}/appPriceSchedule?include=baseTerritory,manualPrices`,
    undefined,
    { soft: true },
  );
  if (!res?.data) return null;

  const baseTerritory = res.data.relationships?.baseTerritory?.data?.id ?? null;
  const prices = (res.included || []).filter((i) => i.type === "appPrices");

  const manualPrices = await Promise.all(
    prices.map(async (p) => {
      const pointId = pricePointIdFromPriceId(p.id);
      return {
        id: p.id,
        startDate: p.attributes?.startDate ?? null,
        territory: decodeId(p.id)?.t ?? null,
        customerPrice: await fetchPricePointAmount(pointId),
      };
    }),
  );

  return { baseTerritory, manualPrices };
}

/**
 * 해당 지역의 무료 가격 포인트 ID 를 찾는다.
 * 지역당 티어가 650개를 넘고 무료 티어의 위치가 지역마다 달라 페이지를 순회한다.
 */
async function findFreePricePoint(appId, territory) {
  let path =
    `/v1/apps/${appId}/appPricePoints` +
    `?filter[territory]=${encodeURIComponent(territory)}&limit=${PRICE_POINT_PAGE_LIMIT}`;
  let scanned = 0;

  for (let page = 0; page < PRICE_POINT_MAX_PAGES && path; page += 1) {
    const res = await api("GET", path);
    const rows = res.data || [];
    scanned += rows.length;
    const free = rows.find((p) => isFreePrice(p.attributes?.customerPrice));
    if (free) return free.id;
    path = res.links?.next ?? null;
  }

  fail(
    `${territory} 지역에서 무료 가격 포인트를 찾지 못했습니다 (${scanned}건 조회). ` +
      `지역 코드나 API 키 권한을 확인하세요.`,
  );
}

/**
 * 가격 일정을 통째로 교체한다 — 기준 지역 가격 하나만 넣으면 나머지 지역은 Apple 이 균등화한다.
 * startDate: null = 즉시 발효.
 */
async function replaceSchedule(appId, baseTerritory, pricePointId) {
  return api("POST", "/v1/appPriceSchedules", {
    data: {
      type: "appPriceSchedules",
      relationships: {
        app: { data: { type: "apps", id: appId } },
        baseTerritory: { data: { type: "territories", id: baseTerritory } },
        manualPrices: { data: [{ type: "appPrices", id: NEW_PRICE_REF }] },
      },
    },
    included: [
      {
        type: "appPrices",
        id: NEW_PRICE_REF,
        attributes: { startDate: null },
        relationships: {
          appPricePoint: { data: { type: "appPricePoints", id: pricePointId } },
        },
      },
    ],
  });
}

function describeSchedule(schedule) {
  if (!schedule) return "가격 일정 없음 (아직 가격이 설정되지 않은 앱)";
  const lines = [`기준 지역: ${schedule.baseTerritory ?? "(없음)"}`];
  if (schedule.manualPrices.length === 0) {
    lines.push("  수동 가격 없음 — 전 지역이 기준 지역 가격으로 균등화됨");
  }
  for (const p of schedule.manualPrices) {
    const price = p.customerPrice === null ? "(금액 미상)" : p.customerPrice;
    const free = isFreePrice(p.customerPrice) ? " ← 무료" : "";
    lines.push(`  · ${p.territory ?? "(지역 미상)"}: ${price}${free}`);
  }
  return lines.join("\n");
}

/** 일정이 "전 지역 무료" 상태인가 — 수동 가격이 하나라도 있고 전부 0 이어야 한다. */
function isScheduleFree(schedule) {
  return (
    schedule !== null &&
    schedule.manualPrices.length > 0 &&
    schedule.manualPrices.every((p) => isFreePrice(p.customerPrice))
  );
}

// ─────────────────────────────── 메인 ───────────────────────────────

async function main() {
  const keyPath = process.env.ASC_API_KEY_PATH;
  if (!keyPath) fail("ASC_API_KEY_PATH 환경변수에 .p8 키 파일 경로를 지정하세요.");
  const keyId = process.env.ASC_API_KEY_ID || DEFAULT_KEY_ID;
  const issuerId = process.env.ASC_API_ISSUER_ID || DEFAULT_ISSUER_ID;
  TOKEN = makeToken(keyId, issuerId, keyPath);
  log(`인증: key ${maskId(keyId)} / issuer ${maskId(issuerId)}`);

  const app = await fetchApp();
  log(`앱: ${app.attributes?.name} (${BUNDLE_ID}) — id ${app.id}`);

  const before = await fetchSchedule(app.id);
  log("── 현재 가격 ──");
  log(describeSchedule(before));

  // 기준 지역이 없으면(가격 일정 미설정) USA 로 시작한다 — Apple 기본 기준 지역.
  const baseTerritory = before?.baseTerritory ?? "USA";

  const targetPointId = opts.pricePointId ?? (await findFreePricePoint(app.id, baseTerritory));
  const targetLabel = opts.pricePointId ? `지정 가격 포인트 ${opts.pricePointId}` : "무료(0)";

  if (!opts.pricePointId && isScheduleFree(before)) {
    log("이미 전 지역 무료입니다 — 변경할 것이 없습니다.");
    return;
  }

  if (!opts.apply) {
    log("── 변경 계획 (--apply 없이는 아무것도 바꾸지 않습니다) ──");
    log(`기준 지역 ${baseTerritory} 를 ${targetLabel} 로 설정하고 가격 일정을 교체합니다.`);
    log("기존 지역별 수동 가격은 제거되고, 모든 지역이 기준 지역 가격으로 균등화됩니다.");
    log("실행하려면: node scripts/ios-set-price-free.mjs --apply");
    return;
  }

  log(`가격 일정 교체 중 — 기준 지역 ${baseTerritory}, ${targetLabel}...`);
  await replaceSchedule(app.id, baseTerritory, targetPointId);

  // 적용 결과를 다시 읽어 검증한다 — POST 200 만 믿지 않는다.
  const after = await fetchSchedule(app.id);
  log("── 변경 후 가격 ──");
  log(describeSchedule(after));

  if (!opts.pricePointId) {
    if (!isScheduleFree(after)) {
      fail("가격 일정을 교체했지만 재조회 결과가 무료가 아닙니다. App Store Connect 에서 직접 확인하세요.");
    }
    log("무료 전환 완료 — 스토어 반영까지 보통 몇 분 걸립니다 (심사 불필요).");
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
