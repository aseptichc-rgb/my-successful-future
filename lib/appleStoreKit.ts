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
import { createSign, createPublicKey, createVerify } from "node:crypto";

const DEV_BYPASS = process.env.APPLE_STOREKIT_DEV_BYPASS === "true";
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
 * Apple JWS 의 서명 검증.
 * x5c 헤더에 임베드된 leaf 인증서의 공개키로 ES256 서명을 검증한다.
 * 인증서 체인 자체의 신뢰성 검증(Apple Root CA 까지 연결되는지) 은 운영에서 별도로 추가 권장.
 */
function verifyJwsSignature(jws: string): boolean {
  const parts = jws.split(".");
  if (parts.length !== 3) return false;
  const headerRaw = Buffer.from(parts[0], "base64url").toString("utf8");
  const header = JSON.parse(headerRaw) as { x5c?: string[]; alg?: string };
  if (!Array.isArray(header.x5c) || header.x5c.length === 0) return false;
  if (header.alg !== "ES256") return false;
  const leafDer = Buffer.from(header.x5c[0], "base64");
  // PEM 으로 감싸 createPublicKey 가 받아들이도록.
  const leafPem =
    "-----BEGIN CERTIFICATE-----\n" +
    leafDer.toString("base64").match(/.{1,64}/g)!.join("\n") +
    "\n-----END CERTIFICATE-----\n";
  const pubKey = createPublicKey(leafPem);
  const signingInput = `${parts[0]}.${parts[1]}`;
  const sig = Buffer.from(parts[2], "base64url");
  const verifier = createVerify("SHA256");
  verifier.update(signingInput);
  verifier.end();
  return verifier.verify({ key: pubKey, dsaEncoding: "ieee-p1363" }, sig);
}

interface SignedTransactionPayload {
  transactionId?: string;
  originalTransactionId?: string;
  productId?: string;
  bundleId?: string;
  purchaseDate?: number;
  expiresDate?: number;
  revocationDate?: number;
  type?: string;
  environment?: "Production" | "Sandbox";
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
    // signedTransactionInfo 가 오면 JWS 서명을 한 번 검증하고 transactionId 를 추출.
    if (!transactionId && input.signedTransactionInfo) {
      if (!verifyJwsSignature(input.signedTransactionInfo)) {
        return { ok: false, reason: "JWS 서명 검증 실패" };
      }
      const payload = decodeJwsPayload<SignedTransactionPayload>(
        input.signedTransactionInfo,
      );
      transactionId = payload.transactionId;
    }
    if (!transactionId) {
      return { ok: false, reason: "transactionId 누락" };
    }

    // App Store Server API 의 Get Transaction Info — 권한 있는 transactionId 만 응답.
    const host = USE_SANDBOX ? HOST_SANDBOX : HOST_PROD;
    const url = `https://${host}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`;
    const jwt = signAppleJwt();
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (!res.ok) {
      return { ok: false, reason: `Apple API ${res.status}` };
    }
    const body = (await res.json()) as { signedTransactionInfo?: string };
    if (!body.signedTransactionInfo) {
      return { ok: false, reason: "signedTransactionInfo 누락" };
    }
    if (!verifyJwsSignature(body.signedTransactionInfo)) {
      return { ok: false, reason: "Apple 응답 JWS 서명 검증 실패" };
    }
    const payload = decodeJwsPayload<SignedTransactionPayload>(
      body.signedTransactionInfo,
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
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `Apple 영수증 검증 예외: ${msg}` };
  }
}
