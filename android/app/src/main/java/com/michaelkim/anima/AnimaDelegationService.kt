package com.michaelkim.anima

import com.google.androidbrowserhelper.trusted.DelegationService

/**
 * TWA 위임(Delegation) 서비스 — Chrome 이 TRUSTED_WEB_ACTIVITY_SERVICE 인텐트로 바인딩한다
 * (AndroidManifest 참고). 웹 알림(Notification) 위임 등 TWA 표준 위임을 담당한다.
 *
 * NOTE: 과거엔 웹 설정 페이지의 Digital Goods API(getDetails/listPurchases/acknowledge)를
 *  Play Billing 으로 중계하는 DigitalGoodsRequestHandler 를 여기에 등록했다. 그러나
 *   1) Android 13+ 에서 위임이 clientAppUnavailable 로 깨져 결제·복원·승인을 이미 네이티브
 *      BillingClient(PurchaseBridgeActivity)로 전환했고,
 *   2) 위임 라이브러리(androidbrowserhelper:billing 1.1.0)가 Play Billing 7.1.1 을 번들해
 *      2026-08-31 부터 강제되는 8.0.0+ 요구사항과 충돌(8.x 호환판 미출시)하므로
 *  위임 라이브러리를 제거하며 DigitalGoodsRequestHandler 등록도 함께 삭제했다.
 */
class AnimaDelegationService : DelegationService()
