/**
 * 웹(TWA) → 네이티브 Play In-App Review 브릿지.
 *
 * 왜 별도 액티비티인가:
 *  - TWA 안의 웹은 Play In-App Review API 를 직접 부를 수 없다. 웹 리뷰 카드(components/home/
 *    StoreReviewCard)의 [리뷰 남기기] 탭이 사용자 제스처 안에서 anima://review 인텐트를 발화하고,
 *    이 액티비티가 그 자리에서 ReviewManager 로 별점 시트를 띄운다.
 *  - 시트(Play UI)는 이 액티비티 위로 떠야 하므로 NoDisplay 가 아닌 Translucent 테마를 쓰고,
 *    시트가 닫혀 콜백이 올 때까지 살아 있어야 하므로 noHistory 도 쓰지 않는다 —
 *    [PurchaseBridgeActivity] 와 같은 구조.
 *
 * 동작:
 *  1) requestReviewFlow — ReviewInfo 조회(네트워크). 오래 걸리면 조용히 포기한다.
 *  2) launchReviewFlow — 시트 표시. **표시 여부는 Play 가 정한다**(기기·앱별 쿼터). 표시되지 않아도
 *     Task 는 정상 완료로 돌아오므로 결과를 성공/실패로 해석하지 않는다(Google 가이드라인).
 *  3) 어떤 경우에도 finish — 웹 흐름을 막지 않는다. 웹 카드는 탭 즉시 사라지고 다시 묻지 않는다.
 *
 * 중복 방지:
 *  - 웹은 도달 확률을 위해 같은 인텐트를 3경로(iframe·anchor·form)로 쏜다. 모두 도달해 액티비티가
 *    여러 개 떠도 프로세스 전역 타임스탬프로 한 번만 시트를 띄우고 나머지는 즉시 finish 한다
 *    ([WidgetRefreshBridgeActivity] 의 SIGNAL_DEDUP 과 같은 기법).
 *
 * 보안:
 *  - 인텐트에 어떤 데이터도 싣지 않고, 이 액티비티는 어떤 사용자 데이터도 읽거나 바꾸지 않는다.
 *    외부 앱이 임의로 발화해도 별점 시트가 한 번 뜨는 것 이상의 효과가 없다.
 */
package com.michaelkim.anima

import android.content.Intent
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.play.core.review.ReviewManagerFactory
import com.michaelkim.anima.util.CrashReporter
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull
import java.util.concurrent.atomic.AtomicLong

class ReviewBridgeActivity : ComponentActivity() {

    // 시트가 떴다 돌아오며 onResume 이 다시 불려도 흐름을 중복 실행하지 않도록 1회 가드.
    @Volatile
    private var handled = false

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
        if (handled) return
        handled = true

        // 웹의 3경로 발화가 모두 도달해도 시트는 한 번만.
        val now = SystemClock.elapsedRealtime()
        val previous = lastHandledAtMs.getAndSet(now)
        if (now - previous in 0 until SIGNAL_DEDUP_MS) {
            finish()
            return
        }

        lifecycleScope.launch {
            try {
                val manager = ReviewManagerFactory.create(applicationContext)
                // ReviewInfo 조회는 네트워크를 탄다. 사용자는 탭 뒤 투명 화면만 보고 있으므로
                // 오래 끌지 않고 포기한다 — 시트 없이 끝나는 것은 Play 쿼터 거절과 같은 정상 경로.
                val reviewInfo = withTimeoutOrNull(REQUEST_TIMEOUT_MS) {
                    manager.requestReviewFlow().await()
                }
                if (reviewInfo == null) {
                    Log.w(TAG, "ReviewInfo 조회 시간 초과 — 시트 생략")
                    return@launch
                }
                // 시트가 닫힐 때(또는 Play 가 표시를 생략할 때) 완료된다. 결과값은 없다.
                manager.launchReviewFlow(this@ReviewBridgeActivity, reviewInfo).await()
                Log.i(TAG, "인앱 리뷰 흐름 완료")
            } catch (e: Exception) {
                // 사이드로드 빌드(Play 미설치 출처)·Play 서비스 부재 등 — 리뷰는 부가 기능이라 조용히 종료.
                CrashReporter.record(TAG, "인앱 리뷰 흐름 실패", e)
            } finally {
                finish()
            }
        }
    }

    companion object {
        private const val TAG = "ReviewBridge"
        private const val SCHEME = "anima"
        private const val HOST = "review"
        private const val REQUEST_TIMEOUT_MS = 10_000L
        private const val SIGNAL_DEDUP_MS = 3_000L
        private val lastHandledAtMs = AtomicLong(Long.MIN_VALUE)
    }
}
