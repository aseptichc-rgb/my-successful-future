/**
 * Google Play Developer API 영수증 검증.
 *
 * 안드로이드 BillingClient 가 발급한 purchaseToken 이 실제로 우리 앱의 정상 결제인지
 * 서버에서 직접 Google 에 물어보고 확정한다. 이 검증을 거치지 않으면 다음 공격 가능:
 *   - APK 사이드로딩 + 가짜 영수증 위조
 *   - 환불 후에도 결제자처럼 행세
 *   - 다른 앱의 영수증을 우리 앱에 제출
 *
 * 운영 구현 (3단계에서 교체):
 *   import { google } from "googleapis";
 *   const auth = new google.auth.GoogleAuth({
 *     credentials: JSON.parse(process.env.GOOGLE_PLAY_SA_KEY!),
 *     scopes: ["https://www.googleapis.com/auth/androidpublisher"],
 *   });
 *   const publisher = google.androidpublisher({ version: "v3", auth });
 *   const res = await publisher.purchases.products.get({
 *     packageName, productId, token: purchaseToken,
 *   });
 *   const ok = res.data.purchaseState === 0 // 0=Purchased, 1=Canceled, 2=Pending
 *           && res.data.acknowledgementState === 1; // 1=Acknowledged
 *
 * 현재는 스텁 — 환경변수로 dev 우회만 제공.
 * 실제 통합 시 다음 환경변수가 필요:
 *   GOOGLE_PLAY_SA_KEY            : 서비스 계정 JSON 전체 (Vercel 등은 단일 라인 인코딩)
 *   ANDROID_PACKAGE_NAME          : "com.michaelkim.anima"
 *   ANDROID_LIFETIME_PRODUCT_ID   : 결제 상품 ID (예: "anima_lifetime")
 */
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

/**
 * dev 우회 환경변수.
 * - true: 어떤 입력이든 ok 를 반환 (베타·로컬 테스트 용)
 * - 미설정: 실제 검증 시도. 운영 구현 미완료 시 throw.
 */
const DEV_BYPASS = process.env.PLAY_BILLING_DEV_BYPASS === "true";

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

  // TODO(step3): googleapis 의 androidpublisher v3 통합으로 교체.
  // 현재는 dev_bypass 가 꺼진 환경에서 호출되면 명시적으로 실패시켜
  // "결제 검증이 운영 구현되기 전에는 paid claim 이 발급되지 않는다" 를 보증한다.
  throw new Error(
    "verifyAndroidPurchase: 운영 구현 미완료. " +
      "PLAY_BILLING_DEV_BYPASS=true 로 임시 우회하거나 Google Play Developer API 통합을 마쳐주세요.",
  );
}
