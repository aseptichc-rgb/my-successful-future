/**
 * 위젯/메인 앱 단일 진입점.
 * - getCached(): 즉시 보여줄 캐시 (없으면 null)
 * - refresh(): 네트워크에서 최신 받아 캐시 갱신, 결과 반환
 * - currentSlot(): 캐시의 첫 슬롯(= 오늘의 동기부여 카드) 반환.
 *
 * 위젯/홈 일치 정책: 웹 /home 화면이 dailyMotivation 한 장만 노출하므로,
 * 백엔드도 motivation 1장만 보내고 위젯도 그 한 장을 그대로 보여준다.
 *
 * 예외: refresh() 는 네트워크/인증 실패 시 throw — Worker/UI 가 try-catch 로 처리.
 */
package com.michaelkim.anima.data

import android.content.Context
import android.util.Log
import com.michaelkim.anima.data.api.ApiClient
import com.michaelkim.anima.data.auth.AuthRepository
import com.michaelkim.anima.data.local.QuoteCache

object QuoteRepository {

    private const val TAG = "QuoteRepository"

    suspend fun getCached(context: Context): CachedWidgetState? = QuoteCache.read(context)

    /**
     * @param lang null = 백엔드 기본 ("ko")
     *
     * 매 호출에 현재 시각을 `_t` 쿼리로 실어 CDN/Chrome 어떤 캐시 레이어에도 stale 응답이
     * 묶이지 않도록 한다 — `/api/widget/today` 가 max-age=60 헤더를 돌려주지만 우리는
     * "사용자가 막 저장한 직후" 에도 이 함수를 부르므로 항상 origin 도달이 필요하다.
     */
    suspend fun refresh(context: Context, lang: String? = null): WidgetTodayResponse {
        val response = ApiClient.widgetApi.getToday(
            lang = lang,
            ymd = null,
            ts = System.currentTimeMillis(),
        )
        QuoteCache.save(context, response)
        return response
    }

    /**
     * [refresh] 에 "인증·체험 게이트 구제" 1회 재시도를 덧댄 버전.
     *
     * 위젯이 "로그인 후 표시됩니다" 에서 못 빠져나오던 회귀의 근본 차단용. 로그인은 돼 있는데도
     * 첫 호출이 다음 두 사유로 실패하면 캐시가 영영 비어 EmptyState 가 굳었다:
     *   1) 신규 가입 직후 trialEndsAt claim 이 아직 ID 토큰에 안 박혀 /api/widget/today 가 402.
     *      → [AuthRepository.ensureTrialStarted] 가 claim 을 박고 customToken 으로 재로그인하며
     *        토큰을 강제 갱신하므로, 재시도하면 통과한다.
     *   2) 디스크에서 복원된 ID 토큰이 만료 임박/stale 이라 401.
     *      → 토큰을 강제 갱신(forceRefresh)한 뒤 재시도하면 새 토큰으로 통과한다.
     *
     * 어느 구제도 효과가 없으면(이미 claim 보유 + 토큰도 멀쩡한데 서버/네트워크 사유) 원래 예외를
     * 그대로 던져 호출부(Worker·self-heal)가 백오프 재시도에 위임하게 한다.
     */
    suspend fun refreshWithEntitlementRecovery(
        context: Context,
        lang: String? = null,
    ): WidgetTodayResponse {
        return try {
            refresh(context, lang)
        } catch (first: Exception) {
            Log.w(TAG, "위젯 refresh 1차 실패 — 체험 claim/토큰 구제 후 재시도", first)
            // 체험 claim 적용(멱등) — 신규 가입자의 402 회귀를 푼다. 내부에서 토큰 강제 갱신까지 수행.
            val trialApplied = try {
                AuthRepository.ensureTrialStarted()
            } catch (e: Exception) {
                Log.w(TAG, "ensureTrialStarted 실패 — 토큰 강제 갱신으로만 재시도", e)
                false
            }
            // ensureTrialStarted 가 할 일이 없었다면(이미 claim 보유) 만료 임박 토큰일 수 있으니
            // 한 번 더 강제 갱신해 stale 토큰 401 도 함께 구제한다.
            if (!trialApplied) {
                try {
                    AuthRepository.currentIdToken(forceRefresh = true)
                } catch (e: Exception) {
                    Log.w(TAG, "토큰 강제 갱신 실패", e)
                }
            }
            // 재시도 — 여기서도 실패하면 예외를 호출부로 전파(백오프 재시도/EmptyState 유지).
            refresh(context, lang)
        }
    }

    /** 캐시에서 "지금 보여야 할" 슬롯 1건 추출. 슬롯이 비면 null. */
    fun currentSlot(state: CachedWidgetState?): WidgetSlot? =
        state?.response?.slots?.firstOrNull()
}
