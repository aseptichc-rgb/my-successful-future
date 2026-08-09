/**
 * 인앱결제가 가능한 실행 환경인지 판정 — iOS(StoreKit) / Android(네이티브 브릿지 or
 * Digital Goods) 앱 안에서만 true, 순수 웹(브라우저)에서는 false.
 *
 * 결제 진입점(설정 > ANIMA PRO)과 트라이얼 배너의 "업그레이드" CTA 가 이 판정을 공유한다 —
 * 웹에는 결제 수단이 없으므로 CTA 를 띄우면 막다른 길이 된다. 두 곳이 같은 규칙을 봐야
 * "결제 가능한 화면에서만 결제를 유도"가 일관되게 지켜진다(DRY).
 */
import { isIosPurchaseAvailable } from "@/lib/iosPurchase";
import { isAndroidPurchaseAvailable } from "@/lib/androidPurchase";
import { isAndroidApp } from "@/lib/widgetBridge";

/** 결제 환경은 페이지 수명 동안 불변 — 렌더마다 URL 파싱·스토리지 조회를 반복하지 않게 캐시. */
let purchaseEnvCache: boolean | null = null;

export function detectPurchaseEnv(): boolean {
  return (purchaseEnvCache ??=
    isIosPurchaseAvailable() || isAndroidApp() || isAndroidPurchaseAvailable());
}
