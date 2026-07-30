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
import com.michaelkim.anima.data.local.NotificationPrefsStore
import com.michaelkim.anima.data.local.QuoteCache
import com.michaelkim.anima.work.WorkScheduler
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

object QuoteRepository {

    private const val TAG = "QuoteRepository"

    /**
     * 짧은 시간 안에 여러 진입점이 동시에 위젯을 갱신하려 할 때 네트워크 연타를 막는 최소 간격.
     * 앱 콜드스타트의 동기 prefetch + onResume + 포그라운드 옵저버 + OneTime/Periodic Worker 가
     * 실행마다 /api/widget/today 를 6~10회 연타해 서버의 일일 widgetRefresh 쿼터(48회)를
     * 빠르게 소진하던 문제를 막는다. 이 창 안에 이미 갱신된 캐시가 있으면 네트워크를 생략한다.
     */
    private const val DEFAULT_MIN_REFRESH_INTERVAL_MS = 90_000L

    // [refreshIfStale] 의 throttle 더블체크를 직렬화해, 거의 동시에 들어온 호출들이
    // 캐시 갱신 전에 모두 네트워크로 빠져나가는 레이스를 막는다 (모든 트리거가 같은 프로세스).
    private val refreshGate = Mutex()

    // 마지막으로 실제 네트워크 refresh 를 "시도"한 시각(성공·실패 무관, 프로세스 메모리).
    // 성공-캐시 기반 throttle 은 200 으로 캐시가 갱신돼야 동작하므로, 429/네트워크 오류로
    // 캐시가 안 써지는 동안에도 연타가 나는 구멍이 있다. 이 시각으로 실패 시에도 collapse 한다.
    @Volatile
    private var lastAttemptAtMs = 0L

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
        syncNotificationPrefs(context, response)
        return response
    }

    /**
     * 응답에 실려 온 알림 설정을 로컬 캐시에 동기화하고, 값이 바뀌었으면 리마인더를 재예약한다.
     * 설정 화면(웹)에서 저장 → 다음 refresh(포그라운드 복귀·정주기·리마인더 발화 시점) 때
     * 자동 반영 — 별도 API/인텐트 브릿지 없이 기존 위젯 파이프라인 하나로 정책이 흐른다.
     * 실패해도 위젯 갱신 본연의 흐름은 깨지 않는다.
     */
    private fun syncNotificationPrefs(context: Context, response: WidgetTodayResponse) {
        val prefs = response.notificationPrefs ?: return
        try {
            if (NotificationPrefsStore.write(context, prefs)) {
                WorkScheduler.scheduleDailyWinsReminder(context)
                WorkScheduler.scheduleDailyAffirmationsReminder(context)
            }
        } catch (e: Exception) {
            Log.w(TAG, "알림 설정 동기화 실패 — 다음 refresh 에서 재시도", e)
        }
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

    /**
     * 캐시가 [minIntervalMs] 이내에 갱신됐으면 그 응답을, 아니면 null 을 반환.
     * 캐시 읽기 자체가 실패해도 throttle 이 refresh 를 막아선 안 되므로 null 로 떨어뜨려 네트워크로 위임.
     */
    private suspend fun cachedResponseIfFreshWithin(
        context: Context,
        minIntervalMs: Long,
    ): WidgetTodayResponse? {
        val cached = try {
            QuoteCache.read(context)
        } catch (e: Exception) {
            Log.w(TAG, "throttle 캐시 읽기 실패 — 네트워크로 진행", e)
            return null
        }
        val response = cached?.response ?: return null
        val ageMs = System.currentTimeMillis() - cached.cachedAtEpochMs
        return if (ageMs in 0 until minIntervalMs) response else null
    }

    /**
     * 캐시가 충분히 최신이면 네트워크를 생략하고 캐시를, 아니면 [refreshWithEntitlementRecovery] 를 친다.
     *
     * 앱 실행 시 동시다발로 일어나는 위젯 갱신(동기 prefetch · onResume · 포그라운드 진입 · Worker)이
     * /api/widget/today 를 연타해 일일 쿼터(widgetRefresh 48회)를 소진하던 문제를 collapse 한다.
     * 사용자가 막 저장한 직후처럼 반드시 최신이 필요한 경로(위젯 브릿지·자정 갱신·로그인 직후)는
     * 이 함수 대신 [refresh]/[refreshWithEntitlementRecovery] 를 직접 호출해 throttle 을 우회한다.
     *
     * @return 네트워크를 실제로 쳤으면 그 응답, throttle 로 생략했으면 캐시의 응답.
     */
    suspend fun refreshIfStale(
        context: Context,
        lang: String? = null,
        minIntervalMs: Long = DEFAULT_MIN_REFRESH_INTERVAL_MS,
    ): WidgetTodayResponse {
        cachedResponseIfFreshWithin(context, minIntervalMs)?.let { fresh ->
            Log.i(TAG, "위젯 refresh throttled — 캐시가 ${minIntervalMs}ms 내 갱신됨, 네트워크 생략")
            return fresh
        }
        // 락 안에서 더블체크 — 대기 중 다른 호출이 막 갱신/시도했으면 그 결과를 그대로 쓴다.
        return refreshGate.withLock {
            // (a) 그 사이 누군가 성공시켜 캐시가 최신이 됐으면 네트워크 생략.
            cachedResponseIfFreshWithin(context, minIntervalMs)?.let { rechecked ->
                Log.i(TAG, "위젯 refresh throttled(락 내 재확인) — 네트워크 생략")
                return@withLock rechecked
            }
            // (b) 직전 [minIntervalMs] 안에 이미 시도가 있었으면(성공/실패 무관) 중복 시도를 접고
            //     가진 캐시를 쓴다 — 429/오류 연타까지 collapse. 단 캐시가 아예 없으면(첫 진입) 시도한다.
            val sinceAttemptMs = System.currentTimeMillis() - lastAttemptAtMs
            if (sinceAttemptMs in 0 until minIntervalMs) {
                val anyCached = getCached(context)?.response
                if (anyCached != null) {
                    Log.i(TAG, "위젯 refresh throttled — ${sinceAttemptMs}ms 전 시도 있음, 네트워크 생략")
                    return@withLock anyCached
                }
            }
            // (c) 실제 네트워크 시도. 시각을 먼저 찍어, 이 호출이 던지더라도 후속 연타가 collapse 되게 한다.
            lastAttemptAtMs = System.currentTimeMillis()
            refreshWithEntitlementRecovery(context, lang)
        }
    }

    /** 캐시에서 "지금 보여야 할" 슬롯 1건 추출. 슬롯이 비면 null. */
    fun currentSlot(state: CachedWidgetState?): WidgetSlot? =
        state?.response?.slots?.firstOrNull()
}
