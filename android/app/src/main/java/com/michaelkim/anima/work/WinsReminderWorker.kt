/**
 * 매일 저녁(기본 21:00, 기기 타임존 — NotificationPrefsStore) 로컬 알림 Worker.
 *
 * 발송 정책 (정책 단일 소스: 웹 lib/notificationPolicy.ts decideEveningSlot — 이 Worker 는 실행만):
 *   - 일요일 + 주간 회고 켜짐 → "이번 주를 돌아볼 시간" 회고 알림으로 **대체** (추가 발송 아님).
 *   - 평일 저녁, 오늘 목표가 남아 있으면 → 목표 넛지. 본문에 오늘의 목표 문구를 실어
 *     "무엇을 하면 되는지"를 알림만 봐도 알게 한다 (self-monitoring, BCT 2.3).
 *     판정은 발화 직전 best-effort 네트워크 갱신 → 실패 시 캐시 → 그래도 모르면 발송한다:
 *     놓친 리마인더가 잘못 간 리마인더보다 비싸다.
 *   - 오늘 목표를 이미 다 했으면 지금까지는 **침묵**이었다. 그 빈 슬롯에만 미완 과업 넛지를
 *     넣는다(주 2회 상한은 서버가 판정해 notificationContent.pendingTask 유무로 내려준다).
 *     → 하루 최대 2건 가드레일 유지, 총 발송량 증가 0.
 *
 * - WorkScheduler 가 다음 저녁 시각까지의 지연을 계산해 OneTime 으로 enqueue.
 * - 실행되면: (정책 판정) → 알림 채널 보장 → 알림 게시 → 다음 저녁으로 자기 자신 재예약.
 * - POST_NOTIFICATIONS 권한이 없으면 silent skip (사용자가 거절했을 수 있음).
 *   재예약은 무조건 수행해야 다음 기회에 권한이 허용된 경우 정상 동작.
 * - 알림 탭 → MainActivity. 저녁 기록은 "wins", 회고는 홈, 과업 넛지는 서버가 지정한 설정 시트로.
 */
package com.michaelkim.anima.work

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.michaelkim.anima.MainActivity
import com.michaelkim.anima.R
import com.michaelkim.anima.data.WidgetNotificationCopy
import com.michaelkim.anima.data.WidgetTodayResponse
import com.michaelkim.anima.data.local.NotificationPrefsStore
import com.michaelkim.anima.util.CrashReporter
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.abs

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

            if (ReminderSupport.hasNotificationPermission(ctx)) {
                if (weeklyMode) {
                    postWeeklyReviewReminder(ctx)
                } else {
                    // 목표 넛지와 과업 넛지가 같은 데이터를 보므로 조회는 한 번만.
                    val today = ReminderSupport.fetchTodayBestEffort(ctx)
                    // 웹 decideEveningSlot 과 같은 순서: 오늘 할 일이 남아 있으면 그게 최우선이고,
                    // 침묵할 자리에만 과업 넛지를 넣는다.
                    if (prefs.eveningEnabled && today?.todayProgress?.actions != true) {
                        postWinsReminder(ctx, today)
                    } else if (prefs.pendingTaskEnabled) {
                        pendingTaskCopy(today)?.let { postPendingTaskReminder(ctx, it) }
                    }
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
     * 과업 넛지 문구 — **응답이 오늘 것일 때만** 쓴다.
     *
     * 주 2회 상한은 서버가 요일로 판정해 pendingTask 유무로 내려주므로, 오프라인에서 며칠 묵은
     * 캐시를 그대로 믿으면 그 상한을 넘겨 매일 같은 넛지를 보내게 된다. 목표 넛지와 달리 과업
     * 넛지는 "덤"이라 모를 때는 보내지 않는 쪽이 안전하다.
     *
     * 하루치 허용 오차를 두는 이유: 서버 ymd 는 KST 기준이라 다른 타임존 사용자는 정상 상황에서도
     * 기기 날짜와 하루 어긋난다 — 엄격 비교하면 그들에게는 넛지가 영영 안 간다.
     */
    private fun pendingTaskCopy(today: WidgetTodayResponse?): WidgetNotificationCopy? {
        val copy = today?.notificationContent?.pendingTask ?: return null
        val responseDay = try {
            LocalDate.parse(today.ymd)
        } catch (_: Exception) {
            return null
        }
        val localToday = LocalDate.now(ZoneId.systemDefault())
        val driftDays = abs(responseDay.toEpochDay() - localToday.toEpochDay())
        return if (driftDays <= MAX_YMD_DRIFT_DAYS) copy else null
    }

    /** 저녁 기록 리마인더 — 서버 조립 문구(목표 포함)를 우선 쓰고, 없으면 정적 폴백. */
    private fun postWinsReminder(ctx: Context, today: WidgetTodayResponse?) {
        ReminderSupport.ensureChannel(
            ctx,
            CHANNEL_ID,
            R.string.wins_reminder_channel_name,
            R.string.wins_reminder_channel_description,
        )
        val copy = today?.notificationContent?.evening
        // 폴백 경로에서도 목표 문구는 살린다 — 서버 문구가 없다고 본문까지 밋밋해지면 안 된다.
        val goalText = today?.slots?.firstOrNull()?.goalsSnapshot?.firstOrNull()
        val fallbackBody = if (goalText.isNullOrBlank()) {
            ctx.getString(R.string.wins_reminder_body)
        } else {
            ctx.getString(R.string.wins_reminder_body_goal, goalText)
        }
        ReminderSupport.postNotification(
            ctx = ctx,
            channelId = CHANNEL_ID,
            notificationId = NOTIFICATION_ID,
            requestCode = REQUEST_CODE_TAP,
            title = copy?.title?.takeIf { it.isNotBlank() }
                ?: ctx.getString(R.string.wins_reminder_title),
            body = copy?.body?.takeIf { it.isNotBlank() } ?: fallbackBody,
            openTarget = copy?.target ?: MainActivity.OPEN_TARGET_WINS,
        )
    }

    /**
     * 미완 과업 넛지 — 오늘 할 일을 다 해 침묵하던 저녁 슬롯을 대신 채운다.
     * 성격이 다른 알림이라 **별도 채널**로 둔다: 이것만 끄고 싶은 사용자가 리마인더 전체를
     * 끄지 않아도 되게(그게 opt-out 을 막는 가장 싼 장치다).
     *
     * 문구는 전적으로 서버가 조립한다 — 폴백 문자열을 두지 않는다. 무엇이 밀렸는지 모르는 채로
     * "뭔가 남았어요" 라고 보내면 무엇을 하라는 건지 알 수 없다.
     */
    private fun postPendingTaskReminder(ctx: Context, copy: WidgetNotificationCopy) {
        if (copy.title.isBlank() || copy.body.isBlank()) return
        ReminderSupport.ensureChannel(
            ctx,
            PENDING_CHANNEL_ID,
            R.string.pending_task_channel_name,
            R.string.pending_task_channel_description,
        )
        ReminderSupport.postNotification(
            ctx = ctx,
            channelId = PENDING_CHANNEL_ID,
            notificationId = PENDING_NOTIFICATION_ID,
            requestCode = REQUEST_CODE_PENDING_TAP,
            title = copy.title,
            body = copy.body,
            openTarget = copy.target,
        )
    }

    /** 일요일 회고 알림 — 탭하면 홈(회고 카드가 뜨는 화면)으로 진입. */
    private fun postWeeklyReviewReminder(ctx: Context) {
        ReminderSupport.ensureChannel(
            ctx,
            WEEKLY_CHANNEL_ID,
            R.string.weekly_review_channel_name,
            R.string.weekly_review_channel_description,
        )
        ReminderSupport.postNotification(
            ctx = ctx,
            channelId = WEEKLY_CHANNEL_ID,
            notificationId = WEEKLY_NOTIFICATION_ID,
            requestCode = REQUEST_CODE_WEEKLY_TAP,
            title = ctx.getString(R.string.weekly_review_title),
            body = ctx.getString(R.string.weekly_review_body),
            openTarget = null,
        )
    }

    companion object {
        const val CHANNEL_ID = "wins_reminder"
        const val NOTIFICATION_ID = 2001
        const val REQUEST_CODE_TAP = 2002
        const val WEEKLY_CHANNEL_ID = "weekly_review_reminder"
        const val WEEKLY_NOTIFICATION_ID = 2005
        const val REQUEST_CODE_WEEKLY_TAP = 2006
        const val PENDING_CHANNEL_ID = "pending_task_reminder"
        const val PENDING_NOTIFICATION_ID = 2007
        const val REQUEST_CODE_PENDING_TAP = 2008

        /** 서버 ymd(KST)와 기기 날짜의 허용 오차 — 타임존 차이는 정상, 그 이상은 묵은 캐시. */
        private const val MAX_YMD_DRIFT_DAYS = 1L
        private const val TAG = "WinsReminder"
    }
}
