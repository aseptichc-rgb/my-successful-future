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
import retrofit2.HttpException
import java.net.HttpURLConnection

/**
 * 보유 영수증 서버 검증의 3분류 결과.
 *
 * ENTITLED / NOT_ENTITLED 외에 LINKED_TO_OTHER_ACCOUNT 를 별도로 두는 이유:
 * 기기의 Play 계정 영수증이 다른 Anima 계정에 묶여 있으면(서버 409) 재구매는 Play 가
 * ITEM_ALREADY_OWNED 로, 복원은 서버가 409 로 막는 막다른 길이 된다. 이를 NOT_ENTITLED 와
 * 구분하지 않으면 사용자에게 "복원할 내역 없음" 같은 오해할 안내가 나간다.
 */
enum class EntitlementRefreshResult {
    /** 서버 검증 성공 — paid claim 적용 완료. */
    ENTITLED,

    /** 보유 영수증 없음 또는 검증 미통과(막다른 길 아님 — 구매/재시도로 해소 가능). */
    NOT_ENTITLED,

    /** 보유 영수증이 다른 Anima 계정에 연결됨(서버 409) — 원 계정 로그인만이 해법. */
    LINKED_TO_OTHER_ACCOUNT,
}

object EntitlementRepository {

    private const val PACKAGE_NAME = "com.michaelkim.anima"

    /**
     * 보유 영수증을 모두 서버에 검증시킨다.
     * 하나라도 ok 면 ENTITLED — signInWithCustomToken 으로 새 토큰을 즉시 적용한다.
     * 서버가 409(다른 계정에 연결된 영수증)로 거부하면 LINKED_TO_OTHER_ACCOUNT 로 분류해
     * 호출부가 사용자에게 정확한 사유(원 계정 로그인 안내)를 보여줄 수 있게 한다.
     */
    suspend fun refreshEntitlement(context: Context): Result<EntitlementRefreshResult> = runCatching {
        if (FirebaseAuth.getInstance().currentUser == null) {
            return@runCatching EntitlementRefreshResult.NOT_ENTITLED
        }

        val owned = BillingRepository.queryOwnedPurchases(context)
        if (owned.isEmpty()) return@runCatching EntitlementRefreshResult.NOT_ENTITLED

        var anyOk = false
        var anyLinkedToOther = false
        for (purchase in owned) {
            if (purchase.purchaseState != Purchase.PurchaseState.PURCHASED) continue

            // 결제 직후라면 acknowledge 가 안 돼 있을 수 있다. 3일 내 미승인 시 자동 환불되므로
            // 검증 직전에 함께 처리한다.
            BillingRepository.acknowledgePurchaseIfNeeded(context, purchase).getOrNull()

            val integrityToken = runCatching { fetchIntegrityToken() }.getOrNull()

            val response = try {
                ApiClient.entitlementApi.verify(
                    EntitlementVerifyRequest(
                        purchaseToken = purchase.purchaseToken,
                        productId = BuildConfig.LIFETIME_PRODUCT_ID,
                        packageName = PACKAGE_NAME,
                        integrityToken = integrityToken,
                    ),
                )
            } catch (e: HttpException) {
                // 409 = 이 purchaseToken 이 이미 다른(회수되지 않은) 계정에 등록됨
                // (서버 /api/entitlement/verify 의 영수증 재사용 차단). 남은 영수증도 마저
                // 검증해야 하므로 중단하지 않고 표시만 남긴다.
                if (e.code() == HttpURLConnection.HTTP_CONFLICT) {
                    anyLinkedToOther = true
                    continue
                }
                throw e
            }
            if (response.ok && !response.customToken.isNullOrBlank()) {
                FirebaseAuth.getInstance().signInWithCustomToken(response.customToken).await()
                anyOk = true
            }
        }
        when {
            anyOk -> EntitlementRefreshResult.ENTITLED
            anyLinkedToOther -> EntitlementRefreshResult.LINKED_TO_OTHER_ACCOUNT
            else -> EntitlementRefreshResult.NOT_ENTITLED
        }
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
