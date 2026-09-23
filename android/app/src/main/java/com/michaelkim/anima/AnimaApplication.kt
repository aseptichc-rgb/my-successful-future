/**
 * 앱 진입 부트스트랩.
 *
 * - 앱이 처음 켜질 때 WorkManager 주기 작업을 한 번 더 보장 (위젯이 없어도 사용자가 앱을 열면 캐시 채움).
 * - 매일 저녁 잘한 일 알림 / 아침 다짐 알림 / 00:01 KST 위젯 자동 갱신도 함께 부트스트랩.
 *   ⚠️ 일일 예약 셋은 반드시 KEEP — 알림 Worker 가 발화 시각에 죽은 프로세스를 깨우면
 *   onCreate 가 Worker 실행보다 먼저 도는데, REPLACE 재예약은 그 시점의 "다음 발화 = 내일"
 *   계산으로 막 실행되려던 오늘 작업을 취소한다(아침 다짐 알림이 매일 증발하던 원인).
 * - ProcessLifecycleOwner 가 ON_START 를 보낼 때마다 위젯 OneTime refresh 를 깨운다 —
 *   사용자가 다른 앱에서 돌아오거나 우리 프로세스가 백그라운드에서 다시 깨어나는 순간을 catch.
 * - Firebase 는 google-services 플러그인이 자동 초기화하므로 별도 코드 없음.
 */
package com.michaelkim.anima

import android.app.Application
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.work.ExistingWorkPolicy
import com.google.firebase.crashlytics.FirebaseCrashlytics
import com.michaelkim.anima.data.auth.AuthRepository
import com.michaelkim.anima.util.CrashReporter
import com.michaelkim.anima.work.WorkScheduler

class AnimaApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // 디버그 빌드는 Crashlytics 전송 끔 — 릴리스에서만 수집(개발 중 테스트 크래시로 대시보드 오염 방지).
        FirebaseCrashlytics.getInstance().isCrashlyticsCollectionEnabled = !BuildConfig.DEBUG
        // 위젯 추가 전에라도 캐시는 미리 받아둠 — 첫 위젯 추가 시 즉시 콘텐츠 노출.
        WorkScheduler.schedulePeriodicRefresh(this)
        WorkScheduler.scheduleOneTimeRefresh(this)
        // 일일 예약 부트스트랩 — KEEP: 살아 있는 예약은 그대로 두고 끊긴 체인만 되살린다.
        // (REPLACE 였을 때 발화 직전 자기취소 레이스로 아침·저녁 알림이 스킵되던 버그 수정.)
        // 매일 저녁 9시 "오늘 잘한 일 3가지" 로컬 알림.
        WorkScheduler.scheduleDailyWinsReminder(this, ExistingWorkPolicy.KEEP)
        // 매일 아침 8시 "성공한 나에게 한 발 더" 다짐 따라쓰기 알림.
        WorkScheduler.scheduleDailyAffirmationsReminder(this, ExistingWorkPolicy.KEEP)
        // 매일 자정+1분 위젯 자동 갱신 — 새 ymd / streak / time-of-day CTA 즉시 반영.
        WorkScheduler.scheduleDailyMidnightRefresh(this, ExistingWorkPolicy.KEEP)

        // 프로세스 전반의 foreground 진입 catch — TWA 에서 돌아오거나 다른 앱에서 우리 앱이
        // 깨어나는 모든 경로를 단일 지점에서 봉합한다. MainActivity.onResume 만으로는
        // 앱 프로세스가 백그라운드에서 깨어나는 케이스(예: 시스템이 우리를 잠시 살릴 때)를 놓친다.
        ProcessLifecycleOwner.get().lifecycle.addObserver(ForegroundWidgetRefresher(this))
    }
}

/**
 * 앱 프로세스가 foreground 로 전환될 때마다 OneTime Worker 를 깨워 위젯을 최신화한다.
 *
 * 디바운스: 앱이 짧은 사이클로 foreground/background 를 반복하면 매 ON_START 마다 큐잉되지만,
 * WorkManager 의 ExistingWorkPolicy.REPLACE 가 동일 unique-name 작업을 한 번만 실행하도록
 * 보장한다 — 폭주 없음. 우리 쪽 추가 디바운스는 불필요.
 */
private class ForegroundWidgetRefresher(
    private val app: Application,
) : DefaultLifecycleObserver {
    override fun onStart(owner: LifecycleOwner) {
        if (!AuthRepository.isSignedIn) return
        try {
            WorkScheduler.scheduleOneTimeRefresh(app)
        } catch (e: Exception) {
            CrashReporter.record(TAG, "ON_START widget refresh enqueue 실패", e)
        }
    }

    private companion object {
        const val TAG = "FgWidgetRefresher"
    }
}
