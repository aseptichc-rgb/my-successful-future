/**
 * App Store Server API 영수증 검증 (StoreKit 2 / JWS 기반).
 *
 * iOS StoreKit2 클라이언트가 받은 `Transaction.signedTransaction` (JWS) 또는
 * `originalTransactionId` 를 서버가 Apple 에 직접 물어 확정한다. 이 검증을 거치지 않으면
 * 다음 공격이 가능:
 *   - 가짜 영수증 위조 (JWS 서명 검증 실패)
 *   - 환불 후에도 결제자처럼 행세 (서버 측 transaction.revocationDate 확인 필요)
 *   - 다른 앱의 영수증을 우리 앱에 제출 (bundleId / appAppleId 미스매치 차단)
 *
 * Apple 의 영수증 검증은 두 가지 방식이 있다:
 *   A) JWS 자체 검증 — 클라가 보낸 signedTransaction (JWS) 의 서명을 Apple 공개키로 검증.
 *      네트워크 라운드트립 0 회지만 environment(Sandbox/Production) 가 JWS 본문에 들어있음을
 *      신뢰해야 한다.
 *   B) App Store Server API — `Get Transaction Info` 엔드포인트에 transactionId 를 보내
 *      Apple 이 발급한 새 JWS 를 받아 검증. 환불/취소 상태까지 실시간 확인 가능 (권장).
 *
 * 이 모듈은 B) 를 기본 경로로 쓰고, JWS 검증은 보조로 함께 한다.
 *
 * 환경변수:
 *   APPLE_ISSUER_ID            : App Store Connect > Keys > In-App Purchase 에서 발급한 Issuer ID.
 *   APPLE_KEY_ID               : 동일 페이지에서 발급한 Key ID (10자리).
 *   APPLE_PRIVATE_KEY          : .p8 파일 내용 전체. Vercel 환경변수에 한 줄로 (개행 \n).
 *   APPLE_BUNDLE_ID            : 우리 앱의 bundle id. 기본 com.michaelkim.anima.
 *   APPLE_USE_SANDBOX          : "true" 면 Sandbox 환경에 묻는다. 기본 production.
 *   APPLE_STOREKIT_DEV_BYPASS  : 검증 스킵 (베타·로컬). 운영에서는 절대 사용 금지.
 */
import { createSign, createVerify, X509Certificate } from "node:crypto";
import { resolveDevBypass } from "@/lib/devBypass";

/**
 * Apple Root CA - G3 (공개 루트 인증서). x5c 체인의 신뢰 앵커로 핀 고정한다.
 * 출처: https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
 * SHA-256: 63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79
 * (공개 인증서이므로 코드에 임베드해도 무방 — 서버리스 번들 파일 트레이싱 이슈를 피한다.)
 */
const APPLE_ROOT_CA_G3_PEM = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----
`;

const DEV_BYPASS = resolveDevBypass("APPLE_STOREKIT_DEV_BYPASS");
const USE_SANDBOX = process.env.APPLE_USE_SANDBOX === "true";
const BUNDLE_ID = process.env.APPLE_BUNDLE_ID || "com.michaelkim.anima";

const HOST_PROD = "api.storekit.itunes.apple.com";
const HOST_SANDBOX = "api.storekit-sandbox.itunes.apple.com";

export interface AppleTransactionVerifyInput {
  /** 클라(StoreKit2) 가 보낸 signedTransactionInfo JWS. 우리는 transactionId 만 추출해 사용. */
  signedTransactionInfo?: string;
  /** 직접 transactionId 가 있다면 그대로 사용 (구독 갱신 등에서 유용). */
  transactionId?: string;
}

export interface AppleTransactionVerifyResult {
  ok: boolean;
  /** 결제 시각 (ms epoch). Apple 응답의 purchaseDate. */
  purchaseTimeMs?: number;
  /** 만료 시각 (ms epoch). 구독에만 존재. lifetime/consumable 은 undefined. */
  expiresAtMs?: number;
  /** 환불/취소 시각 (ms epoch). 존재하면 결제 무효 — ok=false 로 처리한다. */
  revokedAtMs?: number;
  /** 상품 ID. */
  productId?: string;
  /** auto-renewable subscription 의 originalTransactionId — 영구 식별자. */
  originalTransactionId?: string;
  /** 거래 환경. 운영에서 Sandbox 거래를 평생권으로 승격시키지 못하도록 라우트에서 검사한다. */
  environment?: "Production" | "Sandbox";
  reason?: string;
}

/**
 * App Store Server API 호출용 JWT 발급. ES256 (P-256) 서명.
 * Apple 문서: https://developer.apple.com/documentation/appstoreserverapi/generating_json_web_tokens_for_api_requests
 */
function signAppleJwt(): string {
  const issuerId = process.env.APPLE_ISSUER_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const privateKeyRaw = process.env.APPLE_PRIVATE_KEY;
  if (!issuerId || !keyId || !privateKeyRaw) {
    throw new Error(
      "APPLE_ISSUER_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY 환경변수 미설정.",
    );
  }
  // Vercel 환경변수는 한 줄로 저장하므로 \n 이스케이프를 실제 개행으로 복원.
  const privateKey = privateKeyRaw.includes("\\n")
    ? privateKeyRaw.replace(/\\n/g, "\n")
    : privateKeyRaw;

  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = {
    iss: issuerId,
    iat: nowSec,
    // Apple 권장: 최대 1시간. 우리는 5분으로 짧게 (요청당 새로 발급).
    exp: nowSec + 5 * 60,
    aud: "appstoreconnect-v1",
    bid: BUNDLE_ID,
  };
  const b64url = (obj: object) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  const signingInput = `${b64url(header)}.${b64url(payload)}`;
  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer
    .sign({ key: privateKey, dsaEncoding: "ieee-p1363" })
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${signingInput}.${signature}`;
}

/**
 * JWS 의 payload(JSON) 부분만 base64url-decode 해서 반환. 서명 검증은 별도.
 * Apple 의 JWS 는 헤더에 x5c 체인을 싣고 ES256 서명을 사용한다.
 */
function decodeJwsPayload<T>(jws: string): T {
  const parts = jws.split(".");
  if (parts.length !== 3) throw new Error("JWS 형식 오류");
  const json = Buffer.from(parts[1], "base64url").toString("utf8");
  return JSON.parse(json) as T;
}

/**
 * x5c 인증서 체인을 Apple Root CA - G3 까지 연결 검증하고 신뢰 가능한 leaf 를 반환한다.
 * 각 인증서가 상위 인증서 공개키로 서명됐는지 + 체인 최상위가 핀 고정된 Apple Root 로
 * 서명(또는 그 자신)됐는지 + leaf 유효기간을 확인한다. 하나라도 실패하면 null.
 *
 * 이 체인 검증이 없으면 공격자가 임의 키로 자기서명한 leaf 를 x5c 에 실어 위조 JWS 를
 * 통과시킬 수 있다(환불 알림 위조 → 정상 결제자 권한 강제 회수 DoS).
 */
function verifyCertChainToAppleRoot(x5c: string[]): X509Certificate | null {
  try {
    if (!Array.isArray(x5c) || x5c.length === 0) return null;
    const certs = x5c.map((b64) => new X509Certificate(Buffer.from(b64, "base64")));
    const root = new X509Certificate(APPLE_ROOT_CA_G3_PEM);

    // 1) 각 인증서가 바로 다음(상위) 인증서의 공개키로 서명됐는지 검증.
    for (let i = 0; i < certs.length - 1; i++) {
      if (!certs[i].verify(certs[i + 1].publicKey)) return null;
    }

    // 2) 체인 최상위가 핀 고정된 Apple Root 로 서명됐는지, 또는 Root 그 자신인지 확인.
    const top = certs[certs.length - 1];
    const chainsToRoot = top.verify(root.publicKey) || top.raw.equals(root.raw);
    if (!chainsToRoot) return null;

    // 3) leaf 유효기간 확인 (만료/미발효 인증서 거부).
    const leaf = certs[0];
    const from = Date.parse(leaf.validFrom);
    const to = Date.parse(leaf.validTo);
    if (Number.isNaN(from) || Number.isNaN(to)) return null;
    const now = Date.now();
    if (now < from || now > to) return null;

    return leaf;
  } catch {
    return null;
  }
}

/**
 * Apple JWS 의 서명 검증.
 * x5c 체인을 Apple Root CA - G3 까지 신뢰 검증한 뒤, 그렇게 검증된 leaf 인증서의
 * 공개키로만 ES256 서명을 검증한다.
 */
function verifyJwsSignature(jws: string): boolean {
  const parts = jws.split(".");
  if (parts.length !== 3) return false;
  const headerRaw = Buffer.from(parts[0], "base64url").toString("utf8");
  const header = JSON.parse(headerRaw) as { x5c?: string[]; alg?: string };
  if (header.alg !== "ES256") return false;
  if (!Array.isArray(header.x5c) || header.x5c.length === 0) return false;

  const leaf = verifyCertChainToAppleRoot(header.x5c);
  if (!leaf) return false;

  const signingInput = `${parts[0]}.${parts[1]}`;
  const sig = Buffer.from(parts[2], "base64url");
  const verifier = createVerify("SHA256");
  verifier.update(signingInput);
  verifier.end();
  return verifier.verify({ key: leaf.publicKey, dsaEncoding: "ieee-p1363" }, sig);
}

interface SignedTransactionPayload {
  transactionId?: string;
  originalTransactionId?: string;
  productId?: string;
  bundleId?: string;
  purchaseDate?: number;
  expiresDate?: number;
  revocationDate?: number;
  /** 환불 사유 코드. 0 = 의도치 않은 구매(앱 이슈 등), 1 = 기타. */
  revocationReason?: number;
  type?: string;
  environment?: "Production" | "Sandbox";
}

/** App Store Server API 가 해당 환경에 거래가 없을 때 주는 상태코드(환경 불일치 신호). */
const HTTP_NOT_FOUND = 404;

/**
 * 조회할 Apple 호스트 결정.
 *  - 거래 JWS 의 environment 를 1순위로 신뢰(TestFlight=Sandbox, 정식=Production).
 *  - environment 를 모르면 APPLE_USE_SANDBOX 플래그로 폴백.
 */
function pickHost(env: SignedTransactionPayload["environment"]): string {
  if (env === "Sandbox") return HOST_SANDBOX;
  if (env === "Production") return HOST_PROD;
  return USE_SANDBOX ? HOST_SANDBOX : HOST_PROD;
}

interface FetchedTransaction {
  ok: boolean;
  status: number;
  signedTransactionInfo?: string;
}

/** Get Transaction Info 호출 — 권한 있는 transactionId 만 응답. 네트워크 결과를 정규화해 반환. */
async function fetchSignedTransaction(
  transactionId: string,
  host: string,
  jwt: string,
): Promise<FetchedTransaction> {
  const url = `https://${host}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) return { ok: false, status: res.status };
  const body = (await res.json()) as { signedTransactionInfo?: string };
  return { ok: true, status: res.status, signedTransactionInfo: body.signedTransactionInfo };
}

/**
 * App Store Server Notification V2 의 디코드된 페이로드(responseBodyV2DecodedPayload).
 * Apple 문서: https://developer.apple.com/documentation/appstoreservernotifications/responsebodyv2decodedpayload
 */
interface AppleNotificationPayload {
  notificationType?: string;
  subtype?: string;
  notificationUUID?: string;
  version?: string;
  signedDate?: number;
  data?: {
    appAppleId?: number;
    bundleId?: string;
    bundleVersion?: string;
    environment?: "Production" | "Sandbox";
    /** 거래 정보 JWS — REFUND/REVOKE 등 거래 관련 알림에 존재. */
    signedTransactionInfo?: string;
    /** 갱신 정보 JWS — 구독 갱신 관련 알림에 존재. */
    signedRenewalInfo?: string;
  };
}

export interface AppleNotificationResult {
  ok: boolean;
  reason?: string;
  /** 알림 종류 (REFUND, REVOKE, DID_RENEW, TEST 등). */
  notificationType?: string;
  subtype?: string;
  notificationUUID?: string;
  environment?: "Production" | "Sandbox";
  bundleId?: string;
  /** 거래 정보 — signedTransactionInfo 가 있을 때만 존재. */
  transaction?: {
    originalTransactionId?: string;
    transactionId?: string;
    productId?: string;
    revocationDate?: number;
    revocationReason?: number;
  };
  signedDate?: number;
}

/**
 * App Store Server Notification V2 의 signedPayload 를 검증·디코드한다.
 *
 * 이 알림은 Apple → 우리 서버로 직접 푸시되며, 인증은 공유 토큰이 아니라 Apple 이 서명한
 * JWS 그 자체다. 따라서:
 *   1) 바깥 알림 JWS 의 서명을 검증 (위조 차단)
 *   2) data.signedTransactionInfo(거래 JWS) 가 있으면 그 서명도 별도 검증 (이중 서명)
 *   3) 두 페이로드의 bundleId 가 우리 앱과 일치하는지 확인 (타 앱 알림 차단)
 *
 * verifyJwsSignature 는 x5c 체인을 Apple Root CA - G3 까지 신뢰 검증한 뒤 leaf 공개키로
 * 서명을 확인하므로, 공격자가 자기서명 leaf 로 위조한 알림은 통과하지 못한다.
 */
export function verifyAppleNotification(signedPayload: string): AppleNotificationResult {
  try {
    const sp = (signedPayload || "").trim();
    if (!sp) return { ok: false, reason: "signedPayload 누락" };

    // 1) 바깥 알림 JWS 서명 검증.
    if (!verifyJwsSignature(sp)) {
      return { ok: false, reason: "알림 JWS 서명 검증 실패" };
    }
    const payload = decodeJwsPayload<AppleNotificationPayload>(sp);
    const data = payload.data;

    // 3-a) 알림 레벨 bundleId 검증 — 누락도 거부(타 앱 알림/필드 생략 우회 차단).
    if (!data?.bundleId || data.bundleId !== BUNDLE_ID) {
      return { ok: false, reason: `bundleId 불일치: ${data?.bundleId ?? "누락"}` };
    }

    // 2) 거래 JWS 가 있으면 서명·bundleId 를 한 번 더 검증하고 디코드.
    let transaction: AppleNotificationResult["transaction"];
    if (data.signedTransactionInfo) {
      if (!verifyJwsSignature(data.signedTransactionInfo)) {
        return { ok: false, reason: "거래 JWS 서명 검증 실패" };
      }
      const tx = decodeJwsPayload<SignedTransactionPayload>(data.signedTransactionInfo);
      if (!tx.bundleId || tx.bundleId !== BUNDLE_ID) {
        return { ok: false, reason: `거래 bundleId 불일치: ${tx.bundleId ?? "누락"}` };
      }
      transaction = {
        originalTransactionId: tx.originalTransactionId,
        transactionId: tx.transactionId,
        productId: tx.productId,
        revocationDate: tx.revocationDate,
        revocationReason: tx.revocationReason,
      };
    }

    return {
      ok: true,
      notificationType: payload.notificationType,
      subtype: payload.subtype,
      notificationUUID: payload.notificationUUID,
      environment: data?.environment,
      bundleId: data?.bundleId,
      transaction,
      signedDate: payload.signedDate,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `알림 검증 예외: ${msg}` };
  }
}

/**
 * StoreKit2 영수증 검증의 주 진입점.
 */
export async function verifyAppleTransaction(
  input: AppleTransactionVerifyInput,
): Promise<AppleTransactionVerifyResult> {
  if (DEV_BYPASS) {
    return {
      ok: true,
      purchaseTimeMs: Date.now(),
      productId: "anima_lifetime",
      originalTransactionId: "dev-bypass",
      reason: "APPLE_STOREKIT_DEV_BYPASS=true (운영 금지)",
    };
  }

  try {
    let transactionId = input.transactionId?.trim();
    let envFromClient: SignedTransactionPayload["environment"];
    // 클라가 보낸 signedTransaction(JWS) 이 있으면 항상 서명을 검증하고
    // transactionId 와 environment(Sandbox/Production) 를 추출한다.
    // (transactionId 가 함께 와도 environment 를 읽어야 올바른 호스트를 고를 수 있다.)
    if (input.signedTransactionInfo) {
      if (!verifyJwsSignature(input.signedTransactionInfo)) {
        return { ok: false, reason: "JWS 서명 검증 실패" };
      }
      const payload = decodeJwsPayload<SignedTransactionPayload>(
        input.signedTransactionInfo,
      );
      if (!transactionId) transactionId = payload.transactionId;
      envFromClient = payload.environment;
    }
    if (!transactionId) {
      return { ok: false, reason: "transactionId 누락" };
    }

    // App Store Server API 의 Get Transaction Info 로 거래를 권위 있게 확정한다.
    // 호스트는 거래 environment 로 고르되, 환경이 어긋나 404 가 나면(예: environment 미상인
    // transactionId-only 요청) 반대 환경으로 한 번 더 시도한다 — TestFlight(샌드박스)와
    // 정식 출시(운영) 모두 플래그 변경 없이 자동 동작.
    const jwt = signAppleJwt();
    const primaryHost = pickHost(envFromClient);
    let fetched = await fetchSignedTransaction(transactionId, primaryHost, jwt);
    if (!fetched.ok && fetched.status === HTTP_NOT_FOUND) {
      const otherHost = primaryHost === HOST_PROD ? HOST_SANDBOX : HOST_PROD;
      fetched = await fetchSignedTransaction(transactionId, otherHost, jwt);
    }
    if (!fetched.ok) {
      return { ok: false, reason: `Apple API ${fetched.status}` };
    }
    if (!fetched.signedTransactionInfo) {
      return { ok: false, reason: "signedTransactionInfo 누락" };
    }
    if (!verifyJwsSignature(fetched.signedTransactionInfo)) {
      return { ok: false, reason: "Apple 응답 JWS 서명 검증 실패" };
    }
    const payload = decodeJwsPayload<SignedTransactionPayload>(
      fetched.signedTransactionInfo,
    );

    // 우리 앱의 영수증이 맞는지 확인.
    if (payload.bundleId !== BUNDLE_ID) {
      return { ok: false, reason: `bundleId 불일치: ${payload.bundleId}` };
    }
    // 환불/취소 처리됐는지 확인 — 결제자 권한 박탈 사유.
    if (payload.revocationDate && payload.revocationDate > 0) {
      return {
        ok: false,
        reason: "환불/취소된 거래",
        revokedAtMs: payload.revocationDate,
        productId: payload.productId,
      };
    }

    return {
      ok: true,
      purchaseTimeMs: payload.purchaseDate,
      expiresAtMs: payload.expiresDate,
      productId: payload.productId,
      originalTransactionId: payload.originalTransactionId,
      environment: payload.environment,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `Apple 영수증 검증 예외: ${msg}` };
  }
}
