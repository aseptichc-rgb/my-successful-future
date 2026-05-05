/**
 * 앱 진입 부트스트랩.
 *
 * - 앱이 처음 켜질 때 WorkManager 주기 작업을 한 번 더 보장 (위젯이 없어도 사용자가 앱을 열면 캐시 채움).
 * - Firebase 는 google-services 플러그인이 자동 초기화하므로 별도 코드 없음.
 */
package com.michaelkim.anima

import android.app.Application
import com.michaelkim.anima.work.WorkScheduler

class AnimaApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // 위젯 추가 전에라도 캐시는 미리 받아둠 — 첫 위젯 추가 시 즉시 콘텐츠 노출.
        WorkScheduler.schedulePeriodicRefresh(this)
        WorkScheduler.scheduleOneTimeRefresh(this)
    }
}
