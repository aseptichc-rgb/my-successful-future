/**
 * 웹(TWA) → 네이티브 위젯 즉시 갱신 브릿지 전용, 비가시(NoDisplay) 액티비티.
 *
 * 왜 별도 액티비티인가:
 *  - TWA(Chrome) 안에서 사용자가 다짐 따라쓰기 · 행동 체크 · 잘한 일 3가지를 저장해도,
 *    위젯이 보는 캐시는 [QuoteRefreshWorker] 의 3시간 주기까지 stale 한 채로 남아 있어
 *    "앱에서 완수했는데 위젯엔 미완료" 인 어긋남이 발생했다.
 *  - 웹이 저장 await **전** user-activation 콜스택에서
 *    intent://widget-refresh#Intent;scheme=anima;package=...;end 을 발화한다.
 *  - 이 액티비티는 짧은 저장 유예 후 [QuoteRepository.refreshWithEntitlementRecovery]를 끝까지
 *    수행하고, 느린 저장/네트워크는 [WorkScheduler.scheduleMutationRefresh] 강제 폴백이
 *    한 번 더 봉합한다. 일반 앱 진입 Worker 와는 작업 이름이 달라 서로 취소하지 않는다.
 *
 *  - NoDisplay 테마 + noHistory + 즉시 finish() — TWA 위에 어떤 UI 도 그리지 않아 사용자
 *    시각적 인터럽트 0. [AuthBridgeActivity] 와 동일한 패턴.
 *
 * finish() 타이밍 (중요 — 크래시 회귀 방지):
 *  - Theme.NoDisplay 액티비티는 onResume 완료 전에 finish() 하지 않으면 시스템이
 *    IllegalStateException 으로 프로세스를 죽인다. 과거엔 동기 refresh(최대 4초)가 끝난 뒤에야
 *    finish() 해, 웹이 저장 직후 이 브릿지를 발화할 때마다 "앱이 중지되었습니다" 크래시가 났다.
 *  - 픽스: 작업은 프로세스 수명 스코프(ProcessLifecycleOwner)로 던지고 onCreate 에서 즉시 finish().
 *
 * 보안:
 *  - 이 액티비티는 위젯 갱신 외에 어떤 데이터도 변경하지 않는다.
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
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.lifecycle.lifecycleScope
import com.michaelkim.anima.data.QuoteRepository
import com.michaelkim.anima.data.auth.AuthRepository
import com.michaelkim.anima.util.CrashReporter
import com.michaelkim.anima.widget.QuoteWidget
import com.michaelkim.anima.work.WorkScheduler
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import java.util.concurrent.atomic.AtomicLong

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
        // fireIntentMultiPath 의 여러 전달 방식이 모두 도달해도 동일 탭을 한 번만 처리.
        val now = android.os.SystemClock.elapsedRealtime()
        val previous = lastHandledAtMs.getAndSet(now)
        if (now - previous in 0 until SIGNAL_DEDUP_MS) {
            finish()
            return
        }

        // 느린 Firestore/API 저장까지 따라잡는 지연 폴백. 일반 onResume Worker 와
        // 이름이 달라 앱 수명 이벤트가 REPLACE 해도 취소되지 않는다.
        try {
            WorkScheduler.scheduleMutationRefresh(applicationContext)
        } catch (e: Exception) {
            CrashReporter.record(TAG, "저장 후 지연 Worker enqueue 실패 — 즉시 시도만 진행", e)
        }

        // 동기 refresh — 사용자가 막 저장 → 다음 viewport 에서 위젯을 보면 새 진척도가 즉시
        // 반영되도록. 미로그인이면 캐시 건드리지 않고 바로 finish() 한다.
        if (!AuthRepository.isSignedIn) {
            Log.i(TAG, "미로그인 — 동기 refresh skip, Worker 폴백만")
            finish()
            return
        }
        // 작업은 프로세스 수명 스코프로 — NoDisplay 규칙(즉시 finish) 준수를 위해
        // 액티비티 종료 후에도 계속 실행된다. applicationContext 만 캡처하므로 누수 없음.
        val appContext = applicationContext
        ProcessLifecycleOwner.get().lifecycleScope.launch {
            // intent 는 저장 await 전에 발화한다. 웹 쓰기가 서버에 도착할 여유를 준 뒤
            // throttle 을 우회한 실시간 조회를 한다.
            delay(SAVE_SETTLE_DELAY_MS)
            try {
                // NoDisplay 액티비티는 이미 종료됐으므로 네트워크 호출을 짧은 UI 타임아웃으로
                // 취소하지 않는다. 응답을 받아 캐시에 쓰는 것이 이 작업의 유일한 성공 조건.
                QuoteRepository.refreshWithEntitlementRecovery(appContext)
                QuoteWidget().updateAll(appContext)
                Log.i(TAG, "저장 후 위젯 refresh 성공")
            } catch (e: Exception) {
                // 네트워크/401 등 — 지연 force Worker 가 이미 큐잉돼 있다.
                Log.w(TAG, "저장 후 위젯 refresh 실패 — 지연 Worker 폴백", e)
            }
        }
        // NoDisplay 규칙: onResume 완료 전 반드시 finish() — 위 코루틴과 독립적으로 즉시 종료.
        finish()
    }

    companion object {
        private const val TAG = "WidgetRefreshBridge"
        private const val SCHEME = "anima"
        private const val HOST = "widget-refresh"
        private const val SAVE_SETTLE_DELAY_MS = 1_200L
        private const val SIGNAL_DEDUP_MS = 1_000L
        private val lastHandledAtMs = AtomicLong(Long.MIN_VALUE)
    }
}
