/**
 * Play Billing 1회 결제 (consumable=false, in-app product) 래퍼.
 *
 * 흐름:
 *   1) MainActivity 가 launchBillingFlow() 호출 — Play 결제 UI 띄우고 사용자 결제 완료까지 대기.
 *   2) 결제 후 PurchasesUpdatedListener 가 호출되어 purchase 객체를 받음.
 *   3) acknowledgePurchase() 로 결제 승인 (3일 내 미승인 시 자동 환불).
 *   4) 영수증(purchaseToken)을 EntitlementRepository 로 넘겨 서버 검증 → paid claim 부여.
 *
 * 다음 실행 시:
 *   - queryOwnedPurchases() 로 이미 보유 중인 영수증 조회 가능.
 *   - 같은 Google 계정으로 새 기기 설치해도 영수증이 함께 따라옴 → 자동 entitlement 복원.
 */
package com.michaelkim.anima.data.billing

import android.app.Activity
import android.content.Context
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import com.michaelkim.anima.BuildConfig
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlin.coroutines.resume

object BillingRepository {

    private val productId = BuildConfig.LIFETIME_PRODUCT_ID
    private val connectMutex = Mutex()

    @Volatile
    private var client: BillingClient? = null
    @Volatile
    private var lastPurchasesUpdate: List<Purchase> = emptyList()

    private val purchasesListener = PurchasesUpdatedListener { _, purchases ->
        // 결제 콜백은 launchBillingFlow 직후 또는 외부 결제(가족 공유 등)에서도 호출됨.
        // 호출부가 즉시 결과를 보지 못해도 다음 query 에서 회수되도록 캐시.
        lastPurchasesUpdate = purchases ?: emptyList()
    }

    /**
     * 연결되지 않은 client 를 lazy 하게 연결한다.
     * BillingClient 는 1회만 startConnection 호출해야 하므로 mutex 로 동시 진입 차단.
     */
    private suspend fun ensureConnected(context: Context): BillingClient {
        client?.let { if (it.isReady) return it }
        return connectMutex.withLock {
            client?.let { if (it.isReady) return@withLock it }
            val newClient = BillingClient.newBuilder(context.applicationContext)
                .enablePendingPurchases(
                    PendingPurchasesParams.newBuilder()
                        .enableOneTimeProducts()
                        .build(),
                )
                .setListener(purchasesListener)
                .build()
            suspendCancellableCoroutine { cont ->
                newClient.startConnection(object : BillingClientStateListener {
                    override fun onBillingSetupFinished(result: BillingResult) {
                        if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                            cont.resume(Unit)
                        } else {
                            cont.cancel(IllegalStateException("Billing setup failed: ${result.debugMessage}"))
                        }
                    }
                    override fun onBillingServiceDisconnected() {
                        // 다음 호출 시 isReady=false 면 재연결됨.
                    }
                })
            }
            client = newClient
            newClient
        }
    }

    /**
     * 1회 결제 상품의 ProductDetails 조회 (UI 에 가격 표기 등).
     */
    suspend fun queryProductDetails(context: Context): Result<ProductDetails> = runCatching {
        val billing = ensureConnected(context)
        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(
                listOf(
                    QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(productId)
                        .setProductType(BillingClient.ProductType.INAPP)
                        .build(),
                ),
            )
            .build()
        val result = suspendCancellableCoroutine<Pair<BillingResult, List<ProductDetails>>> { cont ->
            billing.queryProductDetailsAsync(params) { res, list ->
                cont.resume(res to list)
            }
        }
        if (result.first.responseCode != BillingClient.BillingResponseCode.OK) {
            error("queryProductDetails 실패: ${result.first.debugMessage}")
        }
        result.second.firstOrNull { it.productId == productId }
            ?: error("상품 ID '$productId' 를 Play Console 에서 찾을 수 없습니다.")
    }

    /**
     * Activity 컨텍스트에서 결제 UI 를 띄운다.
     * 결과는 PurchasesUpdatedListener 로 비동기 도착 — 호출부는 잠시 후 queryOwnedPurchases() 또는
     * lastPurchasesUpdate 를 확인하면 된다.
     */
    suspend fun launchBillingFlow(activity: Activity, details: ProductDetails): Result<Unit> = runCatching {
        val billing = ensureConnected(activity)
        val flowParams = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(
                listOf(
                    BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(details)
                        .build(),
                ),
            )
            .build()
        val result = billing.launchBillingFlow(activity, flowParams)
        if (result.responseCode != BillingClient.BillingResponseCode.OK &&
            result.responseCode != BillingClient.BillingResponseCode.USER_CANCELED
        ) {
            error("launchBillingFlow 실패: ${result.debugMessage}")
        }
    }

    /**
     * 사용자의 보유 영수증 (1회 결제 INAPP) 조회.
     * 신규 구매 직후 / 앱 재설치 / 기기 변경 후 entitlement 복원 시 호출.
     */
    suspend fun queryOwnedPurchases(context: Context): List<Purchase> {
        val billing = ensureConnected(context)
        val params = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.INAPP)
            .build()
        val result = suspendCancellableCoroutine<Pair<BillingResult, List<Purchase>>> { cont ->
            billing.queryPurchasesAsync(params) { res, list ->
                cont.resume(res to list)
            }
        }
        if (result.first.responseCode != BillingClient.BillingResponseCode.OK) return emptyList()
        return result.second.filter { it.products.contains(productId) }
    }

    /**
     * 결제 승인. 3일 안에 호출하지 않으면 Play 가 자동 환불한다.
     * 이미 승인된(acknowledged=true) 영수증에는 호출하지 않는다.
     */
    suspend fun acknowledgePurchaseIfNeeded(context: Context, purchase: Purchase): Result<Unit> = runCatching {
        if (purchase.isAcknowledged) return@runCatching
        if (purchase.purchaseState != Purchase.PurchaseState.PURCHASED) return@runCatching
        val billing = ensureConnected(context)
        val params = AcknowledgePurchaseParams.newBuilder()
            .setPurchaseToken(purchase.purchaseToken)
            .build()
        val result = suspendCancellableCoroutine<BillingResult> { cont ->
            billing.acknowledgePurchase(params) { res -> cont.resume(res) }
        }
        if (result.responseCode != BillingClient.BillingResponseCode.OK) {
            error("acknowledgePurchase 실패: ${result.debugMessage}")
        }
    }

    /**
     * 콜백으로만 도착하던 마지막 결제 결과(있으면). 호출 후 비움.
     */
    fun consumeLastPurchasesUpdate(): List<Purchase> {
        val out = lastPurchasesUpdate
        lastPurchasesUpdate = emptyList()
        return out
    }
}
