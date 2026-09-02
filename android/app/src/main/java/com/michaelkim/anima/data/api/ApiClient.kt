/**
 * Retrofit + OkHttp 싱글턴.
 *
 * 보안:
 * - Authorization 헤더는 매 호출마다 Firebase Auth 의 ID 토큰을 새로 가져와 부착.
 * - HTTP 로깅은 디버그 빌드에서만 BODY, 릴리즈에선 NONE (토큰 누출 방지).
 */
package com.michaelkim.anima.data.api

import com.michaelkim.anima.BuildConfig
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.util.concurrent.TimeUnit

object ApiClient {
    private val json: Json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        explicitNulls = false
    }

    private const val CONNECT_TIMEOUT_S = 15L

    /**
     * 서버 함수 실행 상한 — app/api/widget/today 의 `maxDuration = 30`(Vercel). 클라이언트 readTimeout 은
     * 반드시 이보다 길어야 한다: 그날 첫 /api/widget/today 는 카드·비전 생성(Gemini, 시도당 6초)까지
     * 포함해 20초를 넘길 수 있는데, 클라가 먼저 끊으면 서버는 생성·쿼터 카운트를 그대로 마치고 응답만
     * 버려진다(2026-09-02 위젯 고착 사고 — 캐시는 8/22, usage.widgetRefresh 는 매일 1).
     */
    private const val SERVER_MAX_DURATION_S = 30L
    private const val READ_TIMEOUT_MARGIN_S = 5L

    val widgetApi: WidgetApi by lazy { buildRetrofit().create(WidgetApi::class.java) }
    val entitlementApi: EntitlementApi by lazy { buildRetrofit().create(EntitlementApi::class.java) }
    val trialApi: TrialApi by lazy { buildRetrofit().create(TrialApi::class.java) }
    val onboardingApi: OnboardingApi by lazy { buildRetrofit().create(OnboardingApi::class.java) }
    val nativeBridgeApi: NativeBridgeApi by lazy { buildRetrofit().create(NativeBridgeApi::class.java) }

    private fun buildRetrofit(): Retrofit {
        val baseUrl = BuildConfig.ANIMA_API_BASE_URL.let {
            if (it.endsWith("/")) it else "$it/"
        }
        val logging = HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) {
                HttpLoggingInterceptor.Level.HEADERS
            } else {
                HttpLoggingInterceptor.Level.NONE
            }
            redactHeader("Authorization")
        }
        val client = OkHttpClient.Builder()
            .connectTimeout(CONNECT_TIMEOUT_S, TimeUnit.SECONDS)
            .readTimeout(SERVER_MAX_DURATION_S + READ_TIMEOUT_MARGIN_S, TimeUnit.SECONDS)
            .addInterceptor(AuthInterceptor)
            .addInterceptor(logging)
            .build()

        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
    }
}

/**
 * 매 요청마다 현재 Firebase 사용자에게서 ID 토큰을 발급받아 헤더에 부착.
 * 토큰이 없으면 헤더 없이 보냄 — 서버가 401 로 응답하므로 호출부가 적절히 처리.
 *
 * NOTE: OkHttp interceptor 는 동기. Firebase getIdToken 은 코루틴이 아닌 Task 라
 * runBlocking 으로 안전하게 await. WorkManager / 위젯 코루틴 컨텍스트에서 호출되므로
 * 메인 스레드 블로킹 위험 없음.
 */
private object AuthInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): okhttp3.Response {
        val original = chain.request()
        val token = runBlocking {
            try {
                com.michaelkim.anima.data.auth.AuthRepository.currentIdToken(forceRefresh = false)
            } catch (e: Exception) {
                null
            }
        }
        val req = if (token.isNullOrBlank()) {
            original
        } else {
            original.newBuilder()
                .header("Authorization", "Bearer $token")
                .build()
        }
        return chain.proceed(req)
    }
}
