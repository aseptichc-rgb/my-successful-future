/**
 * 웹(TWA) → 네이티브 로그아웃 브릿지 전용, 비가시(NoDisplay) 액티비티.
 *
 * 왜 별도 액티비티인가:
 *  - 웹 /settings 에서 로그아웃을 누르면 웹 FirebaseAuth 세션과 서버 쿠키는 정리되지만,
 *    네이티브 FirebaseAuth 와 위젯 캐시(QuoteCache)는 그대로 남아 "이전 계정의 명언/체크리스트"가
 *    홈 화면 위젯에 계속 노출되는 회귀가 발생했다.
 *  - 웹이 intent://signout#Intent;scheme=anima;package=...;end 을 hidden iframe 으로 발화 →
 *    Chrome 이 OS intent 로 해석 → 이 액티비티가 [AuthRepository.signOut] 을 실행해
 *    네이티브 세션·Credential 캐시·위젯 캐시를 한 번에 비우고 위젯 RemoteViews 를 재렌더한다.
 *
 *  - NoDisplay 테마 + noHistory — TWA 위에 어떤 UI 도 그리지 않아 시각적 인터럽트 0.
 *    [AuthBridgeActivity] · [WidgetRefreshBridgeActivity] 와 동일한 패턴.
 *
 * finish() 타이밍 (중요 — 크래시 회귀 방지):
 *  - Theme.NoDisplay 액티비티는 onResume 완료 전에 finish() 하지 않으면 시스템이
 *    IllegalStateException 으로 프로세스를 죽인다. 작업은 프로세스 수명 스코프로 던지고
 *    onCreate 에서 즉시 finish() 한다.
 *
 * 보안:
 *  - 이 액티비티는 "로그아웃 + 위젯 정리" 외의 어떤 데이터도 읽거나 쓰지 않는다.
 *  - 외부 앱이 임의로 발화해도 자신의 [FirebaseAuth] 세션과 자신의 위젯 캐시만 정리되므로
 *    권한 상승 경로 없음. 사용자 입장에서 최악은 "강제 로그아웃" 으로 다시 로그인하면 끝.
 */
package com.michaelkim.anima

import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.lifecycle.lifecycleScope
import com.michaelkim.anima.data.auth.AuthRepository
import com.michaelkim.anima.util.CrashReporter
import kotlinx.coroutines.launch

class SignOutBridgeActivity : ComponentActivity() {

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
        // 작업은 프로세스 수명 스코프로 — NoDisplay 규칙(즉시 finish) 준수를 위해
        // 액티비티 종료 후에도 계속 실행된다. applicationContext 만 캡처하므로 누수 없음.
        val appContext = applicationContext
        ProcessLifecycleOwner.get().lifecycleScope.launch {
            try {
                AuthRepository.signOut(appContext)
                Log.i(TAG, "웹 로그아웃 브릿지 처리 완료 — 위젯 캐시 정리 + 재렌더")
            } catch (e: Exception) {
                CrashReporter.record(TAG, "웹 로그아웃 브릿지 처리 실패", e)
            }
        }
        // NoDisplay 규칙: onResume 완료 전 반드시 finish() — 위 코루틴과 독립적으로 즉시 종료.
        finish()
    }

    companion object {
        private const val TAG = "SignOutBridge"
        private const val SCHEME = "anima"
        private const val HOST = "signout"
    }
}
