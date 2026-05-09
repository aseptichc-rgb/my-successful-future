/**
 * /api/auth/onboarding-status Retrofit 인터페이스.
 *
 * 앱 부팅 시 호출 — Firestore users/{uid}.onboardedAt 의 진실값을 받아온다.
 * onboarded=false 면 메인 홈을 띄우지 않고 온보딩 게이트로 보낸다.
 */
package com.michaelkim.anima.data.api

import kotlinx.serialization.Serializable
import retrofit2.http.GET

@Serializable
data class OnboardingStatusResponse(
    val ok: Boolean = false,
    val onboarded: Boolean = false,
    val onboardedAt: Long? = null,
    val error: String? = null,
)

interface OnboardingApi {
    @GET("api/auth/onboarding-status")
    suspend fun status(): OnboardingStatusResponse
}
