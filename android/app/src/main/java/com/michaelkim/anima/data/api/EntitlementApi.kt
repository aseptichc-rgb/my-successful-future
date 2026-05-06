/**
 * /api/entitlement/verify Retrofit 인터페이스.
 *
 * 클라이언트가 Play Billing 영수증과 (선택적으로) Play Integrity 토큰을 보내면
 * 서버가 검증한 뒤 Firebase custom claim 을 박아 customToken 을 돌려준다.
 */
package com.michaelkim.anima.data.api

import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.POST

@Serializable
data class EntitlementVerifyRequest(
    val purchaseToken: String,
    val productId: String,
    val packageName: String,
    val integrityToken: String? = null,
    val expectedNonce: String? = null,
)

@Serializable
data class EntitlementVerifyResponse(
    val ok: Boolean,
    val customToken: String? = null,
    val productId: String? = null,
    val purchaseTimeMs: Long? = null,
    val error: String? = null,
    val reason: String? = null,
)

interface EntitlementApi {
    @POST("api/entitlement/verify")
    suspend fun verify(@Body body: EntitlementVerifyRequest): EntitlementVerifyResponse
}
