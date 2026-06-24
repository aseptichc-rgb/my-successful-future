package com.michaelkim.anima

import com.google.androidbrowserhelper.playbilling.digitalgoods.DigitalGoodsRequestHandler
import com.google.androidbrowserhelper.trusted.DelegationService

/**
 * TWA 위임(Delegation) 서비스 — 웹(설정 페이지)의 Digital Goods API 요청
 * (getDetails / listPurchases / acknowledge)을 Play Billing 으로 중계한다.
 * Chrome 이 TRUSTED_WEB_ACTIVITY_SERVICE 인텐트로 이 서비스를 바인딩한다(AndroidManifest 참고).
 *
 * 결제 시트 자체는 androidbrowserhelper 의 PaymentActivity 가 처리하고, 이 서비스는 상품 조회·
 * 보유내역·승인 같은 Digital Goods 부가 명령만 DigitalGoodsRequestHandler 로 위임받는다.
 */
class AnimaDelegationService : DelegationService() {
    override fun onCreate() {
        super.onCreate()
        registerExtraCommandHandler(DigitalGoodsRequestHandler(applicationContext))
    }
}
