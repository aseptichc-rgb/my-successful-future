/**
 * 웹(TWA) → 네이티브 위젯 즉시 갱신 브릿지 전용, 비가시(NoDisplay) 액티비티.
 *
 * 왜 별도 액티비티인가:
 *  - TWA(Chrome) 안에서 사용자가 다짐 따라쓰기 · 행동 체크 · 잘한 일 3가지를 저장해도,
 *    위젯이 보는 캐시는 [QuoteRefreshWorker] 의 3시간 주기까지 stale 한 채로 남아 있어
 *    "앱에서 완수했는데 위젯엔 미완료" 인 어긋남이 발생했다.
 *  - 웹이 intent://refresh-widget#Intent;scheme=anima;package=...;end 을 hidden iframe 으로
 *    발화 → Chrome 이 OS intent 로 해석 → 이 액티비티가 받아 [WorkScheduler.scheduleOneTimeRefresh]
 *    를 즉시 enqueue 한다. 작업이 끝나면 [QuoteRefreshWorker] 가 [QuoteWidget.updateAll] 까지
 *    호출하므로 홈 화면 위젯이 곧장 새 진척도를 반영한다.
 *
 *  - NoDisplay 테마 + noHistory + 즉시 finish() — TWA 위에 어떤 UI 도 그리지 않아 사용자
 *    시각적 인터럽트 0. [AuthBridgeActivity] 와 동일한 패턴.
 *
 * 보안:
 *  - 이 액티비티는 위젯 갱신 OneTime Worker 큐잉 외에 어떤 데이터도 읽거나 쓰지 않는다.
 *  - 외부 앱이 임의로 발화해도 [QuoteRefreshWorker] 가 미로그인 상태면 silent skip 하므로
 *    권한 상승/정보 노출 경로 없음. 캐시는 항상 본인 ID 토큰으로 보호된 /api/widget/today 응답.
 */
package com.michaelkim.anima

import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import com.michaelkim.anima.work.WorkScheduler

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
        try {
            val data = intent?.data
            if (data == null || data.scheme != SCHEME || data.host != HOST) {
                return
            }
            // OneTime Worker enqueue — 작업이 끝나면 위젯 RemoteViews 가 새 캐시로 재렌더된다.
            // 네트워크 제약은 Worker 가 내부에서 처리(CONNECTED 필요), 미충족 시 다음 가용 시점에 실행.
            WorkScheduler.scheduleOneTimeRefresh(applicationContext)
            Log.i(TAG, "위젯 즉시 갱신 트리거 수신 — OneTime Worker enqueued")
        } catch (e: Exception) {
            // 인텐트 파싱/스케줄링 어떤 실패도 사용자 흐름에 영향 주지 않는다.
            Log.w(TAG, "위젯 갱신 브릿지 처리 실패", e)
        } finally {
            finish()
        }
    }

    companion object {
        private const val TAG = "WidgetRefreshBridge"
        private const val SCHEME = "anima"
        private const val HOST = "widget-refresh"
    }
}
