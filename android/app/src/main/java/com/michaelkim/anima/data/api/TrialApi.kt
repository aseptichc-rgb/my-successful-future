/**
 * /api/auth/start-trial Retrofit 인터페이스.
 *
 * 가입 직후 한 번 호출해서 14일 무료 체험 claim 을 받아온다.
 * 응답의 customToken 으로 signInWithCustomToken 을 부르면 다음 ID 토큰부터
 * trialEndsAt claim 이 박혀, 보호 라우트(예: /api/widget/today)가 통과된다.
 *
 * 멱등: 이미 paid=true 또는 trialEndsAt 이 박혀 있으면 alreadyStarted=true 만 돌려준다.
 */
package com.michaelkim.anima.data.api

import kotlinx.serialization.Serializable
import retrofit2.http.POST

@Serializable
data class StartTrialResponse(
    val ok: Boolean,
    val alreadyStarted: Boolean = false,
    val customToken: String? = null,
    val trialEndsAt: Long? = null,
    val paid: Boolean = false,
    val error: String? = null,
)

interface TrialApi {
    @POST("api/auth/start-trial")
    suspend fun start(): StartTrialResponse
}
