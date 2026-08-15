/**
 * 리마인더 Worker 공용 헬퍼.
 *
 * AffirmationsReminderWorker / WinsReminderWorker 가 권한 확인·채널 생성·오늘 데이터 확보를
 * 각자 복붙해 들고 있었다. 한쪽만 고쳤을 때 두 알림의 동작이 조용히 갈라지므로 여기로 모은다.
 *
 * 알림 ID 대역(중복 notify() 로 서로를 덮어쓰지 않도록 전역 관리):
 *   2001/2002  저녁 기록 리마인더        (WinsReminderWorker)
 *   2003/2004  아침 다짐 리마인더        (AffirmationsReminderWorker)
 *   2005/2006  일요일 주간 회고          (WinsReminderWorker)
 *   2007/2008  미완 과업 넛지            (WinsReminderWorker — 침묵 슬롯 대체)
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
import androidx.annotation.StringRes
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.michaelkim.anima.MainActivity
import com.michaelkim.anima.R
import com.michaelkim.anima.data.QuoteRepository
import com.michaelkim.anima.data.WidgetTodayResponse
import com.michaelkim.anima.data.auth.AuthRepository

object ReminderSupport {

    /**
     * 알림을 게시해도 되는가. 런타임 권한과 **사용자가 설정에서 앱 알림을 껐는지**를 함께 본다
     * — 권한만 보면 시스템 설정에서 끈 사용자에게 계속 notify() 를 던지게 된다.
     */
    fun hasNotificationPermission(ctx: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        val granted = ContextCompat.checkSelfPermission(
            ctx, Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED
        return granted && NotificationManagerCompat.from(ctx).areNotificationsEnabled()
    }

    /** 채널이 없을 때만 생성. 이미 있으면 사용자가 바꾼 설정(중요도 등)을 덮어쓰지 않는다. */
    fun ensureChannel(
        ctx: Context,
        channelId: String,
        @StringRes nameRes: Int,
        @StringRes descriptionRes: Int,
    ) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(channelId) != null) return
        val channel = NotificationChannel(
            channelId,
            ctx.getString(nameRes),
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = ctx.getString(descriptionRes)
        }
        nm.createNotificationChannel(channel)
    }

    /**
     * 발화 직전 오늘 데이터 best-effort 확보.
     * 캐시는 마지막 앱 사용 시점의 상태라 낡았을 수 있어 네트워크를 먼저 시도하고
     * (refreshIfStale — 90초 내 갱신됐으면 알아서 생략), 실패하면 캐시로 폴백한다.
     * 미로그인/전부 실패면 null — 호출부는 "모름" 을 안전한 방향으로 해석할 것.
     */
    suspend fun fetchTodayBestEffort(ctx: Context): WidgetTodayResponse? {
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

    /**
     * 알림 하나를 게시한다. 세 알림이 아이콘·우선순위·자동취소·BigText 처리를 똑같이 하므로
     * 빌더 조립을 한 곳에 둔다 — 한쪽만 스타일이 어긋나는 일이 없도록.
     *
     * @param openTarget MainActivity.EXTRA_OPEN_TARGET 값. null 이면 홈으로 진입.
     * @param bigText 펼쳤을 때 보여줄 전문. null 이면 body 를 그대로 확장한다.
     */
    fun postNotification(
        ctx: Context,
        channelId: String,
        notificationId: Int,
        requestCode: Int,
        title: String,
        body: String,
        openTarget: String?,
        bigText: String? = null,
    ) {
        val tapIntent = Intent(ctx, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (openTarget != null) putExtra(MainActivity.EXTRA_OPEN_TARGET, openTarget)
        }
        val pending = PendingIntent.getActivity(
            ctx,
            requestCode,
            tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val expanded = bigText?.takeIf { it.isNotBlank() } ?: body
        val notif = NotificationCompat.Builder(ctx, channelId)
            .setSmallIcon(R.drawable.ic_notification_wins)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(expanded))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()
        NotificationManagerCompat.from(ctx).notify(notificationId, notif)
    }
}
