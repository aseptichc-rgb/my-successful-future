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
 *  - signInWithCustomToken 으로 네이티브 FirebaseAuth 에 동일 uid 로그인.
 *  - 인증 직후 [QuoteRepository.refresh] 를 동기로 한 번 호출해 캐시를 즉시 채운다 —
 *    Worker 가 비동기로 따라잡기를 기다리면 사용자가 그 사이 위젯을 보면 EmptyState 가
 *    번쩍였다. [REFRESH_TIMEOUT_MS] 안에 끝나지 않으면 Worker 폴백으로 위임.
 *  - 그 후 위젯 RemoteViews 재렌더 + 정주기 Worker 보장 + 성공/실패 무관 finally finish().
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
import androidx.glance.appwidget.updateAll
import androidx.lifecycle.lifecycleScope
import com.google.firebase.auth.FirebaseAuth
import com.michaelkim.anima.data.QuoteRepository
import com.michaelkim.anima.data.local.QuoteCache
import com.michaelkim.anima.util.CrashReporter
import com.michaelkim.anima.widget.QuoteWidget
import com.michaelkim.anima.work.WorkScheduler
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull

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
                // 계정 전환 감지: 브릿지 진입 직전 uid 와 signInWithCustomToken 결과 uid 가 다르면
                // 이전 계정의 위젯 캐시는 그 즉시 stale 이다 — 새 토큰으로 데이터를 받기 전까지의
                // 짧은 구간 동안 "이전 계정의 명언/체크리스트" 가 노출되는 회귀를 막기 위해 비운다.
                val previousUid = FirebaseAuth.getInstance().currentUser?.uid
                val result = FirebaseAuth.getInstance().signInWithCustomToken(token).await()
                val newUid = result.user?.uid
                if (previousUid != null && newUid != null && previousUid != newUid) {
                    Log.i(TAG, "브릿지 로그인 계정 전환 감지: $previousUid → $newUid — 위젯 캐시 무효화")
                    try {
                        QuoteCache.clear(applicationContext)
                        QuoteWidget().updateAll(applicationContext)
                    } catch (e: Exception) {
                        Log.w(TAG, "계정 전환 캐시 정리 실패", e)
                    }
                }
                Log.i(TAG, "네이티브 브릿지 로그인 성공 — 캐시 즉시 채우기 시도")

                // 인증 직후 동기 refresh — Worker 가 비동기로 따라잡기를 기다리지 않고 이 자리에서
                // 한 번 fetch 해 위젯이 다음 자체 redraw 에서 EmptyState 가 아닌 콘텐츠를 갖도록.
                // 타임아웃을 두어 슬로 네트워크에서도 finally 의 finish() 가 지연되지 않게 한다.
                val refreshed = withTimeoutOrNull(REFRESH_TIMEOUT_MS) {
                    try {
                        QuoteRepository.refresh(applicationContext)
                        true
                    } catch (e: Exception) {
                        Log.w(TAG, "동기 refresh 실패 — Worker 폴백으로 위임", e)
                        false
                    }
                }
                // 동기 refresh 성공 여부와 무관하게 한번 더 RemoteViews 재렌더 — 캐시가 비어 있으면
                // EmptyState 로, 채워졌으면 콘텐츠로 자연스레 갱신된다.
                try {
                    QuoteWidget().updateAll(applicationContext)
                } catch (e: Exception) {
                    Log.w(TAG, "위젯 updateAll 실패 — 무시", e)
                }
                // 비동기 폴백 + 정주기 Worker 보장 (동기 refresh 가 실패/타임아웃 됐어도 안전망)
                if (refreshed != true) {
                    WorkScheduler.scheduleOneTimeRefresh(applicationContext)
                }
                WorkScheduler.schedulePeriodicRefresh(applicationContext)
            } catch (e: Exception) {
                CrashReporter.record(TAG, "네이티브 브릿지 signInWithCustomToken 실패", e)
            } finally {
                finish()
            }
        }
    }

    companion object {
        private const val TAG = "AuthBridgeActivity"
        // 동기 refresh 가 finally finish() 를 지연시키지 않게 짧게 제한.
        // 평균 케이스 (Firestore 1 read) 는 200-500ms 라 보통 그 안에 끝난다.
        private const val REFRESH_TIMEOUT_MS = 2_500L
    }
}
