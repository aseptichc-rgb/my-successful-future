/**
 * WorkManager 등록 헬퍼.
 *
 * - schedulePeriodicRefresh: 15분 주기, UPDATE 정책 (주기를 바꿔도 기존 설치에 반영된다).
 * - scheduleOneTimeRefresh: 즉시 1회 — 위젯 첫 추가 / 사용자가 "지금 갱신" 누를 때.
 * - scheduleDailyWinsReminder: 매일 저녁(기본 21:00, 기기 타임존) 로컬 알림.
 *   OneTime + 자기 재예약 패턴. 시각·on/off 는 NotificationPrefsStore(서버 설정 캐시)를 따른다.
 * - scheduleDailyAffirmationsReminder: 매일 아침(기본 08:00, 기기 타임존) 로컬 알림. 동일 패턴.
 *
 * 타임존 정책: 리마인더는 **기기 로컬 타임존** — 습관은 사용자의 하루 리듬(현지 아침/저녁)에
 * 붙어야 한다. 반면 자정 위젯 갱신은 KST 고정 — 서버의 ymd(하루 경계)가 KST 라서
 * 데이터가 갈리는 시각과 정렬해야 한다. (정책 단일 소스: 웹 lib/notificationPolicy.ts)
 *
 * 안드로이드 PeriodicWorkRequest 의 최소 주기는 15분 — 정주기 갱신은 그 하한을 쓴다.
 *
 * 왜 3시간이 아니라 15분인가 (위젯↔홈 명언 불일치 회귀):
 *   TWA 안에서 사용자가 ↻(다시 받기) 를 누르면 홈의 명언은 즉시 바뀌지만, 웹 → 네이티브
 *   위젯 갱신 인텐트는 Chrome "계속" 확인창 회귀 때문에 제거돼(lib/widgetBridge.ts) 남은
 *   경로가 없다. 게다가 TWA 는 Chrome 프로세스라 우리 프로세스는 그동안 백그라운드여서
 *   [ForegroundWidgetRefresher] 의 ON_START 도 뜨지 않는다. 결과적으로 위젯이 최대 3시간
 *   옛 명언을 들고 있었다. 정주기를 하한(15분)까지 당겨 그 창을 3시간 → 15분으로 줄인다.
 *   비용은 15분마다 GET 1회 — [QuoteRepository.refreshIfStale] 이 90초 창으로 연타를 접고,
 *   서버의 widgetRefresh 쿼터는 "카드 생성" 에만 걸리므로 단순 조회는 합산되지 않는다.
 */
package com.michaelkim.anima.work

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.michaelkim.anima.data.local.NotificationPrefsStore
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.concurrent.TimeUnit

object WorkScheduler {
    private const val PERIODIC_NAME = "anima_quote_periodic"
    private const val ONE_TIME_NAME = "anima_quote_once"
    private const val WINS_REMINDER_NAME = "anima_wins_reminder_daily"
    private const val AFFIRMATIONS_REMINDER_NAME = "anima_affirmations_reminder_daily"
    private const val MIDNIGHT_REFRESH_NAME = "anima_quote_midnight_daily"
    // WorkManager PeriodicWorkRequest 하한. 이보다 작게 주면 시스템이 조용히 15분으로 올린다.
    private const val PERIODIC_MINUTES = 15L

    /**
     * 정주기 갱신 간격(ms) — [com.michaelkim.anima.data.QuoteRepository.isStale] 이
     * "캐시가 묵었나" 임계치로 그대로 쓴다. 두 곳이 각자 15분을 들고 있으면 한쪽만 바꿨을 때
     * 위젯이 "안 묵었다" 고 판정하며 갱신을 건너뛰는 조용한 회귀가 난다 — 여기 하나로 묶는다.
     */
    val PERIODIC_REFRESH_MS: Long = TimeUnit.MINUTES.toMillis(PERIODIC_MINUTES)

    /**
     * 서버 데이터의 하루 경계(ymd) 기준 타임존 — 리마인더(기기 로컬)에는 쓰지 않는다.
     * 자정 갱신 예약과 위젯 캐시의 "어제 카드" 판정([QuoteRepository.isStale])이 공유한다.
     */
    val SERVER_DAY_ZONE: ZoneId = ZoneId.of("Asia/Seoul")
    // 자정 정각이 아니라 +1 분 — 서버의 ymd 가 자정 0분에 갈리는 race 를 피한다.
    private val MIDNIGHT_REFRESH_AT: LocalTime = LocalTime.of(0, 1)

    private fun networkConstraint() = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()

    fun schedulePeriodicRefresh(context: Context) {
        val request = PeriodicWorkRequestBuilder<QuoteRefreshWorker>(
            PERIODIC_MINUTES, TimeUnit.MINUTES,
        )
            .setConstraints(networkConstraint())
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            PERIODIC_NAME,
            // ⚠️ KEEP 이면 안 된다 — 이미 3시간 주기로 등록된 기존 설치는 앱을 업데이트해도
            //    옛 스케줄을 그대로 유지해 이 상수 변경이 아무 효과가 없다. UPDATE 는 같은
            //    unique-name 의 주기/제약만 갈아끼우므로 중복 실행 없이 새 주기가 적용된다.
            ExistingPeriodicWorkPolicy.UPDATE,
            request,
        )
    }

    fun scheduleOneTimeRefresh(context: Context) {
        val request = OneTimeWorkRequestBuilder<QuoteRefreshWorker>()
            .setConstraints(networkConstraint())
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            ONE_TIME_NAME,
            ExistingWorkPolicy.REPLACE,
            request,
        )
    }

    /**
     * 다음 저녁 알림 시각(기기 타임존, NotificationPrefsStore 의 eveningHour)까지의 지연으로
     * OneTime Worker 를 enqueue.
     * - 저녁 리마인더·일요일 회고·미완 과업 넛지가 **모두** 꺼져 있으면 예약을 취소한다
     *   (Worker 가 이 이름을 자기 재예약하므로 취소가 곧 루프 종료).
     *   ⚠️ 과업 넛지도 이 Worker 가 발송하므로 조건에서 빠지면 그 토글이 조용히 죽는다.
     * - 같은 날 시각이 아직 안 지났으면 오늘, 지났으면 내일.
     * - REPLACE 정책: 앱이 다시 열리거나 Worker 가 자기 재예약을 호출해도 항상 단 하나만 큐잉.
     * - 네트워크 제약 없음 — 로컬 알림이라 오프라인에서도 떠야 함.
     */
    fun scheduleDailyWinsReminder(context: Context) {
        val prefs = NotificationPrefsStore.read(context)
        if (!prefs.eveningEnabled && !prefs.weeklyReviewEnabled && !prefs.pendingTaskEnabled) {
            WorkManager.getInstance(context).cancelUniqueWork(WINS_REMINDER_NAME)
            return
        }
        val delayMillis = computeMillisUntilNext(
            LocalTime.of(prefs.eveningHour.coerceIn(0, 23), 0),
            ZoneId.systemDefault(),
        )
        val request = OneTimeWorkRequestBuilder<WinsReminderWorker>()
            .setInitialDelay(delayMillis, TimeUnit.MILLISECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            WINS_REMINDER_NAME,
            ExistingWorkPolicy.REPLACE,
            request,
        )
    }

    /**
     * 다음 아침 알림 시각(기기 타임존, NotificationPrefsStore 의 morningHour)까지의 지연으로
     * OneTime Worker 를 enqueue. "성공한 나에게 한 발 더" 다짐을 아침에 따라쓰도록 유도한다.
     * - 꺼져 있으면 예약을 취소한다.
     * - REPLACE 정책 + 자기 재예약: 항상 단 하나만 큐잉.
     * - 네트워크 제약 없음 — 로컬 알림이라 오프라인에서도 떠야 함.
     */
    fun scheduleDailyAffirmationsReminder(context: Context) {
        val prefs = NotificationPrefsStore.read(context)
        if (!prefs.morningEnabled) {
            WorkManager.getInstance(context).cancelUniqueWork(AFFIRMATIONS_REMINDER_NAME)
            return
        }
        val delayMillis = computeMillisUntilNext(
            LocalTime.of(prefs.morningHour.coerceIn(0, 23), 0),
            ZoneId.systemDefault(),
        )
        val request = OneTimeWorkRequestBuilder<AffirmationsReminderWorker>()
            .setInitialDelay(delayMillis, TimeUnit.MILLISECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            AFFIRMATIONS_REMINDER_NAME,
            ExistingWorkPolicy.REPLACE,
            request,
        )
    }

    /**
     * 다음 00:01 KST 까지의 지연으로 위젯 자동 갱신 Worker 를 enqueue.
     * - 자정 직후 새 ymd 로 todayProgress / streak / date 메타 / time-of-day CTA 가
     *   곧장 위젯에 반영되도록.
     * - REPLACE 정책 + Worker 의 자기 재예약: 항상 단 하나만 큐잉, 매일 한 번 발사.
     * - 네트워크 제약 없음 — 자정 재렌더(캐시 upcoming 미리보기로 그날 명언 교체)는
     *   오프라인에서도 일어나야 한다. fetch 실패는 Worker 가 삼키고 다음 Periodic 이 봉합.
     */
    fun scheduleDailyMidnightRefresh(context: Context) {
        val delayMillis = computeMillisUntilNext(MIDNIGHT_REFRESH_AT)
        val request = OneTimeWorkRequestBuilder<MidnightQuoteRefreshWorker>()
            .setInitialDelay(delayMillis, TimeUnit.MILLISECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            MIDNIGHT_REFRESH_NAME,
            ExistingWorkPolicy.REPLACE,
            request,
        )
    }

    private fun computeMillisUntilNext(at: LocalTime, zone: ZoneId = SERVER_DAY_ZONE): Long {
        val now: ZonedDateTime = ZonedDateTime.now(zone)
        var next: ZonedDateTime = now.with(at).withSecond(0).withNano(0)
        if (!next.isAfter(now)) {
            next = next.plusDays(1)
        }
        val millis = next.toInstant().toEpochMilli() - now.toInstant().toEpochMilli()
        return if (millis < 0L) 0L else millis
    }
}
