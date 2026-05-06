/**
 * WorkManager 등록 헬퍼.
 *
 * - schedulePeriodicRefresh: 3시간 주기, KEEP 정책 (이미 있으면 그대로).
 * - scheduleOneTimeRefresh: 즉시 1회 — 위젯 첫 추가 / 사용자가 "지금 갱신" 누를 때.
 * - scheduleDailyWinsReminder: 매일 21:00 KST 로컬 알림. OneTime + 자기 재예약 패턴.
 *
 * 안드로이드 PeriodicWorkRequest 의 최소 주기는 15분. 3시간은 충분히 안전.
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
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.concurrent.TimeUnit

object WorkScheduler {
    private const val PERIODIC_NAME = "anima_quote_periodic"
    private const val ONE_TIME_NAME = "anima_quote_once"
    private const val WINS_REMINDER_NAME = "anima_wins_reminder_daily"
    private const val PERIODIC_HOURS = 3L

    private val KST: ZoneId = ZoneId.of("Asia/Seoul")
    private val WINS_REMINDER_AT: LocalTime = LocalTime.of(21, 0)

    private fun networkConstraint() = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()

    fun schedulePeriodicRefresh(context: Context) {
        val request = PeriodicWorkRequestBuilder<QuoteRefreshWorker>(
            PERIODIC_HOURS, TimeUnit.HOURS,
        )
            .setConstraints(networkConstraint())
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            PERIODIC_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
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
     * 다음 21:00 KST 까지의 지연으로 OneTime Worker 를 enqueue.
     * - 같은 날 21:00 이 아직 안 지났으면 오늘 21:00, 지났으면 내일 21:00.
     * - REPLACE 정책: 앱이 다시 열리거나 Worker 가 자기 재예약을 호출해도 항상 단 하나만 큐잉.
     * - 네트워크 제약 없음 — 로컬 알림이라 오프라인에서도 떠야 함.
     */
    fun scheduleDailyWinsReminder(context: Context) {
        val delayMillis = computeMillisUntilNextWinsReminder()
        val request = OneTimeWorkRequestBuilder<WinsReminderWorker>()
            .setInitialDelay(delayMillis, TimeUnit.MILLISECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            WINS_REMINDER_NAME,
            ExistingWorkPolicy.REPLACE,
            request,
        )
    }

    private fun computeMillisUntilNextWinsReminder(): Long {
        val nowKst: ZonedDateTime = ZonedDateTime.now(KST)
        var nextKst: ZonedDateTime = nowKst.with(WINS_REMINDER_AT).withSecond(0).withNano(0)
        if (!nextKst.isAfter(nowKst)) {
            nextKst = nextKst.plusDays(1)
        }
        val millis = nextKst.toInstant().toEpochMilli() - nowKst.toInstant().toEpochMilli()
        return if (millis < 0L) 0L else millis
    }
}
