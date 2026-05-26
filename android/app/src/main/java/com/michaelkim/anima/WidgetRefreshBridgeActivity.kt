/**
 * 웹(TWA) → 네이티브 위젯 즉시 갱신 브릿지 전용, 비가시(NoDisplay) 액티비티.
 *
 * 왜 별도 액티비티인가:
 *  - TWA(Chrome) 안에서 사용자가 다짐 따라쓰기 · 행동 체크 · 잘한 일 3가지를 저장해도,
 *    위젯이 보는 캐시는 [QuoteRefreshWorker] 의 3시간 주기까지 stale 한 채로 남아 있어
 *    "앱에서 완수했는데 위젯엔 미완료" 인 어긋남이 발생했다.
 *  - 웹이 intent://widget-refresh#Intent;scheme=anima;package=...;end 을 발화 →
 *    Chrome 이 OS intent 로 해석 → 이 액티비티가 받아 동기로 [QuoteRepository.refresh] 한 차례 +
 *    [WorkScheduler.scheduleOneTimeRefresh] 폴백을 큐잉한다. 동기 시도가 성공하면 위젯이
 *    다음 자체 redraw 에서 새 데이터로 보이고, 실패해도 Worker 가 봉합한다.
 *
 *  - NoDisplay 테마 + noHistory + 즉시 finish() — TWA 위에 어떤 UI 도 그리지 않아 사용자
 *    시각적 인터럽트 0. [AuthBridgeActivity] 와 동일한 패턴.
 *
 * 보안:
 *  - 이 액티비티는 위젯 갱신 외에 어떤 데이터도 읽거나 쓰지 않는다.
 *  - 외부 앱이 임의로 발화해도 [QuoteRefreshWorker] / 동기 refresh 모두 미로그인 상태면 silent
 *    skip 하므로 권한 상승/정보 노출 경로 없음. 캐시는 항상 본인 ID 토큰으로 보호된
 *    /api/widget/today 응답.
 */
package com.michaelkim.anima

import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.glance.appwidget.updateAll
import androidx.lifecycle.lifecycleScope
import com.michaelkim.anima.data.QuoteRepository
import com.michaelkim.anima.data.auth.AuthRepository
import com.michaelkim.anima.widget.QuoteWidget
import com.michaelkim.anima.work.WorkScheduler
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

class WidgetRefreshBridgeActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handle(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handle(intent)
    }

    private fun handle(intent: Intent?) {
        val data = intent?.data
        if (data == null || data.scheme != SCHEME || data.host != HOST) {
            finish()
            return
        }
        // 폴백 Worker 큐잉은 무조건 — 동기 시도가 실패해도 봉합되도록.
        // WorkManager 가 REPLACE 정책이라 동시 호출이 와도 단 1회만 실제 실행됨.
        try {
            WorkScheduler.scheduleOneTimeRefresh(applicationContext)
        } catch (e: Exception) {
            Log.w(TAG, "OneTime Worker enqueue 실패 — 동기 시도만 진행", e)
        }

        // 동기 refresh — 사용자가 막 저장 → 다음 viewport 에서 위젯을 보면 새 진척도가 즉시
        // 반영되도록. 미로그인이면 캐시 건드리지 않고 바로 finish() 한다.
        if (!AuthRepository.isSignedIn) {
            Log.i(TAG, "미로그인 — 동기 refresh skip, Worker 폴백만")
            finish()
            return
        }
        lifecycleScope.launch {
            try {
                withTimeoutOrNull(REFRESH_TIMEOUT_MS) {
                    try {
                        QuoteRepository.refresh(applicationContext)
                        QuoteWidget().updateAll(applicationContext)
                        Log.i(TAG, "위젯 동기 refresh 성공")
                    } catch (e: Exception) {
                        // 네트워크/401 등 — Worker 폴백이 이미 큐잉돼 있어 다음 사이클에 재시도.
                        Log.w(TAG, "위젯 동기 refresh 실패 — Worker 폴백으로 위임", e)
                    }
                }
            } finally {
                finish()
            }
        }
    }

    companion object {
        private const val TAG = "WidgetRefreshBridge"
        private const val SCHEME = "anima"
        private const val HOST = "widget-refresh"
        // 사용자 입력 직후 호출되므로 너무 길면 다른 액션을 막을 수 있다.
        // 정상 캐시 히트(Firestore 1회 read) 는 200-500ms.
        private const val REFRESH_TIMEOUT_MS = 2_000L
    }
}
