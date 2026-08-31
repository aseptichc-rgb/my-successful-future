/**
 * 위젯 콘텐츠 백그라운드 갱신 Worker.
 *
 * - 15분 주기 Periodic 또는 OneTime 으로 트리거 (주기 근거는 [WorkScheduler] 헤더 참고).
 * - 인증되어 있지 않으면 한 차례 재시도 (Result.retry) — 웹 → 네이티브 브릿지가 약간 늦게
 *   완료되는 짧은 윈도우 동안 위젯이 영구 EmptyState 로 굳는 회귀를 막는다. WorkManager 의
 *   재시도 정책은 백오프이므로 폭주 없음. runAttemptCount 가 [MAX_AUTH_RETRY] 이상이면
 *   조용히 success 로 빠져나와 다음 정주기까지 대기.
 * - 네트워크 오류는 Retry, 그 외는 success (캐시 보존).
 *
 * 작업 끝나면 Glance updateAll 로 위젯 RemoteViews 재렌더 트리거.
 */
package com.michaelkim.anima.work

import android.content.Context
import androidx.glance.appwidget.updateAll
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.michaelkim.anima.data.QuoteRepository
import com.michaelkim.anima.data.auth.AuthRepository
import com.michaelkim.anima.util.CrashReporter
import com.michaelkim.anima.widget.QuoteWidget
import java.io.IOException

class QuoteRefreshWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        if (!AuthRepository.isSignedIn) {
            // 로그인 전이라도 위젯을 한 번은 그려준다 (EmptyState 로).
            QuoteWidget().updateAll(applicationContext)
            // 웹 → 네이티브 브릿지가 onIdTokenChanged 비동기 콜백에서 발사되므로 첫 OneTime
            // Worker 가 브릿지보다 먼저 실행되면 isSignedIn=false 로 판정되어 EmptyState 가
            // 그대로 굳어버린다. 재시도 한 차례를 허용해 약 ~30초 안에 브릿지가 따라잡으면
            // 자가 봉합되도록 한다. 무한 재시도는 배터리 부담이므로 횟수로 제한.
            return if (runAttemptCount < MAX_AUTH_RETRY) Result.retry() else Result.success()
        }
        return try {
            // refreshIfStale: 직전 90초 내 갱신됐으면 네트워크 생략. onResume·포그라운드 진입·
            // OneTime/Periodic 트리거가 같은 윈도우에 겹쳐 /api/widget/today 를 연타하던 것을 막아
            // 일일 widgetRefresh 쿼터(48회) 소진을 방지한다.
            // 내부의 refreshWithEntitlementRecovery 가 신규 가입 402 / 만료 토큰 401 을 1회 구제하므로
            // "로그인했는데도 위젯이 영영 비던" 회귀 차단은 그대로 유지된다.
            QuoteRepository.refreshIfStale(applicationContext)
            QuoteWidget().updateAll(applicationContext)
            Result.success()
        } catch (e: IOException) {
            // 네트워크 일시 장애 — 재시도
            Result.retry()
        } catch (e: Exception) {
            // 구제 재시도 후에도 실패(영구 401/403 등) — 재시도해도 의미 없음.
            // "로그인했는데 위젯이 영영 비는" 회귀의 단서이므로 비치명적으로 보고. 캐시 그대로 두고 다음 주기 대기.
            CrashReporter.record(TAG, "위젯 refresh 구제 후에도 실패", e)
            Result.success()
        }
    }

    private companion object {
        // WorkManager 기본 백오프 (10s exponential) 로 ~30s ~ 1분 안에 자가 봉합될 횟수.
        // 더 큰 값은 배터리 부담만 키운다.
        const val MAX_AUTH_RETRY = 3
        const val TAG = "QuoteRefreshWorker"
    }
}
