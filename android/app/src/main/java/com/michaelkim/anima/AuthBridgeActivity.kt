/**
 * 웹(TWA) → 네이티브 FirebaseAuth 브릿지 전용, 비가시(NoDisplay) 액티비티.
 *
 * 왜 별도 액티비티인가:
 *  - 이전엔 MainActivity 가 anima://auth 인텐트 필터를 같이 들고 있었다. 그 결과 web AuthProvider 가
 *    hidden iframe 으로 인텐트를 발화하면 MainActivity 가 TWA 위로 떠 올라오고, onCreate 가
 *    setContent 없이 finish() 까지 비동기 대기 — 그동안 사용자는 빈 윈도우(흰 화면)를 본다.
 *  - NoDisplay 테마는 onCreate 안에서 finish() 가 호출될 때까지 어떤 UI 도 그리지 않으므로 TWA 가
 *    그대로 살아있는 듯 보인다. 사용자 시각적 인터럽트 0.
 *
 * 동작:
 *  - anima://auth?token=<customToken> 만 처리. token 누락/형식 오류면 finish().
 *  - signInWithCustomToken 으로 네이티브 FirebaseAuth 에 동일 uid 로그인 → 위젯 즉시 갱신.
 *  - 성공/실패와 무관하게 finally 에서 finish() — 액티비티가 백스택에 남지 않게.
 *
 * 보안:
 *  - customToken 위변조는 Firebase 서명 검증으로 차단. 외부 앱이 임의 토큰을 쏘아도 거부됨.
 *  - 토큰 자체는 짧은 수명(약 1시간) + 단발성.
 */
package com.michaelkim.anima

import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import com.google.firebase.auth.FirebaseAuth
import com.michaelkim.anima.work.WorkScheduler
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

class AuthBridgeActivity : ComponentActivity() {

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
        if (data == null || data.scheme != "anima" || data.host != "auth") {
            finish()
            return
        }
        val token = data.getQueryParameter("token")
        if (token.isNullOrBlank()) {
            Log.w(TAG, "anima://auth deep link 에 token 이 없음")
            finish()
            return
        }
        lifecycleScope.launch {
            try {
                FirebaseAuth.getInstance().signInWithCustomToken(token).await()
                Log.i(TAG, "네이티브 브릿지 로그인 성공 — 위젯 즉시 갱신")
                // 새 토큰으로 즉시 위젯을 채워준다. 정주기 Worker 도 함께 보장.
                WorkScheduler.scheduleOneTimeRefresh(applicationContext)
                WorkScheduler.schedulePeriodicRefresh(applicationContext)
            } catch (e: Exception) {
                Log.w(TAG, "네이티브 브릿지 signInWithCustomToken 실패", e)
            } finally {
                finish()
            }
        }
    }

    companion object {
        private const val TAG = "AuthBridgeActivity"
    }
}
