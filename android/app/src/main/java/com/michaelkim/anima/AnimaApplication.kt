/**
 * 앱 진입 부트스트랩.
 *
 * - 앱이 처음 켜질 때 WorkManager 주기 작업을 한 번 더 보장 (위젯이 없어도 사용자가 앱을 열면 캐시 채움).
 * - 매일 21:00 KST 잘한 일 알림 / 08:00 KST 다짐 알림도 함께 부트스트랩 — REPLACE 정책이라 중복 안 됨.
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
        // 매일 저녁 9시 "오늘 잘한 일 3가지" 로컬 알림.
        WorkScheduler.scheduleDailyWinsReminder(this)
        // 매일 아침 8시 "성공한 나에게 한 발 더" 다짐 따라쓰기 알림.
        WorkScheduler.scheduleDailyAffirmationsReminder(this)
    }
}
