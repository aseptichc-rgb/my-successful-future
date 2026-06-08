/**
 * iOS 인앱결제 브릿지 (Capacitor 네이티브 플러그인 StoreKitBridge 래퍼).
 *
 * 흐름:
 *   1) StoreKitBridge.purchase() 가 네이티브 StoreKit 2 결제 시트를 띄우고 JWS 영수증을 받는다.
 *   2) 그 JWS 를 /api/entitlement/verify-apple 로 보내 서버가 Apple StoreKit Server API 로
 *      재검증하고 Firebase custom claim(ent) 을 박는다.
 *   3) 서버가 돌려준 customToken 으로 재로그인 → 다음 ID 토큰부터 권한이 반영된다.
 *   4) 서버 검증·권한 부여가 끝난 뒤에만 StoreKitBridge.finishTransaction() 으로 마무리한다.
 *
 * 웹/안드로이드/SSR 에서는 플러그인이 없으므로 모든 함수가 안전하게 no-op/실패로 떨어진다
 * (안드로이드는 네이티브 BillingClient 가 별도로 담당 — lib/playBilling.ts).
 */
import { Capacitor, registerPlugin } from "@capacitor/core";
import { authedFetch } from "@/lib/authedFetch";
import { signInWithCustomTokenClient } from "@/lib/firebase";

/** 평생 이용권 상품 ID — 서버 verify-apple 의 APPLE_LIFETIME_PRODUCT_IDS 기본값과 일치해야 한다. */
export const ANIMA_LIFETIME_PRODUCT_ID = "anima_lifetime";

interface IosProduct {
  id: string;
  displayName: string;
  description: string;
  /** 로케일/통화가 적용된 표시용 가격 문자열(예: "₩9,900"). */
  displayPrice: string;
}

interface PurchasePayload {
  transactionId: string;
  jws: string;
  productId: string;
}

interface RestorePayload {
  restored: boolean;
  transactionId?: string;
  jws?: string;
  productId?: string;
}

interface StoreKitBridgePlugin {
  getProducts(options: { productIds: string[] }): Promise<{ products: IosProduct[] }>;
  purchase(options: { productId: string }): Promise<PurchasePayload>;
  restore(): Promise<RestorePayload>;
  finishTransaction(options: { transactionId: string }): Promise<void>;
  addListener(
    eventName: "transactionUpdate",
    callback: (payload: PurchasePayload) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

const StoreKitBridge = registerPlugin<StoreKitBridgePlugin>("StoreKitBridge");

/** iOS 네이티브에서 StoreKitBridge 를 쓸 수 있는지. SSR/웹/안드로이드/플러그인 미빌드 시 false. */
export function isIosPurchaseAvailable(): boolean {
  try {
    return (
      Capacitor.getPlatform() === "ios" &&
      Capacitor.isPluginAvailable("StoreKitBridge")
    );
  } catch {
    return false;
  }
}

/**
 * 결제/복원 결과 — 호출부(UI)가 분기하기 쉽도록 정규화한 합 타입.
 *  - cancelled 는 실패가 아니라 사용자의 정상 취소이므로 토스트 없이 조용히 무시할 수 있게 구분.
 */
export type PurchaseOutcome =
  | { status: "success"; productId: string }
  | { status: "cancelled" }
  | { status: "pending" }
  | { status: "error"; message: string };

/**
 * 영수증(JWS)을 서버에 보내 검증·권한 부여를 마치고, 성공 시에만 트랜잭션을 finish 한다.
 * @throws 검증 실패(서버 4xx/5xx)는 메시지와 함께 throw — 호출부가 classifyError 로 분류한다.
 */
async function verifyAndApply(payload: PurchasePayload): Promise<void> {
  const res = await authedFetch("/api/entitlement/verify-apple", {
    method: "POST",
    body: JSON.stringify({
      signedTransactionInfo: payload.jws,
      transactionId: payload.transactionId,
      productId: payload.productId,
    }),
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
      // 재로그인 → onIdTokenChanged 가 새 claim(ent) 으로 세션을 갱신한다.
      await signInWithCustomTokenClient(data.customToken);
    }
  } catch (err) {
    // 토큰 적용 실패는 다음 토큰 갱신 사이클에 봉합 — finish 까지는 진행한다(권한은 서버에 박혔음).
    console.warn("[iosPurchase] customToken 적용 실패:", err);
  }

  // 서버 검증·권한 부여 완료 후에만 트랜잭션 마무리.
  try {
    await StoreKitBridge.finishTransaction({ transactionId: payload.transactionId });
  } catch (err) {
    console.warn("[iosPurchase] finishTransaction 실패:", err);
  }
}

/** unknown 에러를 PurchaseOutcome 으로 분류 — 취소/보류/일반오류 구분. */
function classifyError(err: unknown): PurchaseOutcome {
  const code = (err as { code?: string } | null)?.code;
  if (code === "cancelled") return { status: "cancelled" };
  if (code === "pending") return { status: "pending" };
  const message = err instanceof Error ? err.message : String(err);
  if (message.toLowerCase().includes("cancel")) return { status: "cancelled" };
  return { status: "error", message };
}

/**
 * 페이월 표시용 가격 문자열을 가져온다. 플러그인이 없거나 조회 실패 시 null.
 */
export async function getIosProPrice(
  productId: string = ANIMA_LIFETIME_PRODUCT_ID,
): Promise<string | null> {
  if (!isIosPurchaseAvailable()) return null;
  try {
    const { products } = await StoreKitBridge.getProducts({ productIds: [productId] });
    return products.find((p) => p.id === productId)?.displayPrice ?? null;
  } catch (err) {
    console.warn("[iosPurchase] 가격 조회 실패:", err);
    return null;
  }
}

/**
 * 평생 이용권 구매 전체 플로우(결제 → 서버 검증 → 토큰 갱신 → finish).
 * 어떤 단계도 throw 하지 않고 PurchaseOutcome 으로 정규화해 반환한다.
 */
export async function purchaseIosPro(
  productId: string = ANIMA_LIFETIME_PRODUCT_ID,
): Promise<PurchaseOutcome> {
  if (!isIosPurchaseAvailable()) {
    return { status: "error", message: "이 기기에서는 결제를 사용할 수 없습니다." };
  }
  try {
    const payload = await StoreKitBridge.purchase({ productId });
    await verifyAndApply(payload);
    return { status: "success", productId: payload.productId };
  } catch (err) {
    return classifyError(err);
  }
}

/**
 * 기기 변경/재설치 후 과거 구매를 복원한다(Apple 비소모성 상품 필수 기능 — Guideline 3.1.1).
 */
export async function restoreIosPro(): Promise<PurchaseOutcome> {
  if (!isIosPurchaseAvailable()) {
    return { status: "error", message: "이 기기에서는 결제를 사용할 수 없습니다." };
  }
  try {
    const result = await StoreKitBridge.restore();
    if (!result.restored || !result.jws || !result.transactionId || !result.productId) {
      return { status: "error", message: "복원할 구매 내역이 없습니다." };
    }
    await verifyAndApply({
      transactionId: result.transactionId,
      jws: result.jws,
      productId: result.productId,
    });
    return { status: "success", productId: result.productId };
  } catch (err) {
    return classifyError(err);
  }
}

let listenerAttached = false;

/**
 * 앱 외부(Ask to Buy 승인, 다른 기기 구매, 중단된 결제)에서 도착하는 트랜잭션을 구독해
 * 동일한 서버 검증 경로로 봉합한다. 멱등 — 여러 번 호출해도 리스너는 한 번만 붙는다.
 */
export function initIosPurchaseListener(): void {
  if (!isIosPurchaseAvailable() || listenerAttached) return;
  listenerAttached = true;
  try {
    void StoreKitBridge.addListener("transactionUpdate", (payload) => {
      void verifyAndApply(payload).catch((err) => {
        console.warn("[iosPurchase] 외부 트랜잭션 검증 실패:", err);
      });
    });
  } catch (err) {
    listenerAttached = false;
    console.warn("[iosPurchase] 트랜잭션 리스너 등록 실패:", err);
  }
}
