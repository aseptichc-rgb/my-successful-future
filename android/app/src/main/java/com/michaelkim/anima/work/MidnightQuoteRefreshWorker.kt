/**
 * 매일 KST 자정 직후(00:01) 위젯 콘텐츠를 강제 갱신하는 Worker.
 *
 * 왜 필요한가
 *  - WorkManager Periodic(3시간) 은 보장 주기가 아닌 평균 주기라 자정 직후 1~3시간 위젯이
 *    어제의 카드/체크리스트/streak 상태로 멈춰 있을 수 있다.
 *  - 백엔드는 KST 자정에 ymd 가 갈리고 새 todayProgress(전부 false) 로 회귀하지만, 위젯
 *    캐시는 다음 Periodic 까지 옛 값을 그대로 보여 사용자가 "오늘은 다 했는데 위젯에선
 *    어제 흔적이 남았다" 고 느낀다.
 *  - 자정 +1 분에 한 번 더 새 ymd 로 받아오면 이 어긋남이 0 분으로 줄어든다.
 *
 * 동작
 *  - QuoteRepository.refresh(applicationContext) — 인증 + /api/widget/today 호출 + 캐시 저장.
 *  - 미인증 / 네트워크 실패는 조용히 skip (어제 캐시 유지가 빈 화면보다 낫다).
 *  - 어떤 결과든 다음날 00:01 KST 로 자기 자신 재예약 — 끊기면 영영 안 옴.
 *
 * 정확성 vs 절전
 *  - WorkManager 는 Doze 모드에서 약간(수십 초 ~ 수 분) 지연될 수 있으나, 위젯이
 *    체감하는 정확도는 "분 단위" 면 충분하므로 setExactAndAllowWhileIdle(AlarmManager)
 *    까지 안 가도 된다. 정확도가 부족하면 추후 AlarmManager 로 격상.
 */
package com.michaelkim.anima.work

import android.content.Context
import androidx.glance.appwidget.updateAll
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.michaelkim.anima.data.QuoteRepository
import com.michaelkim.anima.data.auth.AuthRepository
import com.michaelkim.anima.widget.QuoteWidget

class MidnightQuoteRefreshWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val ctx = applicationContext
        try {
            if (AuthRepository.isSignedIn) {
                // 실패해도 catch 로 넘어가 재예약은 보장. 캐시는 어제 것 유지.
                try {
                    QuoteRepository.refresh(ctx)
                } catch (_: Exception) {
                    // 네트워크/인증 만료 등 — 다음 Periodic 또는 사용자 탭에서 자가 복구.
                }
                // 인용 데이터가 그대로라도 위젯은 한 번 재렌더 — date 메타 / time-of-day CTA /
                // todayProgress 리셋(자정에 갈린 새 ymd) 가 곧장 화면에 반영되도록.
                QuoteWidget().updateAll(ctx)
            }
            return Result.success()
        } finally {
            // 끊기면 영영 안 오므로 어떤 경로로 종료되든 항상 다음 자정으로 재예약.
            // scheduleDailyMidnightRefresh 자체가 throw 하는 케이스는 거의 없지만 방어.
            try {
                WorkScheduler.scheduleDailyMidnightRefresh(ctx)
            } catch (_: Exception) {
                // 다음 앱 실행 시 AnimaApplication.onCreate 부트스트랩에서 복구.
            }
        }
    }
}
