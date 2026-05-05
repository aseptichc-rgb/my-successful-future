/**
 * 위젯 콘텐츠 백그라운드 갱신 Worker.
 *
 * - 3시간 주기 (slot 단위) Periodic 또는 OneTime 으로 트리거.
 * - 인증되어 있지 않으면 silent skip — Result.success() 로 빠져나와 재시도 폭주 방지.
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
import com.michaelkim.anima.widget.QuoteWidget
import java.io.IOException

class QuoteRefreshWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        if (!AuthRepository.isSignedIn) {
            // 로그인 전엔 갱신 무의미. 위젯은 placeholder 노출.
            QuoteWidget().updateAll(applicationContext)
            return Result.success()
        }
        return try {
            QuoteRepository.refresh(applicationContext)
            QuoteWidget().updateAll(applicationContext)
            Result.success()
        } catch (e: IOException) {
            // 네트워크 일시 장애 — 재시도
            Result.retry()
        } catch (e: Exception) {
            // 401/403 등 인증 만료 — 재시도해도 의미 없음.
            // 캐시 그대로 두고 다음 주기 대기.
            Result.success()
        }
    }
}
