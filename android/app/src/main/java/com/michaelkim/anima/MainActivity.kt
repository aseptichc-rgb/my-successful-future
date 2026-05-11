/**
 * 메인 화면 진입점.
 *
 * 두 가지 역할:
 *  1) 위젯이 비어있을 때 사용자를 데려와 Google 로그인 → 위젯 채움.
 *  2) Anima 의 모든 기능 (페르소나 채팅, 데일리 리추얼 등) 은 Trusted Web Activity 로 전체화면 진입.
 *
 * 네이티브 화면은 "오늘의 한 마디" 미리보기 + 갱신 버튼 + Anima 열기 버튼 정도로만 유지.
 *
 * 추가 동작:
 *  - 잘한 일 저녁 알림 탭으로 진입한 경우(EXTRA_OPEN_TARGET=wins) → 곧장 /home 으로 TWA 진입.
 *  - 다짐 아침 알림 탭으로 진입한 경우(EXTRA_OPEN_TARGET=affirmations) → 곧장 /home 으로 TWA 진입.
 *  - 잠금화면 위젯 탭으로 진입한 경우(EXTRA_OPEN_TARGET=home) → 곧장 /home 으로 TWA 진입.
 *  - 앱 최초 실행 시 → 곧장 /onboarding 으로 TWA 진입 (이미 온보딩 완료된 사용자는 웹쪽이 /home 으로 즉시 리다이렉트).
 *  - HomeScreen 내부에서 Google 로그인 성공 직후에도 /onboarding 으로 진입 (신규 로그인 케이스).
 *  - Android 13+ 에서 POST_NOTIFICATIONS 런타임 권한 요청 (1회).
 *
 * TWA 동작 메모:
 *  - assetlinks.json 매칭이 성공하면 Chrome 이 주소창을 숨기고 전체화면으로 띄움.
 *  - 매칭 실패 시 자동으로 Chrome Custom Tabs 로 fallback (주소창은 보임 — 기능은 동일).
 *  - TWA 지원 브라우저 (Chrome/Edge 등) 가 전혀 없으면 일반 브라우저로 fallback.
 */
package com.michaelkim.anima

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.browser.trusted.TrustedWebActivityIntentBuilder
import androidx.core.content.ContextCompat
import com.google.androidbrowserhelper.trusted.TwaLauncher
import com.michaelkim.anima.ui.HomeScreen
import com.michaelkim.anima.work.WinsReminderWorker

class MainActivity : ComponentActivity() {

    private val requestNotificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* 결과 무시: 거부해도 앱 흐름은 유지 */ }

    // TWA 세션을 매번 새로 만들면 binder 누수가 생길 수 있어 액티비티 단위로 공유.
    private var twaLauncher: TwaLauncher? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ensureNotificationPermission()
        // 위젯/알림 탭으로 진입한 경우엔 네이티브 HomeScreen 을 그리지 않고
        // 곧장 /home TWA 로 보낸다 — 깜빡임 없이 "바로 홈 화면" 으로 보이도록.
        // 명시적 deep-link 이므로 첫 실행 온보딩보다 우선시한다.
        // 주의: TwaLauncher 가 CustomTabsService 바인딩을 비동기로 마칠 수 있어
        // 여기서 finish() 하지 않는다. 액티비티는 빈 화면으로 잠시 호스팅만 한다.
        if (shouldOpenHomeFromIntent(intent)) {
            openAnimaInTwa(path = "/home")
            return
        }
        setContent {
            HomeScreen(
                onOpenAnima = { path -> openAnimaInTwa(path = path) },
            )
        }
        // 최초 실행이면 자동으로 온보딩으로 보낸다 (멱등 — 이미 온보딩 끝낸 사용자는 웹쪽 onboarding 페이지가 /home 으로 리다이렉트).
        if (consumeFirstLaunchFlag()) {
            openAnimaInTwa(path = ONBOARDING_PATH)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (shouldOpenHomeFromIntent(intent)) {
            openAnimaInTwa(path = "/home")
        }
    }

    private fun shouldOpenHomeFromIntent(intent: Intent?): Boolean {
        val target = intent?.getStringExtra(EXTRA_OPEN_TARGET) ?: return false
        return target == OPEN_TARGET_WINS ||
            target == OPEN_TARGET_HOME ||
            target == OPEN_TARGET_AFFIRMATIONS
    }

    /**
     * 최초 실행 여부를 한 번만 true 로 돌려주고, 즉시 false 로 마킹한다.
     * SharedPreferences 호출 자체가 실패해도 (예: 디스크 풀) 앱 흐름은 유지 — 안전 기본값은 false.
     */
    private fun consumeFirstLaunchFlag(): Boolean {
        return try {
            val prefs = getSharedPreferences(PREFS_APP_FLAGS, Context.MODE_PRIVATE)
            val firstLaunch = !prefs.getBoolean(KEY_HAS_LAUNCHED, false)
            if (firstLaunch) {
                prefs.edit().putBoolean(KEY_HAS_LAUNCHED, true).apply()
            }
            firstLaunch
        } catch (_: Exception) {
            false
        }
    }

    private fun ensureNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val granted = ContextCompat.checkSelfPermission(
            this, Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED
        if (!granted) {
            requestNotificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    /**
     * 웹앱을 Trusted Web Activity 로 띄운다.
     *
     * - assetlinks.json 매칭이 성공하면 주소창 없이 전체화면.
     * - 매칭 실패/지원 안 되는 환경이면 androidbrowserhelper 가 자동으로 Custom Tabs 로 fallback.
     * - 모든 fallback 실패 시 일반 브라우저 인텐트로 최종 fallback.
     */
    private fun openAnimaInTwa(path: String?) {
        val baseUrl = BuildConfig.ANIMA_API_BASE_URL.removeSuffix("/")
        val url = if (path.isNullOrBlank()) baseUrl else baseUrl + path
        val uri = try {
            Uri.parse(url)
        } catch (_: Exception) {
            return
        }
        try {
            val launcher = twaLauncher ?: TwaLauncher(this).also { twaLauncher = it }
            val builder = TrustedWebActivityIntentBuilder(uri)
            launcher.launch(builder, null, null, null)
        } catch (_: Exception) {
            // TwaLauncher 실패 시 일반 브라우저 인텐트로 최종 fallback — 사용자가 어떻게든 웹앱에 도달하도록.
            try {
                val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                startActivity(intent)
            } catch (_: Exception) {
                // 외부 브라우저 미설치 등 — 무시.
            }
        }
    }

    override fun onDestroy() {
        // TwaLauncher 가 잡고 있는 CustomTabs 서비스 바인딩 해제.
        twaLauncher?.destroy()
        twaLauncher = null
        super.onDestroy()
    }

    companion object {
        // 인텐트 extra 키: 어느 화면을 열어 달라는 지시. 위젯/알림 등 외부 진입점이 공유한다.
        const val EXTRA_OPEN_TARGET = "open_target"
        // 잘한 일 저녁 알림 탭 — /home (잘한 일 섹션 포함) 으로 보낸다.
        const val OPEN_TARGET_WINS = "wins"
        // 다짐 아침 알림 탭 — /home (다짐 따라쓰기 영역 포함) 으로 보낸다.
        const val OPEN_TARGET_AFFIRMATIONS = "affirmations"
        // 잠금화면 위젯 탭 — /home 으로 보낸다.
        const val OPEN_TARGET_HOME = "home"

        private const val PREFS_APP_FLAGS = "anima_app_flags"
        private const val KEY_HAS_LAUNCHED = "has_launched_v1"
        private const val ONBOARDING_PATH = "/onboarding"
    }
}
