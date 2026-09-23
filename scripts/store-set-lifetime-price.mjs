/**
 * 평생 이용권(anima_lifetime) 가격을 Google Play · App Store 양쪽에서 한 번에 바꾼다.
 *
 * 하는 일:
 *   Play      — USD 기준가를 Play 환율표(convertRegionPrices)로 전 지역 환산하고,
 *               한국만 KRW 고정가로 덮어써 purchaseOption 의 지역 가격표를 교체한다.
 *   App Store — 기준 지역(USA) 가격 + 한국(KOR) 수동 가격만 남긴 가격 일정을 POST 한다.
 *               POST 는 일정 전체를 교체하므로 나머지 지역은 USA 기준으로 자동 균등화된다.
 *
 * 주의:
 *   - 가격 변경은 심사가 필요 없고 몇 분~몇 시간 안에 스토어에 반영된다.
 *   - 이미 구매한 사용자에게는 영향이 없다(비소모성 1회 결제).
 *   - 기본은 dry-run(계획만 출력). --apply 를 줘야 실제로 바꾼다.
 *
 * 사용:
 *   node scripts/store-set-lifetime-price.mjs --usd 19.99 --krw 29000            # 계획만
 *   node scripts/store-set-lifetime-price.mjs --usd 19.99 --krw 29000 --apply    # 실제 적용
 *   --only play | --only ios  로 한쪽만 실행할 수 있다.
 *
 * 인증:
 *   Play — GOOGLE_PLAY_SA_KEY / GOOGLE_PLAY_SA_KEY_FILE / .env.local 의 FIREBASE_SERVICE_ACCOUNT_KEY
 *   iOS  — ASC_API_KEY_PATH (필수), ASC_API_KEY_ID · ASC_API_ISSUER_ID (선택)
 */
import { readFileSync, existsSync } from "node:fs";
import { createSign } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";

// ─────────────────────────────── 상수 ───────────────────────────────
// makeToken/api 는 ios-set-price-free.mjs 와 의도적 중복 — 스토어 스크립트는 파일 하나로 자기완결하는 컨벤션.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_NAME = "com.michaelkim.anima";
const BUNDLE_ID = "com.michaelkim.anima";
const PRODUCT_ID = "anima_lifetime";

const ASC_API = "https://api.appstoreconnect.apple.com";
const DEFAULT_KEY_ID = "8ZJ3Y6N6J7";
const DEFAULT_ISSUER_ID = "daa5537d-77cb-44e3-904f-6df67f61ffde";
const JWT_TTL_SEC = 15 * 60;
const HTTP_TIMEOUT_MS = 60_000;
const NO_CONTENT = 204;

const IOS_BASE_TERRITORY = "USA";
const IOS_KR_TERRITORY = "KOR";
const PLAY_KR_REGION = "KR";
/** 가격 포인트 페이지 크기·상한 — 지역당 포인트가 수백 개라 페이지 순회가 필요하다. */
const PRICE_POINT_PAGE_LIMIT = 200;
const PRICE_POINT_MAX_PAGES = 12;
const NANOS_PER_UNIT = 1_000_000_000;
const HTTP_FORBIDDEN = 403;
/** 환율 API 를 못 쓸 때 patch 에 넘길 Play 지역 버전 (Play 문서 기준 최신). */
const DEFAULT_REGIONS_VERSION = "2025/03";
/** 가격 비교 허용 오차 — 문자열 표기("19.99" vs "19.990")를 숫자로 비교할 때. */
const PRICE_EPSILON = 0.001;

// ─────────────────────────── 로깅/종료 ───────────────────────────
const log = (msg) => console.log(`[lifetime-price] ${msg}`);

function fail(msg) {
  console.error(`[lifetime-price] REJECT: ${msg}`);
  process.exit(1);
}

const maskEmail = (v) => (v ? v.replace(/^(.{3}).*(@.*)$/, "$1***$2") : "(없음)");

// ─────────────────────────────── 인자 ───────────────────────────────
const argv = process.argv.slice(2);
function argValue(name) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
}

const opts = {
  apply: argv.includes("--apply"),
  usd: Number(argValue("--usd")),
  krw: Number(argValue("--krw")),
  only: argValue("--only"),
};
if (!Number.isFinite(opts.usd) || opts.usd <= 0) fail("--usd 에 양수 가격을 지정하세요 (예: 19.99)");
if (!Number.isInteger(opts.krw) || opts.krw <= 0) fail("--krw 에 정수 원화 가격을 지정하세요 (예: 29000)");
if (opts.only && !["play", "ios"].includes(opts.only)) fail("--only 는 play 또는 ios 만 가능합니다.");

const samePrice = (a, b) => Math.abs(Number(a) - Number(b)) < PRICE_EPSILON;

/** 숫자 금액 → Play Money {currencyCode, units, nanos}. 부동소수 오차를 피하려 센트 단위로 반올림한다. */
function toMoney(currencyCode, amount) {
  const cents = Math.round(amount * 100);
  const units = Math.floor(cents / 100);
  const nanos = (cents % 100) * (NANOS_PER_UNIT / 100);
  return nanos ? { currencyCode, units: String(units), nanos } : { currencyCode, units: String(units) };
}

const moneyToNumber = (m) => Number(m?.units ?? 0) + (m?.nanos ?? 0) / NANOS_PER_UNIT;
const fmtMoney = (m) => (m ? `${moneyToNumber(m)} ${m.currencyCode}` : "(없음)");

// ═════════════════════════════ Google Play ═════════════════════════════

function loadPlayCredentials() {
  try {
    if (process.env.GOOGLE_PLAY_SA_KEY) return JSON.parse(process.env.GOOGLE_PLAY_SA_KEY);
    if (process.env.GOOGLE_PLAY_SA_KEY_FILE) {
      return JSON.parse(readFileSync(process.env.GOOGLE_PLAY_SA_KEY_FILE, "utf8"));
    }
    const envFile = join(ROOT, ".env.local");
    if (!existsSync(envFile)) fail(`Play 인증 정보를 찾을 수 없습니다 (.env.local 없음)`);
    const matched = readFileSync(envFile, "utf8").match(/^FIREBASE_SERVICE_ACCOUNT_KEY=(.*)$/m);
    if (!matched) fail(".env.local 에 FIREBASE_SERVICE_ACCOUNT_KEY 가 없습니다.");
    return JSON.parse(matched[1].trim().replace(/^'|'$/g, ""));
  } catch (e) {
    fail(`Play 서비스 계정 키 파싱 실패: ${e.message}`);
  }
}

async function runPlay() {
  log("── Google Play ──");
  const credentials = loadPlayCredentials();
  log(`서비스 계정: ${maskEmail(credentials.client_email)}`);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  const publisher = google.androidpublisher({ version: "v3", auth });

  let product;
  try {
    product = (await publisher.monetization.onetimeproducts.get({ packageName: PACKAGE_NAME, productId: PRODUCT_ID })).data;
  } catch (e) {
    fail(`Play 상품 조회 실패: ${e.message}`);
  }

  // 1순위: Play 환율표 환산. 서비스 계정에 가격 권한이 없으면(403) 현재 지역가를 US 인하 비율로 스케일한다
  // — 현재 지역가 자체가 US 기준 환산값이라 결과는 환율표 환산과 거의 같다.
  let converted = null;
  try {
    converted = (
      await publisher.monetization.convertRegionPrices({
        packageName: PACKAGE_NAME,
        requestBody: { price: toMoney("USD", opts.usd) },
      })
    ).data;
  } catch (e) {
    if (e.code !== HTTP_FORBIDDEN) fail(`Play 환율 조회 실패: ${e.message}`);
    log(`  환율 환산 API 권한 없음(403) — 현재 지역가를 비율로 스케일합니다.`);
  }
  const regionPrices = converted?.convertedRegionPrices || {};
  const regionsVersion = converted?.regionVersion?.version || DEFAULT_REGIONS_VERSION;

  const purchaseOptions = (product.purchaseOptions || []).map((option) => {
    const currentUs = option.regionalPricingAndAvailabilityConfigs?.find((c) => c.regionCode === "US")?.price;
    if (!currentUs) fail(`purchaseOption ${option.purchaseOptionId} 에 US 가격이 없어 인하 비율을 계산할 수 없습니다.`);
    const ratio = opts.usd / moneyToNumber(currentUs);
    const scale = (money) => {
      // 원래 소수 없이 매겨진 통화(JPY·KRW 등)는 정수로, 나머지는 센트 단위로 맞춘다.
      const amount = moneyToNumber(money) * ratio;
      return toMoney(money.currencyCode, money.nanos ? amount : Math.round(amount));
    };
    const configs = (option.regionalPricingAndAvailabilityConfigs || []).map((cfg) => {
      if (cfg.regionCode === PLAY_KR_REGION) return { ...cfg, price: toMoney("KRW", opts.krw) };
      if (cfg.regionCode === "US") return { ...cfg, price: toMoney("USD", opts.usd) };
      const next = regionPrices[cfg.regionCode]?.price || (cfg.price && scale(cfg.price));
      return next ? { ...cfg, price: next } : cfg;
    });
    const newRegionsConfig = option.newRegionsConfig
      ? {
          ...option.newRegionsConfig,
          usdPrice: converted?.convertedOtherRegionsPrice?.usdPrice ?? toMoney("USD", opts.usd),
          eurPrice: converted?.convertedOtherRegionsPrice?.eurPrice ?? scale(option.newRegionsConfig.eurPrice),
        }
      : undefined;
    return { ...option, regionalPricingAndAvailabilityConfigs: configs, ...(newRegionsConfig && { newRegionsConfig }) };
  });

  for (const [before, after] of (product.purchaseOptions || []).map((o, i) => [o, purchaseOptions[i]])) {
    const pick = (opt, code) => opt.regionalPricingAndAvailabilityConfigs?.find((c) => c.regionCode === code)?.price;
    log(`purchaseOption ${before.purchaseOptionId} (${before.regionalPricingAndAvailabilityConfigs?.length ?? 0}개 지역)`);
    for (const code of ["KR", "US", "JP", "GB", "DE"]) {
      log(`  ${code}: ${fmtMoney(pick(before, code))} → ${fmtMoney(pick(after, code))}`);
    }
  }

  if (!opts.apply) {
    log("dry-run — Play 는 변경하지 않았습니다.");
    return;
  }

  try {
    await publisher.monetization.onetimeproducts.patch({
      packageName: PACKAGE_NAME,
      productId: PRODUCT_ID,
      updateMask: "purchaseOptions",
      "regionsVersion.version": regionsVersion,
      requestBody: { ...product, purchaseOptions },
    });
    const verify = (await publisher.monetization.onetimeproducts.get({ packageName: PACKAGE_NAME, productId: PRODUCT_ID })).data;
    const cfgs = verify.purchaseOptions?.[0]?.regionalPricingAndAvailabilityConfigs || [];
    const kr = cfgs.find((c) => c.regionCode === PLAY_KR_REGION)?.price;
    const us = cfgs.find((c) => c.regionCode === "US")?.price;
    if (!samePrice(moneyToNumber(kr), opts.krw) || !samePrice(moneyToNumber(us), opts.usd)) {
      fail(`Play 적용 후 검증 불일치 — KR ${fmtMoney(kr)}, US ${fmtMoney(us)}`);
    }
    log(`✓ Play 적용 완료 — KR ${fmtMoney(kr)}, US ${fmtMoney(us)}`);
  } catch (e) {
    fail(`Play 가격 적용 실패: ${e.message}`);
  }
}

// ═════════════════════════════ App Store ═════════════════════════════

function makeAscToken(keyId, issuerId, keyPath) {
  try {
    const privateKey = readFileSync(keyPath, "utf8");
    const now = Math.floor(Date.now() / 1000);
    const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
    const signingInput = `${b64url({ alg: "ES256", kid: keyId, typ: "JWT" })}.${b64url({
      iss: issuerId,
      iat: now,
      exp: now + JWT_TTL_SEC,
      aud: "appstoreconnect-v1",
    })}`;
    const signer = createSign("SHA256");
    signer.update(signingInput);
    // ASC 는 JOSE 형식(r||s 64바이트) 서명을 요구한다. DER 이 아니다.
    return `${signingInput}.${signer.sign({ key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
  } catch (e) {
    fail(`ASC JWT 생성 실패 (${keyPath}): ${e.message}`);
  }
}

let ASC_TOKEN = null;

async function asc(method, path, body) {
  const url = path.startsWith("http") ? path : ASC_API + path;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${ASC_TOKEN}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
  } catch (e) {
    fail(`네트워크 오류 (${method} ${path}): ${e.message}`);
  }
  const raw = await res.text().catch(() => "");
  if (!res.ok) {
    let detail = raw;
    try {
      detail = (JSON.parse(raw).errors || []).map((err) => `${err.title}${err.detail ? ` — ${err.detail}` : ""}`).join(" / ") || raw;
    } catch {
      /* JSON 이 아니면 원문 그대로 노출한다. */
    }
    fail(`API ${method} ${path} → ${res.status}: ${detail}`);
  }
  if (res.status === NO_CONTENT || !raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    fail(`API 응답 JSON 파싱 실패 (${method} ${path}): ${e.message}`);
  }
}

/** 가격 포인트 ID 는 base64url JSON {s, t, p, ...} — 지역(t)·단계(p) 식별에 쓴다. */
function decodeId(id) {
  try {
    return JSON.parse(Buffer.from(id, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

async function findPricePoint(iapId, territory, amount) {
  let url = `/v2/inAppPurchases/${iapId}/pricePoints?filter[territory]=${territory}&limit=${PRICE_POINT_PAGE_LIMIT}`;
  for (let page = 0; url && page < PRICE_POINT_MAX_PAGES; page += 1) {
    const res = await asc("GET", url);
    const hit = (res.data || []).find((p) => samePrice(p.attributes?.customerPrice, amount));
    if (hit) return hit;
    url = res.links?.next || null;
  }
  fail(`${territory} 에 ${amount} 가격 포인트가 없습니다. Apple 가격 단계에 있는 금액으로 지정하세요.`);
}

async function currentManualPrices(iapId) {
  const sch = await asc("GET", `/v2/inAppPurchases/${iapId}/iapPriceSchedule?include=manualPrices&limit[manualPrices]=50`);
  return (sch.included || [])
    .filter((x) => x.type === "inAppPurchasePrices")
    .map((x) => decodeId(x.id))
    .filter(Boolean);
}

async function describePrice(iapId, territory, tier) {
  let url = `/v2/inAppPurchases/${iapId}/pricePoints?filter[territory]=${territory}&limit=${PRICE_POINT_PAGE_LIMIT}`;
  for (let page = 0; url && page < PRICE_POINT_MAX_PAGES; page += 1) {
    const res = await asc("GET", url);
    const hit = (res.data || []).find((p) => decodeId(p.id)?.p === tier);
    if (hit) return hit.attributes.customerPrice;
    url = res.links?.next || null;
  }
  return `tier ${tier}`;
}

async function runIos() {
  log("── App Store ──");
  const keyPath = process.env.ASC_API_KEY_PATH;
  if (!keyPath) fail("ASC_API_KEY_PATH 환경변수에 .p8 키 경로를 지정하세요.");
  ASC_TOKEN = makeAscToken(
    process.env.ASC_API_KEY_ID || DEFAULT_KEY_ID,
    process.env.ASC_API_ISSUER_ID || DEFAULT_ISSUER_ID,
    keyPath,
  );

  const app = (await asc("GET", `/v1/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}&limit=1`)).data?.[0];
  if (!app) fail(`번들 ID ${BUNDLE_ID} 앱을 찾지 못했습니다.`);
  const iap = (await asc("GET", `/v1/apps/${app.id}/inAppPurchasesV2?filter[productId]=${PRODUCT_ID}&limit=1`)).data?.[0];
  if (!iap) fail(`인앱 상품 ${PRODUCT_ID} 을 찾지 못했습니다.`);

  for (const m of await currentManualPrices(iap.id)) {
    log(`  현재 ${m.t}: ${await describePrice(iap.id, m.t, m.p)}`);
  }

  const usPoint = await findPricePoint(iap.id, IOS_BASE_TERRITORY, opts.usd);
  const krPoint = await findPricePoint(iap.id, IOS_KR_TERRITORY, opts.krw);
  log(`  변경 ${IOS_BASE_TERRITORY}: ${usPoint.attributes.customerPrice} (수익 ${usPoint.attributes.proceeds})`);
  log(`  변경 ${IOS_KR_TERRITORY}: ${krPoint.attributes.customerPrice} (수익 ${krPoint.attributes.proceeds})`);
  log(`  그 외 지역: ${IOS_BASE_TERRITORY} 기준 자동 균등화`);

  if (!opts.apply) {
    log("dry-run — App Store 는 변경하지 않았습니다.");
    return;
  }

  const refs = [
    { ref: "${price-usa}", point: usPoint },
    { ref: "${price-kor}", point: krPoint },
  ];
  await asc("POST", "/v1/inAppPurchasePriceSchedules", {
    data: {
      type: "inAppPurchasePriceSchedules",
      relationships: {
        inAppPurchase: { data: { type: "inAppPurchases", id: iap.id } },
        baseTerritory: { data: { type: "territories", id: IOS_BASE_TERRITORY } },
        manualPrices: { data: refs.map(({ ref }) => ({ type: "inAppPurchasePrices", id: ref })) },
      },
    },
    included: refs.map(({ ref, point }) => ({
      type: "inAppPurchasePrices",
      id: ref,
      attributes: { startDate: null },
      relationships: {
        inAppPurchasePricePoint: { data: { type: "inAppPurchasePricePoints", id: point.id } },
      },
    })),
  });

  const after = await currentManualPrices(iap.id);
  const tiers = new Map(after.map((m) => [m.t, m.p]));
  if (tiers.get(IOS_BASE_TERRITORY) !== decodeId(usPoint.id)?.p || tiers.get(IOS_KR_TERRITORY) !== decodeId(krPoint.id)?.p) {
    fail(`App Store 적용 후 검증 불일치 — ${JSON.stringify(after)}`);
  }
  log(`✓ App Store 적용 완료 — USA ${usPoint.attributes.customerPrice}, KOR ${krPoint.attributes.customerPrice}`);
}

// ─────────────────────────────── 실행 ───────────────────────────────
try {
  log(`목표: USD ${opts.usd} / KRW ${opts.krw} ${opts.apply ? "(적용)" : "(dry-run)"}`);
  if (opts.only !== "ios") await runPlay();
  if (opts.only !== "play") await runIos();
} catch (e) {
  fail(e?.message || String(e));
}
