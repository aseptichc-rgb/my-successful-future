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
import java.time.LocalDate

object QuoteRepository {

    private const val TAG = "QuoteRepository"

    /**
     * 짧은 시간 안에 여러 진입점이 동시에 위젯을 갱신하려 할 때 네트워크 연타를 막는 최소 간격.
     * 앱 콜드스타트의 동기 prefetch + onResume + 포그라운드 옵저버 + OneTime/Periodic Worker 가
     * 실행마다 /api/widget/today 를 6~10회 연타해 서버의 일일 widgetRefresh 쿼터(48회)를
     * 빠르게 소진하던 문제를 막는다. 이 창 안에 이미 갱신된 캐시가 있으면 네트워크를 생략한다.
     * collapse 의 근거는 "성공한 갱신" 뿐이다 — 실패·취소된 시도는 세지 않는다([refreshIfStale] 참고).
     */
    private const val DEFAULT_MIN_REFRESH_INTERVAL_MS = 90_000L

    // [refreshIfStale] 의 throttle 더블체크를 직렬화해, 거의 동시에 들어온 호출들이
    // 캐시 갱신 전에 모두 네트워크로 빠져나가는 레이스를 막는다 (모든 트리거가 같은 프로세스).
    private val refreshGate = Mutex()

    /**
     * 캐시를 "묵었다" 고 볼 나이 — 정주기 갱신 주기 그 자체([WorkScheduler.PERIODIC_REFRESH_MS]).
     * 그보다 오래됐다는 건 정주기가 최소 한 번 건너뛰어졌다는 뜻이다. 상수를 복제하지 않고
     * 그대로 참조해, 주기를 바꿨을 때 두 값이 어긋나는 조용한 회귀를 원천 차단한다.
     */
    private val STALE_AFTER_MS: Long = WorkScheduler.PERIODIC_REFRESH_MS

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
        return if (isFreshWithin(cached.cachedAtEpochMs, System.currentTimeMillis(), minIntervalMs)) {
            response
        } else {
            null
        }
    }

    /**
     * throttle 의 유일한 판정 근거 — "캐시가 [minIntervalMs] 안에 실제로 갱신됐는가".
     * 시계 되감김으로 나이가 음수면 신선하지 않은 것으로 본다(네트워크로 위임).
     * 순수 함수라 단위 테스트(QuoteRepositoryTest)가 이 계약을 고정한다.
     */
    internal fun isFreshWithin(cachedAtEpochMs: Long, nowMs: Long, minIntervalMs: Long): Boolean {
        val ageMs = nowMs - cachedAtEpochMs
        return ageMs in 0 until minIntervalMs
    }

    /**
     * 캐시가 충분히 최신이면 네트워크를 생략하고 캐시를, 아니면 [refreshWithEntitlementRecovery] 를 친다.
     *
     * 앱 실행 시 동시다발로 일어나는 위젯 갱신(동기 prefetch · onResume · 포그라운드 진입 · Worker)이
     * /api/widget/today 를 연타하던 문제를 collapse 한다. 사용자가 막 저장한 직후처럼 반드시 최신이
     * 필요한 경로(자정 갱신·로그인 직후)는 이 함수 대신 [refresh]/[refreshWithEntitlementRecovery] 를
     * 직접 호출해 throttle 을 우회한다.
     *
     * collapse 의 근거는 **성공한 갱신** 하나뿐이다 — "직전에 시도가 있었는가" 는 보지 않는다.
     * 2026-09-02 사고: 예전엔 실패·취소된 시도까지 90초간 collapse 했다. MainActivity 의 동기 갱신이
     * 2.5초 타임아웃으로 취소되면(/api/widget/today 는 콜드 스타트만 4~5초, 그날 첫 호출은 카드·비전
     * 생성으로 그 이상) 그 실패 때문에 큐잉된 폴백 Worker 와 WorkManager 재시도가 전부 "방금 시도
     * 있음" 으로 네트워크를 건너뛰어, 위젯이 8/22 카드에 11일간 고착됐다. 실패한 시도는 다음 호출이
     * 곧장 다시 치는 것이 맞다 — 동시 호출은 [refreshGate] 가 직렬화하고, 앞선 호출이 성공했으면
     * 락 안 재확인(캐시 신선)이 네트워크를 생략하므로 연타는 여전히 1회로 접힌다.
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
        // 락 안에서 더블체크 — 대기 중 다른 호출이 막 성공시켰으면 그 결과를 그대로 쓴다.
        // 실패했으면(캐시 그대로) 여기서 다시 친다 — 그것이 폴백 Worker 가 존재하는 이유다.
        return refreshGate.withLock {
            cachedResponseIfFreshWithin(context, minIntervalMs)?.let { rechecked ->
                Log.i(TAG, "위젯 refresh throttled(락 내 재확인) — 네트워크 생략")
                return@withLock rechecked
            }
            refreshWithEntitlementRecovery(context, lang)
        }
    }

    /**
     * KST 기준 오늘 YYYY-MM-DD — 서버 todayKst() 와 동일한 하루 경계.
     * 시간대는 자정 갱신 예약과 같은 [WorkScheduler.SERVER_DAY_ZONE] 하나만 쓴다 —
     * 각자 "Asia/Seoul" 을 들고 있으면 한쪽만 바뀌었을 때 조용히 어긋난다.
     */
    fun todayKstYmd(): String = LocalDate.now(WorkScheduler.SERVER_DAY_ZONE).toString()

    /**
     * 캐시 응답을 "오늘" 기준 표시용으로 보정한다.
     * - 캐시 ymd 가 오늘(또는 시계 오차로 미래)이면 그대로.
     * - 캐시 ymd 가 지났고 upcoming 미리보기가 있으면: 오늘 자(없으면 오늘에 가장 가까운 과거)
     *   미리보기 명언으로 교체하고, 하루 단위 상태(진척도·이번 달 달성·비전 티저)를 새 날
     *   기준으로 리셋한다 — 어제 값을 그대로 두면 "오늘 이미 다 한 것처럼" 보이는 거짓 상태가 된다.
     * - 미리보기가 없으면(옛 캐시/옛 서버): 기존처럼 이전 카드 유지(빈 화면보다 낫다).
     *
     * 이후 네트워크 refresh 가 성공하면 그날의 정식 카드가 이 보정을 자연 대체한다.
     */
    fun effectiveResponseForDisplay(
        response: WidgetTodayResponse?,
        todayYmd: String = todayKstYmd(),
    ): WidgetTodayResponse? {
        if (response == null || response.ymd >= todayYmd) return response
        // YYYY-MM-DD 형식이라 문자열 비교가 곧 날짜 비교다.
        val preview = response.upcoming
            .filter { it.ymd <= todayYmd }
            .maxByOrNull { it.ymd }
            ?: return response
        val baseSlot = response.slots.firstOrNull() ?: return response
        return response.copy(
            ymd = todayYmd,
            slots = listOf(
                baseSlot.copy(
                    text = preview.text,
                    author = preview.author,
                    // 원문 병기는 어제 명언의 것 — 새 명언과 무관하니 지운다.
                    originalText = null,
                    originalLang = null,
                ),
            ),
            todayProgress = WidgetTodayProgress(),
            futureVision = null,
            goalsAchievedCount = 0,
            // 목표 본문은 하루가 지나도 그대로지만 달성 표시는 어제 것이다 — 카운트를 0 으로
            // 되돌리면서 체크마크만 남기면 "0 / 1 완료" 옆에 체크가 켜진 모순이 된다.
            goals = response.goals.map { it.copy(achieved = false) },
        )
    }

    /**
     * 캐시가 묵었는가 — 위젯이 그려질 때 백그라운드 갱신을 걸어야 할지 판정한다.
     *
     * 두 가지를 본다:
     *  1) 나이가 [maxAgeMs] 를 넘었나 (정주기 Worker 가 Doze/오프라인으로 건너뛰어진 경우).
     *  2) 캐시의 ymd 가 KST 오늘보다 이전인가 — 자정 Worker 가 못 돌면 캐시가 어제에 멈춘다.
     *     [effectiveResponseForDisplay] 가 upcoming 미리보기로 표시를 보정하지만 그건
     *     어디까지나 미리보기다. 그날의 정식 카드(홈 /home 이 보는 그것)로 따라잡으려면
     *     네트워크 갱신이 필요하므로 여기서도 날짜를 본다.
     *
     * 캐시가 없으면 false — 그 경우는 호출부의 자가 복구(동기 fetch)가 따로 담당한다.
     * ymd 는 YYYY-MM-DD 고정이라 문자열 비교가 곧 날짜 비교
     * ([effectiveResponseForDisplay] 와 같은 관용구).
     */
    fun isStale(state: CachedWidgetState?, maxAgeMs: Long = STALE_AFTER_MS): Boolean {
        val response = state?.response ?: return false
        val ageMs = System.currentTimeMillis() - state.cachedAtEpochMs
        if (ageMs >= maxAgeMs) return true
        return response.ymd < todayKstYmd()
    }

    /** 캐시에서 "지금 보여야 할" 슬롯 1건 추출. 슬롯이 비면 null. */
    fun currentSlot(state: CachedWidgetState?): WidgetSlot? =
        state?.response?.slots?.firstOrNull()
}
