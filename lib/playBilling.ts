/**
 * Google Play Developer API 영수증 검증.
 *
 * 안드로이드 BillingClient 가 발급한 purchaseToken 이 실제로 우리 앱의 정상 결제인지
 * 서버에서 직접 Google 에 물어보고 확정한다. 이 검증을 거치지 않으면 다음 공격 가능:
 *   - APK 사이드로딩 + 가짜 영수증 위조
 *   - 환불 후에도 결제자처럼 행세
 *   - 다른 앱의 영수증을 우리 앱에 제출
 *
 * 환경변수:
 *   GOOGLE_PLAY_SA_KEY            : 서비스 계정 JSON 전체 문자열 (Vercel 등은 한 줄로)
 *                                   안드로이드 출판사 권한이 부여된 SA 여야 함.
 *   PLAY_BILLING_DEV_BYPASS=true  : 검증을 스킵하고 항상 ok 반환 (베타·로컬 테스트 용)
 */
import { google } from "googleapis";

export interface PurchaseVerifyResult {
  ok: boolean;
  /** Google 응답의 purchaseTimeMillis (ms) */
  purchaseTimeMs?: number;
  /** 0 = Purchased, 1 = Canceled, 2 = Pending */
  purchaseState?: number;
  /** 0 = Yet to be acknowledged, 1 = Acknowledged */
  acknowledgementState?: number;
  /** 실패 사유 (디버그/로깅용) */
  reason?: string;
}

export interface VerifyPurchaseInput {
  packageName: string;
  productId: string;
  purchaseToken: string;
}

const DEV_BYPASS = process.env.PLAY_BILLING_DEV_BYPASS === "true";

let cachedPublisher: ReturnType<typeof google.androidpublisher> | null = null;

function getPublisher() {
  if (cachedPublisher) return cachedPublisher;
  const raw = process.env.GOOGLE_PLAY_SA_KEY;
  if (!raw) {
    throw new Error(
      "GOOGLE_PLAY_SA_KEY 미설정. 운영에서는 서비스 계정 JSON 을 설정하거나 PLAY_BILLING_DEV_BYPASS=true 로 우회해야 합니다.",
    );
  }
  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      "GOOGLE_PLAY_SA_KEY 가 유효한 JSON 이 아닙니다: " +
        (err instanceof Error ? err.message : String(err)),
    );
  }
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  cachedPublisher = google.androidpublisher({ version: "v3", auth });
  return cachedPublisher;
}

export async function verifyAndroidPurchase(
  input: VerifyPurchaseInput,
): Promise<PurchaseVerifyResult> {
  if (DEV_BYPASS) {
    return {
      ok: true,
      purchaseTimeMs: Date.now(),
      purchaseState: 0,
      acknowledgementState: 1,
      reason: "dev_bypass",
    };
  }

  try {
    const publisher = getPublisher();
    const res = await publisher.purchases.products.get({
      packageName: input.packageName,
      productId: input.productId,
      token: input.purchaseToken,
    });
    const data = res.data;
    const purchaseState = typeof data.purchaseState === "number" ? data.purchaseState : 1;
    const acknowledgementState =
      typeof data.acknowledgementState === "number" ? data.acknowledgementState : 0;
    const purchaseTimeMs = data.purchaseTimeMillis
      ? Number(data.purchaseTimeMillis)
      : undefined;

    // purchaseState: 0 = Purchased, 1 = Canceled, 2 = Pending
    // 2 (Pending) 도 ok=false 로 본다 — 결제 확정 후에만 paid 부여.
    const ok = purchaseState === 0;
    return {
      ok,
      purchaseTimeMs,
      purchaseState,
      acknowledgementState,
      reason: ok
        ? undefined
        : purchaseState === 1
          ? "canceled"
          : purchaseState === 2
            ? "pending"
            : `purchaseState=${purchaseState}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Google API 의 invalid token / not found 는 위조·만료된 영수증 신호.
    return { ok: false, reason: msg };
  }
}
