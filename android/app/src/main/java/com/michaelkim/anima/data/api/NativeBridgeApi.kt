/**
 * /api/auth/native-bridge Retrofit 인터페이스.
 *
 * 네이티브 → 웹 SSO: 네이티브 Firebase 세션의 ID 토큰을 보내고 동일 uid 용 customToken 을 받아온다.
 * 받은 customToken 은 TWA URL 에 ?nativeToken= 으로 실어 웹 AuthProvider 가 한 번만 소비한다.
 *
 * 서버 측 엔드포인트는 web → native 와 동일하게 재사용. 호출자(uid) 자신을 위한 토큰만 발급되므로
 * 권한 상승 경로 없음. customToken 은 단발성 + 짧은 수명(약 1시간).
 */
package com.michaelkim.anima.data.api

import kotlinx.serialization.Serializable
import retrofit2.http.POST

@Serializable
data class NativeBridgeResponse(
    val customToken: String? = null,
    val error: String? = null,
)

interface NativeBridgeApi {
    @POST("api/auth/native-bridge")
    suspend fun exchange(): NativeBridgeResponse
}
