/**
 * 매일 아침 8시(KST) "성공한 나에게 한 발 더" 로컬 알림 Worker.
 *
 * - WorkScheduler 가 다음 08:00 KST 까지의 지연을 계산해 OneTime 으로 enqueue.
 * - 실행되면: 알림 채널 보장 → 알림 게시 → 다음날 08:00 으로 자기 자신 재예약.
 * - POST_NOTIFICATIONS 권한이 없으면 silent skip — 재예약은 무조건 수행해 다음 기회에 권한이 허용된 경우 정상 동작.
 * - 알림 탭 → MainActivity 로 진입하며 EXTRA_OPEN_TARGET="affirmations" 로 /home (다짐 따라쓰기 영역) 진입을 트리거.
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

class AffirmationsReminderWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val ctx = applicationContext
        try {
            ensureChannel(ctx)
            if (hasNotificationPermission(ctx)) {
                postAffirmationsReminder(ctx)
            }
            // 권한 유무와 무관하게 다음 08:00 으로 재예약 — 끊기면 영영 안 옴.
            WorkScheduler.scheduleDailyAffirmationsReminder(ctx)
            return Result.success()
        } catch (e: Exception) {
            try { WorkScheduler.scheduleDailyAffirmationsReminder(ctx) } catch (_: Exception) {}
            return Result.success()
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
            ctx.getString(R.string.affirmations_reminder_channel_name),
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = ctx.getString(R.string.affirmations_reminder_channel_description)
        }
        nm.createNotificationChannel(channel)
    }

    private fun postAffirmationsReminder(ctx: Context) {
        val tapIntent = Intent(ctx, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(MainActivity.EXTRA_OPEN_TARGET, MainActivity.OPEN_TARGET_AFFIRMATIONS)
        }
        val pending = PendingIntent.getActivity(
            ctx,
            REQUEST_CODE_TAP,
            tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notif = NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification_wins)
            .setContentTitle(ctx.getString(R.string.affirmations_reminder_title))
            .setContentText(ctx.getString(R.string.affirmations_reminder_body))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()
        NotificationManagerCompat.from(ctx).notify(NOTIFICATION_ID, notif)
    }

    companion object {
        const val CHANNEL_ID = "affirmations_reminder"
        const val NOTIFICATION_ID = 2003
        const val REQUEST_CODE_TAP = 2004
    }
}
