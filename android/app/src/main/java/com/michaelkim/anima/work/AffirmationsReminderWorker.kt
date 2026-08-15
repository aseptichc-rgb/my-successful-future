/**
 * 매일 아침(기본 08:00, 기기 타임존 — NotificationPrefsStore) 로컬 알림 Worker.
 *
 * 본문 정책: **오늘의 명언 실문구**를 그대로 싣는다(서버가 사용자 언어로 조립해
 * /api/widget/today 의 notificationContent.morning 으로 내려준다). 알림만 봐도 오늘 한 마디를
 * 읽게 하려는 것 — 매일 같은 고정 문구는 곧 알림 피로 → opt-out 으로 이어진다.
 * 조회 실패/옛 서버 응답이면 strings.xml 정적 문구로 폴백한다(알림은 끊기지 않는다).
 *
 * - WorkScheduler 가 다음 아침 시각까지의 지연을 계산해 OneTime 으로 enqueue.
 * - 실행되면: 알림 채널 보장 → 문구 확보 → 알림 게시 → 다음 아침으로 자기 자신 재예약.
 * - POST_NOTIFICATIONS 권한이 없으면 silent skip — 재예약은 무조건 수행해 다음 기회에 권한이 허용된 경우 정상 동작.
 * - 알림 탭 → MainActivity 로 진입하며 /home (다짐 따라쓰기 영역) 진입을 트리거.
 */
package com.michaelkim.anima.work

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.michaelkim.anima.MainActivity
import com.michaelkim.anima.R
import com.michaelkim.anima.data.local.NotificationPrefsStore
import com.michaelkim.anima.util.CrashReporter

class AffirmationsReminderWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val ctx = applicationContext
        try {
            // 발화 직전에도 설정을 확인한다 — 예약 후 사용자가 껐다면(다음 refresh 전) 침묵.
            if (ReminderSupport.hasNotificationPermission(ctx) &&
                NotificationPrefsStore.read(ctx).morningEnabled
            ) {
                ReminderSupport.ensureChannel(
                    ctx,
                    CHANNEL_ID,
                    R.string.affirmations_reminder_channel_name,
                    R.string.affirmations_reminder_channel_description,
                )
                postAffirmationsReminder(ctx)
            }
            // 권한 유무와 무관하게 다음 아침으로 재예약 — 끊기면 영영 안 옴.
            // (꺼져 있으면 scheduleDailyAffirmationsReminder 가 취소로 처리한다.)
            WorkScheduler.scheduleDailyAffirmationsReminder(ctx)
            return Result.success()
        } catch (e: Exception) {
            CrashReporter.record(TAG, "다짐 알림 처리 실패 — 재예약만 시도", e)
            try { WorkScheduler.scheduleDailyAffirmationsReminder(ctx) } catch (_: Exception) {}
            return Result.success()
        }
    }

    /** 서버 조립 문구(오늘의 명언)를 우선 쓰고, 없으면 정적 폴백. */
    private suspend fun postAffirmationsReminder(ctx: Context) {
        val copy = ReminderSupport.fetchTodayBestEffort(ctx)?.notificationContent?.morning
        ReminderSupport.postNotification(
            ctx = ctx,
            channelId = CHANNEL_ID,
            notificationId = NOTIFICATION_ID,
            requestCode = REQUEST_CODE_TAP,
            title = copy?.title?.takeIf { it.isNotBlank() }
                ?: ctx.getString(R.string.affirmations_reminder_title),
            body = copy?.body?.takeIf { it.isNotBlank() }
                ?: ctx.getString(R.string.affirmations_reminder_body),
            openTarget = copy?.target ?: MainActivity.OPEN_TARGET_AFFIRMATIONS,
            // 명언이 제목 길이를 넘어 잘린 경우에만 전문이 실려 온다 — 펼치면 전문을 보여준다.
            bigText = copy?.fullText,
        )
    }

    companion object {
        const val CHANNEL_ID = "affirmations_reminder"
        const val NOTIFICATION_ID = 2003
        const val REQUEST_CODE_TAP = 2004
        private const val TAG = "AffirmationsReminder"
    }
}
