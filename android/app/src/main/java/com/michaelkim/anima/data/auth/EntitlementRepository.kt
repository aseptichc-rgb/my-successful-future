/**
 * 결제 영수증을 서버에 검증시키고 Firebase custom claim 을 받아 적용한다.
 *
 * 흐름:
 *   1) BillingRepository.queryOwnedPurchases() 로 영수증 조회
 *   2) (선택) Play Integrity 토큰 발급 — 서버가 호출자가 진짜 우리 앱인지 검증
 *   3) /api/entitlement/verify 에 POST → customToken 수신
 *   4) FirebaseAuth.signInWithCustomToken(customToken) → 다음 ID 토큰부터 paid=true claim 포함
 *
 * 호출 시점:
 *   - 앱 콜드 시작 직후 (signed-in 상태 + paid claim 미확인)
 *   - 결제 완료 직후 (PurchasesUpdatedListener 콜백)
 *   - 401 / 402 응답을 받은 직후 (재검증 후 재시도)
 */
package com.michaelkim.anima.data.auth

import android.content.Context
import com.android.billingclient.api.Purchase
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.IntegrityTokenRequest
import com.google.firebase.auth.FirebaseAuth
import com.michaelkim.anima.BuildConfig
import com.michaelkim.anima.data.api.ApiClient
import com.michaelkim.anima.data.api.EntitlementVerifyRequest
import com.michaelkim.anima.data.billing.BillingRepository
import kotlinx.coroutines.tasks.await

object EntitlementRepository {

    private const val PACKAGE_NAME = "com.michaelkim.anima"

    /**
     * 보유 영수증을 모두 서버에 검증시킨다.
     * 하나라도 ok 면 paid=true 로 간주, signInWithCustomToken 으로 새 토큰을 즉시 적용한다.
     */
    suspend fun refreshEntitlement(context: Context): Result<Boolean> = runCatching {
        if (FirebaseAuth.getInstance().currentUser == null) {
            return@runCatching false
        }

        val owned = BillingRepository.queryOwnedPurchases(context)
        if (owned.isEmpty()) return@runCatching false

        var anyOk = false
        for (purchase in owned) {
            if (purchase.purchaseState != Purchase.PurchaseState.PURCHASED) continue

            // 결제 직후라면 acknowledge 가 안 돼 있을 수 있다. 3일 내 미승인 시 자동 환불되므로
            // 검증 직전에 함께 처리한다.
            BillingRepository.acknowledgePurchaseIfNeeded(context, purchase).getOrNull()

            val integrityToken = runCatching { fetchIntegrityToken() }.getOrNull()

            val response = ApiClient.entitlementApi.verify(
                EntitlementVerifyRequest(
                    purchaseToken = purchase.purchaseToken,
                    productId = BuildConfig.LIFETIME_PRODUCT_ID,
                    packageName = PACKAGE_NAME,
                    integrityToken = integrityToken,
                ),
            )
            if (response.ok && !response.customToken.isNullOrBlank()) {
                FirebaseAuth.getInstance().signInWithCustomToken(response.customToken).await()
                anyOk = true
            }
        }
        anyOk
    }

    /**
     * Play Integrity 토큰 발급. 실패해도 검증 자체는 영수증만으로 가능하므로 catch 후 null.
     * 운영에서는 nonce 를 서버에서 받아와 expectedNonce 도 함께 보내면 더 강력함.
     */
    private suspend fun fetchIntegrityToken(): String {
        val manager = IntegrityManagerFactory.create(
            // applicationContext 대신 ContextProvider 식 패턴이 권장되지만, 단순화를 위해
            // EntitlementRepository.refreshEntitlement 의 호출부 context 를 그대로 활용하지 않고
            // FirebaseApp 의 컨텍스트를 사용한다.
            com.google.firebase.FirebaseApp.getInstance().applicationContext,
        )
        val request = IntegrityTokenRequest.builder()
            // nonce 는 매 요청마다 달라야 하지만 서버 nonce 발급 라우트가 도입되기 전까지는
            // 클라이언트 임시값. 서버 검증에서 expectedNonce 가 비어있으면 nonce 일치 검사도 비활성.
            .setNonce(generateClientNonce())
            .build()
        val response = manager.requestIntegrityToken(request).await()
        return response.token()
    }

    private fun generateClientNonce(): String {
        // Play Integrity 가 요구하는 nonce 길이/문자 제약(>=16, base64 url-safe 영숫자/-/_)을 만족.
        val rng = java.security.SecureRandom()
        val bytes = ByteArray(24)
        rng.nextBytes(bytes)
        return android.util.Base64.encodeToString(
            bytes,
            android.util.Base64.URL_SAFE or android.util.Base64.NO_WRAP or android.util.Base64.NO_PADDING,
        )
    }
}
