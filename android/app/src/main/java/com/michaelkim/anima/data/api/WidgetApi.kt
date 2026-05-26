/**
 * 위젯 백엔드 호출용 Retrofit 인터페이스.
 *
 * 모든 호출은 Authorization: Bearer <Firebase ID Token> 헤더를 ApiClient 의
 * AuthInterceptor 가 자동 부착한다. uid 는 토큰에서 서버가 추출하므로
 * 클라이언트가 별도 query 로 전달하지 않는다.
 */
package com.michaelkim.anima.data.api

import com.michaelkim.anima.data.WidgetTodayResponse
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.Query

interface WidgetApi {
    /**
     * @param lang "ko" 또는 "en". 기본은 백엔드가 "ko" 로 폴백.
     * @param ymd "YYYY-MM-DD" 강제 조회 (개발용). 보통 null.
     * @param ts 캐시 버스터 — 사용자가 막 저장한 직후의 호출은 무조건 origin 까지 도달해야
     *           최신 진척도를 받아온다. Cache-Control: private, max-age=60 헤더 응답 때문에
     *           CDN/브라우저 어딘가에 60초 짜리 stale 데이터가 묶이는 회귀를 차단.
     */
    @GET("api/widget/today")
    suspend fun getToday(
        @Query("lang") lang: String? = null,
        @Query("ymd") ymd: String? = null,
        @Query("_t") ts: Long,
        @Header("Cache-Control") cacheControl: String = "no-cache",
    ): WidgetTodayResponse
}
