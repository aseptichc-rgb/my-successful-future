/**
 * 알림 설정 로컬 캐시.
 *
 * 진실은 서버(Firestore users/{uid}.notificationPrefs, 정책 정의는 웹
 * lib/notificationPolicy.ts). 이 캐시는 WorkScheduler 가 네트워크 없이도 다음 알림을
 * 예약할 수 있게 "마지막으로 본 설정"을 들고 있는다 — OnboardingPrefs 와 같은 역할 분담.
 *
 * 동기화 경로: QuoteRepository 가 /api/widget/today 응답을 저장할 때 함께 갱신하고,
 * 값이 바뀌었으면 리마인더를 재예약한다. 별도 API/브릿지 없음.
 *
 * SharedPreferences 를 쓰는 이유: WorkScheduler 는 Application.onCreate(메인 스레드)에서
 * 호출되므로 suspend 없는 동기 읽기가 필요하다 (DataStore 는 QuoteCache 처럼 suspend 전용).
 */
package com.michaelkim.anima.data.local

import android.content.Context
import com.michaelkim.anima.data.WidgetNotificationPrefs

object NotificationPrefsStore {
    private const val PREFS = "anima_notification_prefs"
    private const val KEY_MORNING_ENABLED = "morning_enabled"
    private const val KEY_MORNING_HOUR = "morning_hour"
    private const val KEY_EVENING_ENABLED = "evening_enabled"
    private const val KEY_EVENING_HOUR = "evening_hour"
    private const val KEY_WEEKLY_ENABLED = "weekly_enabled"
    private const val KEY_PENDING_TASK_ENABLED = "pending_task_enabled"

    /** 기본값(전부 켜짐, 08/21시) — 서버 응답을 아직 못 본 첫 실행에서도 기존 동작 유지. */
    fun read(context: Context): WidgetNotificationPrefs {
        return try {
            val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val d = WidgetNotificationPrefs()
            WidgetNotificationPrefs(
                morningEnabled = p.getBoolean(KEY_MORNING_ENABLED, d.morningEnabled),
                morningHour = p.getInt(KEY_MORNING_HOUR, d.morningHour).coerceIn(0, 23),
                eveningEnabled = p.getBoolean(KEY_EVENING_ENABLED, d.eveningEnabled),
                eveningHour = p.getInt(KEY_EVENING_HOUR, d.eveningHour).coerceIn(0, 23),
                weeklyReviewEnabled = p.getBoolean(KEY_WEEKLY_ENABLED, d.weeklyReviewEnabled),
                pendingTaskEnabled = p.getBoolean(KEY_PENDING_TASK_ENABLED, d.pendingTaskEnabled),
            )
        } catch (_: Exception) {
            WidgetNotificationPrefs()
        }
    }

    /**
     * 서버 응답의 설정을 저장한다.
     * @return 저장 전과 값이 달라졌으면 true — 호출부가 리마인더 재예약 여부를 판단하는 데 쓴다.
     */
    fun write(context: Context, prefs: WidgetNotificationPrefs): Boolean {
        return try {
            val before = read(context)
            if (before == prefs) return false
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_MORNING_ENABLED, prefs.morningEnabled)
                .putInt(KEY_MORNING_HOUR, prefs.morningHour.coerceIn(0, 23))
                .putBoolean(KEY_EVENING_ENABLED, prefs.eveningEnabled)
                .putInt(KEY_EVENING_HOUR, prefs.eveningHour.coerceIn(0, 23))
                .putBoolean(KEY_WEEKLY_ENABLED, prefs.weeklyReviewEnabled)
                .putBoolean(KEY_PENDING_TASK_ENABLED, prefs.pendingTaskEnabled)
                .apply()
            true
        } catch (_: Exception) {
            false
        }
    }
}
