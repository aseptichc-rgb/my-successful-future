/**
 * 스토어 리뷰 요청 — 웹 → 네이티브 브릿지 (플랫폼 분기).
 *
 *   iOS     Capacitor 플러그인 StoreReviewBridge.requestReview
 *           (ios-templates/plugin/StoreReviewBridgePlugin.swift → SKStoreReviewController).
 *           iOS 는 server.url 모드라 웹이 바이너리보다 먼저 배포된다 — 플러그인이 없는 구 바이너리에서
 *           호출이 reject 되면 App Store 리뷰 작성 페이지(write-review 딥링크)로 폴백한다.
 *   Android TWA 브릿지 인텐트 anima://review → ReviewBridgeActivity 가 Play In-App Review 시트를
 *           띄운다. 인텐트는 사용자 제스처 콜스택 안에서만 발화되므로(lib/widgetBridge 의
 *           user-activation 게이트) 반드시 버튼 onClick 에서 첫 await 전에 호출해야 한다.
 *   그 외   no-op. 자격 판정(lib/storeReview)이 isStoreReviewAvailable 로 먼저 거른다.
 *
 * 두 스토어 모두 인앱 리뷰 시트를 "띄울지" 는 OS 가 정한다(빈도 제한). 그래서 호출 결과를
 * 성공/실패로 해석하지 않고, 어떤 실패도 throw 하지 않는다 — 카드는 탭 즉시 사라진다.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";
import { APP_STORE_URL } from "@/lib/constants/storeLinks";
import { isAndroidApp, notifyAndroidStoreReview } from "@/lib/widgetBridge";

interface StoreReviewBridgePlugin {
  requestReview(): Promise<void>;
}

const StoreReviewBridge = registerPlugin<StoreReviewBridgePlugin>("StoreReviewBridge");

/** App Store 리뷰 작성 화면 딥링크 — Apple 이 문서화한 `action=write-review` 쿼리. */
export const APP_STORE_WRITE_REVIEW_URL = `${APP_STORE_URL}?action=write-review`;

/**
 * iOS 네이티브 앱인가. 플랫폼만 보고 게이트한다 — isPluginAvailable 은 원격(server.url) 모드에서
 * 거짓 음성을 내는 회귀가 있어 쓰지 않는다(lib/iosWidget.ts 와 동일 정책).
 */
function isIosApp(): boolean {
  try {
    return Capacitor.getPlatform() === "ios";
  } catch {
    return false;
  }
}

/** 리뷰를 남길 스토어가 있는 환경인가 — 카드 자격 판정(lib/storeReview)의 inApp 입력. */
export function isStoreReviewAvailable(): boolean {
  return isIosApp() || isAndroidApp();
}

/**
 * 인앱 리뷰 흐름을 요청한다. 반드시 사용자 탭 핸들러에서 첫 await 전에 부를 것 —
 * Android 인텐트 발화는 이 함수의 동기 구간(첫 await 전)에서 끝난다.
 */
export async function requestStoreReview(): Promise<void> {
  if (isIosApp()) {
    await requestIosReview();
    return;
  }
  if (isAndroidApp()) {
    notifyAndroidStoreReview();
  }
}

async function requestIosReview(): Promise<void> {
  try {
    await StoreReviewBridge.requestReview();
  } catch (err) {
    // 플러그인 미탑재(구 바이너리) 등 — 스토어 리뷰 페이지로 보내 요청 자체는 살린다.
    console.warn("[storeReview] 네이티브 리뷰 요청 실패 — App Store 리뷰 페이지로 폴백:", err);
    try {
      window.open(APP_STORE_WRITE_REVIEW_URL, "_blank", "noopener");
    } catch {
      // window 접근 불가 — 리뷰는 부가 기능이므로 조용히 종료.
    }
  }
}
