/**
 * 안드로이드 인앱결제 (TWA Digital Goods API + Payment Request).
 *
 * iOS(lib/iosPurchase.ts)가 Capacitor StoreKitBridge 로 결제하듯, 안드로이드는 TWA 환경에서
 * 브라우저 표준 Digital Goods API + Payment Request 로 Play Billing 을 직접 호출한다.
 * 네이티브 측은 androidbrowserhelper:billing 의 PaymentActivity / PaymentService /
 * DelegationService(+ DigitalGoodsRequestHandler) 가 위임 처리한다(AndroidManifest 참고).
 *
 * 흐름:
 *   1) getDigitalGoodsService('https://play.google.com/billing') 로 서비스 획득
 *   2) PaymentRequest 로 Play 결제 시트를 띄우고 purchaseToken 수신
 *   3) purchaseToken 을 /api/entitlement/verify 로 보내 서버가 Google Play Developer API 로
 *      재검증하고 paid claim(+customToken) 부여
 *   4) customToken 으로 재로그인 → 권한 반영, service.acknowledge() 로 결제 승인
 *      (3일 내 미승인 시 Play 가 자동 환불하므로 검증 직후 반드시 승인)
 *
 * Digital Goods API 가 없는 환경(웹 브라우저 / iOS / SSR / 구버전 Chrome)에선 모든 함수가
 * 안전하게 no-op/실패로 떨어진다 — iOS 모듈과 동일하게 PurchaseOutcome 으로 정규화해 반환.
 */
import { authedFetch } from "@/lib/authedFetch";
import { signInWithCustomTokenClient } from "@/lib/firebase";
import type { PurchaseOutcome } from "@/lib/iosPurchase";

/** 평생 이용권 상품 ID — Play Console 인앱상품 + 서버 ANDROID_LIFETIME_PRODUCT_ID 와 일치해야 함. */
export const ANIMA_LIFETIME_PRODUCT_ID = "anima_lifetime";
/** 패키지명 — 서버 verify 가 ANDROID_PACKAGE_NAME 과 대조해 위장 결제를 차단한다. */
const PACKAGE_NAME = "com.michaelkim.anima";
/** Play Billing 의 Payment Request 결제수단 식별자(표준 상수). */
const PLAY_BILLING_METHOD = "https://play.google.com/billing";

interface ItemPrice {
  currency: string;
  value: string;
}
interface ItemDetails {
  itemId: string;
  title?: string;
  price: ItemPrice;
}
interface PurchaseRecord {
  itemId: string;
  purchaseToken: string;
}
interface DigitalGoodsService {
  getDetails(itemIds: string[]): Promise<ItemDetails[]>;
  listPurchases(): Promise<PurchaseRecord[]>;
  acknowledge?(purchaseToken: string, makeAvailableAgain: string): Promise<void>;
}

declare global {
  interface Window {
    getDigitalGoodsService?: (serviceProvider: string) => Promise<DigitalGoodsService>;
  }
}

/** 이 환경에서 TWA Digital Goods 결제를 쓸 수 있는지. SSR/웹/iOS/구버전 Chrome 에선 false. */
export function isAndroidPurchaseAvailable(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.getDigitalGoodsService === "function";
  } catch {
    return false;
  }
}

async function acquireService(): Promise<DigitalGoodsService | null> {
  if (!isAndroidPurchaseAvailable()) return null;
  try {
    return await window.getDigitalGoodsService!(PLAY_BILLING_METHOD);
  } catch (err) {
    console.warn("[androidPurchase] Digital Goods 서비스 획득 실패:", err);
    return null;
  }
}

function formatPrice(price: ItemPrice): string {
  try {
    const num = Number(price.value);
    if (Number.isFinite(num)) {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: price.currency,
      }).format(num);
    }
  } catch {
    // Intl 실패(미지원 통화 등) — 원시 문자열로 폴백.
  }
  return `${price.value} ${price.currency}`;
}

/** 페이월 표시용 가격 문자열. 미지원/조회 실패 시 null. */
export async function getAndroidProPrice(
  productId: string = ANIMA_LIFETIME_PRODUCT_ID,
): Promise<string | null> {
  const service = await acquireService();
  if (!service) return null;
  try {
    const details = await service.getDetails([productId]);
    const item = details.find((d) => d.itemId === productId);
    return item?.price ? formatPrice(item.price) : null;
  } catch (err) {
    console.warn("[androidPurchase] 가격 조회 실패:", err);
    return null;
  }
}

/**
 * 영수증(purchaseToken)을 서버에 보내 검증·권한 부여를 마치고, 결제를 승인(acknowledge)한다.
 * @throws 검증 실패(서버 4xx/5xx)는 메시지와 함께 throw — 호출부가 outcome 으로 분류한다.
 */
async function verifyAndApply(
  purchaseToken: string,
  productId: string,
  service: DigitalGoodsService,
): Promise<void> {
  const res = await authedFetch("/api/entitlement/verify", {
    method: "POST",
    body: JSON.stringify({ purchaseToken, productId, packageName: PACKAGE_NAME }),
  });
  if (!res.ok) {
    let msg = "결제 검증에 실패했습니다.";
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) msg = body.error;
    } catch {
      // 본문 파싱 실패 — 기본 메시지 유지.
    }
    throw new Error(msg);
  }

  try {
    const data = (await res.json()) as { customToken?: string };
    if (data.customToken) {
      // 재로그인 → onIdTokenChanged 가 새 claim(paid) 으로 세션을 갱신한다.
      await signInWithCustomTokenClient(data.customToken);
    }
  } catch (err) {
    // 토큰 적용 실패는 다음 토큰 갱신 사이클에 봉합 — 승인까지는 진행(권한은 서버에 박혔음).
    console.warn("[androidPurchase] customToken 적용 실패:", err);
  }

  // 3일 내 미승인 시 Play 자동 환불 — 검증 성공 후 반드시 승인. 미지원 브라우저는 조용히 건너뜀.
  try {
    if (typeof service.acknowledge === "function") {
      await service.acknowledge(purchaseToken, "onetime");
    }
  } catch (err) {
    console.warn("[androidPurchase] acknowledge 실패(서버 검증은 완료):", err);
  }
}

/** 사용자가 결제 시트를 닫으면 AbortError — 실패가 아니라 정상 취소로 분류. */
function isUserAbort(err: unknown): boolean {
  return (err as { name?: string } | null)?.name === "AbortError";
}

/**
 * 평생 이용권 구매 전체 플로우(결제 → 서버 검증 → 토큰 갱신 → 승인).
 * 어떤 단계도 throw 하지 않고 PurchaseOutcome 으로 정규화해 반환한다(iOS 모듈과 동일).
 */
export async function purchaseAndroidPro(
  productId: string = ANIMA_LIFETIME_PRODUCT_ID,
): Promise<PurchaseOutcome> {
  const service = await acquireService();
  if (!service) {
    return { status: "error", message: "이 기기에서는 결제를 사용할 수 없습니다." };
  }

  let item: ItemDetails | undefined;
  try {
    const details = await service.getDetails([productId]);
    item = details.find((d) => d.itemId === productId);
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }
  if (!item) {
    return { status: "error", message: `상품 '${productId}' 을(를) Play 에서 찾을 수 없습니다.` };
  }

  let response: PaymentResponse;
  try {
    const request = new PaymentRequest(
      [{ supportedMethods: PLAY_BILLING_METHOD, data: { sku: productId } }],
      {
        total: {
          label: item.title || "Anima 평생 이용권",
          amount: { currency: item.price.currency, value: item.price.value },
        },
      },
    );
    response = await request.show();
  } catch (err) {
    if (isUserAbort(err)) return { status: "cancelled" };
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }

  const purchaseToken = (response.details as { purchaseToken?: string } | null)?.purchaseToken;
  if (!purchaseToken) {
    await response.complete("fail").catch(() => undefined);
    return { status: "error", message: "결제 토큰을 받지 못했습니다." };
  }

  try {
    await verifyAndApply(purchaseToken, productId, service);
    await response.complete("success").catch(() => undefined);
    return { status: "success", productId };
  } catch (err) {
    await response.complete("fail").catch(() => undefined);
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * 기기 변경/재설치 후 과거 구매를 복원한다. listPurchases 로 보유 영수증을 찾아 서버 재검증.
 */
export async function restoreAndroidPro(
  productId: string = ANIMA_LIFETIME_PRODUCT_ID,
): Promise<PurchaseOutcome> {
  const service = await acquireService();
  if (!service) {
    return { status: "error", message: "이 기기에서는 결제를 사용할 수 없습니다." };
  }
  try {
    const purchases = await service.listPurchases();
    const owned = purchases.find((p) => p.itemId === productId);
    if (!owned?.purchaseToken) {
      return { status: "error", message: "복원할 구매 내역이 없습니다." };
    }
    await verifyAndApply(owned.purchaseToken, productId, service);
    return { status: "success", productId };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
