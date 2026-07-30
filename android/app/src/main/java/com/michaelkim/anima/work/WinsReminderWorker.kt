/**
 * 매일 저녁(기본 21:00, 기기 타임존 — NotificationPrefsStore) 로컬 알림 Worker.
 *
 * 발송 정책 (정책 단일 소스: 웹 lib/notificationPolicy.ts — 이 Worker 는 실행만):
 *   - 일요일 + 주간 회고 켜짐 → "이번 주를 돌아볼 시간" 회고 알림으로 **대체** (추가 발송 아님).
 *   - 평일 저녁: 오늘 목표를 이미 다 체크했으면 **침묵** — 한 일에는 조용히.
 *     판정은 발화 직전 best-effort 네트워크 갱신(refreshIfStale) → 실패 시 캐시 → 그래도
 *     모르면 발송한다: 놓친 리마인더가 잘못 간 리마인더보다 비싸다.
 *   - 본문에 오늘의 목표 문구(캐시 goalsSnapshot)를 실어 "무엇을 하면 되는지"를 알림만 봐도
 *     알 수 있게 한다 (self-monitoring, BCT 2.3).
 *
 * - WorkScheduler 가 다음 저녁 시각까지의 지연을 계산해 OneTime 으로 enqueue.
 * - 실행되면: 알림 채널 보장 → (정책 판정) → 알림 게시 → 다음 저녁으로 자기 자신 재예약.
 * - POST_NOTIFICATIONS 권한이 없으면 silent skip (사용자가 거절했을 수 있음).
 *   재예약은 무조건 수행해야 다음 기회에 권한이 허용된 경우 정상 동작.
 * - 알림 탭 → MainActivity. 저녁 기록은 "wins" 타깃, 회고는 홈(기본)으로 진입.
 */
package com.michaelkim.anima.work

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.michaelkim.anima.MainActivity
import com.michaelkim.anima.R
import com.michaelkim.anima.data.QuoteRepository
import com.michaelkim.anima.data.WidgetTodayResponse
import com.michaelkim.anima.data.auth.AuthRepository
import com.michaelkim.anima.data.local.NotificationPrefsStore
import com.michaelkim.anima.util.CrashReporter
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.ZoneId

class WinsReminderWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val ctx = applicationContext
        try {
            val prefs = NotificationPrefsStore.read(ctx)
            val isReviewDay =
                LocalDate.now(ZoneId.systemDefault()).dayOfWeek == DayOfWeek.SUNDAY
            val weeklyMode = isReviewDay && prefs.weeklyReviewEnabled

            if (hasNotificationPermission(ctx)) {
                when {
                    weeklyMode -> {
                        ensureWeeklyChannel(ctx)
                        postWeeklyReviewReminder(ctx)
                    }
                    prefs.eveningEnabled -> {
                        // 오늘 목표를 이미 다 체크했으면 침묵. 모르면(오프라인 등) 발송.
                        val today = fetchTodayBestEffort(ctx)
                        if (today?.todayProgress?.actions != true) {
                            ensureChannel(ctx)
                            postWinsReminder(ctx, today?.slots?.firstOrNull()?.goalsSnapshot?.firstOrNull())
                        }
                    }
                    // 저녁 꺼짐 + 회고 요일 아님 — 회고만 켜둔 사용자를 위해 재예약만 유지.
                }
            }
            // 권한/발송 여부와 무관하게 다음 저녁으로 재예약 — 끊기면 영영 안 옴.
            // (설정이 전부 꺼졌으면 scheduleDailyWinsReminder 가 취소로 처리한다.)
            WorkScheduler.scheduleDailyWinsReminder(ctx)
            return Result.success()
        } catch (e: Exception) {
            // 알림 게시 실패해도 재예약은 시도. 그래도 실패하면 다음 앱 실행 시 부트스트랩에서 복구.
            CrashReporter.record(TAG, "저녁 알림 처리 실패 — 재예약만 시도", e)
            try { WorkScheduler.scheduleDailyWinsReminder(ctx) } catch (_: Exception) {}
            return Result.success()
        }
    }

    /**
     * "오늘 목표 체크 여부" 판정용 최신 데이터 best-effort 확보.
     * 캐시는 마지막 앱 사용 시점의 상태라 저녁 무렵엔 낡았을 수 있어 네트워크를 먼저 시도하고
     * (refreshIfStale — 90초 내 갱신됐으면 알아서 생략), 실패하면 캐시로 폴백한다.
     * 미로그인/전부 실패면 null — 호출부는 "모름 = 발송" 으로 처리한다.
     */
    private suspend fun fetchTodayBestEffort(ctx: Context): WidgetTodayResponse? {
        if (!AuthRepository.isSignedIn) return null
        return try {
            QuoteRepository.refreshIfStale(ctx)
        } catch (_: Exception) {
            try {
                QuoteRepository.getCached(ctx)?.response
            } catch (_: Exception) {
                null
            }
        }
    }

    private fun hasNotificationPermission(ctx: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        val granted = ContextCompat.checkSelfPermission(
            ctx, Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED
        return granted && NotificationManagerCompat.from(ctx).areNotificationsEnabled()
    }

    private fun ensureChannel(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            ctx.getString(R.string.wins_reminder_channel_name),
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = ctx.getString(R.string.wins_reminder_channel_description)
        }
        nm.createNotificationChannel(channel)
    }

    private fun ensureWeeklyChannel(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(WEEKLY_CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            WEEKLY_CHANNEL_ID,
            ctx.getString(R.string.weekly_review_channel_name),
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = ctx.getString(R.string.weekly_review_channel_description)
        }
        nm.createNotificationChannel(channel)
    }

    /** @param goalText 오늘의 목표 첫 문구 — 있으면 본문에 실어 행동을 구체화한다. */
    private fun postWinsReminder(ctx: Context, goalText: String?) {
        val tapIntent = Intent(ctx, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(MainActivity.EXTRA_OPEN_TARGET, MainActivity.OPEN_TARGET_WINS)
        }
        val pending = PendingIntent.getActivity(
            ctx,
            REQUEST_CODE_TAP,
            tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val body = if (goalText.isNullOrBlank()) {
            ctx.getString(R.string.wins_reminder_body)
        } else {
            ctx.getString(R.string.wins_reminder_body_goal, goalText)
        }
        val notif = NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification_wins)
            .setContentTitle(ctx.getString(R.string.wins_reminder_title))
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()
        NotificationManagerCompat.from(ctx).notify(NOTIFICATION_ID, notif)
    }

    /** 일요일 회고 알림 — 탭하면 홈(회고 카드가 뜨는 화면)으로 진입. */
    private fun postWeeklyReviewReminder(ctx: Context) {
        val tapIntent = Intent(ctx, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pending = PendingIntent.getActivity(
            ctx,
            REQUEST_CODE_WEEKLY_TAP,
            tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notif = NotificationCompat.Builder(ctx, WEEKLY_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification_wins)
            .setContentTitle(ctx.getString(R.string.weekly_review_title))
            .setContentText(ctx.getString(R.string.weekly_review_body))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()
        NotificationManagerCompat.from(ctx).notify(WEEKLY_NOTIFICATION_ID, notif)
    }

    companion object {
        const val CHANNEL_ID = "wins_reminder"
        const val NOTIFICATION_ID = 2001
        const val REQUEST_CODE_TAP = 2002
        const val WEEKLY_CHANNEL_ID = "weekly_review_reminder"
        const val WEEKLY_NOTIFICATION_ID = 2005
        const val REQUEST_CODE_WEEKLY_TAP = 2006
        private const val TAG = "WinsReminder"
    }
}
