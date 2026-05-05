/**
 * WorkManager 등록 헬퍼.
 *
 * - schedulePeriodicRefresh: 3시간 주기, KEEP 정책 (이미 있으면 그대로).
 * - scheduleOneTimeRefresh: 즉시 1회 — 위젯 첫 추가 / 사용자가 "지금 갱신" 누를 때.
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
import java.util.concurrent.TimeUnit

object WorkScheduler {
    private const val PERIODIC_NAME = "anima_quote_periodic"
    private const val ONE_TIME_NAME = "anima_quote_once"
    private const val PERIODIC_HOURS = 3L

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
}
