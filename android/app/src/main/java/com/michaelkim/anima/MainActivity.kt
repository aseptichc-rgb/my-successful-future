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
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.browser.trusted.TrustedWebActivityIntentBuilder
import androidx.core.content.ContextCompat
import androidx.glance.appwidget.updateAll
import androidx.lifecycle.lifecycleScope
import com.google.androidbrowserhelper.trusted.TwaLauncher
import com.michaelkim.anima.data.QuoteRepository
import com.michaelkim.anima.data.api.ApiClient
import com.michaelkim.anima.data.auth.AuthRepository
import com.michaelkim.anima.ui.HomeScreen
import com.michaelkim.anima.widget.QuoteWidget
import com.michaelkim.anima.work.WinsReminderWorker
import com.michaelkim.anima.work.WorkScheduler
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

class MainActivity : ComponentActivity() {

    private val requestNotificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* 결과 무시: 거부해도 앱 흐름은 유지 */ }

    // TWA 세션을 매번 새로 만들면 binder 누수가 생길 수 있어 액티비티 단위로 공유.
    private var twaLauncher: TwaLauncher? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ensureNotificationPermission()
        // 주의: anima://auth 브릿지 딥링크는 AuthBridgeActivity (NoDisplay) 가 전담한다.
        // MainActivity 가 처리하면 setContent 전에 finish 가 비동기 대기되어 흰 화면이 보였다.
        // 위젯/알림 탭으로 진입한 경우엔 네이티브 HomeScreen 을 그리지 않고
        // 곧장 /home TWA 로 보낸다 — 깜빡임 없이 "바로 홈 화면" 으로 보이도록.
        // 명시적 deep-link 이므로 첫 실행 온보딩보다 우선시한다.
        // finishAfterLaunch=true: TWA 가 실제로 뜬 뒤 MainActivity 를 종료 — 그렇게 안 하면
        // 빈 윈도(흰 화면) 가 백스택에 남아 TWA 에서 뒤로가기를 누르면 흰 화면에 멈춘다.
        if (shouldOpenHomeFromIntent(intent)) {
            // 위젯/알림에서 진입한 케이스 — 캐시가 최대 3시간 stale 일 수 있다.
            // 비동기 Worker 만으로는 TWA 가 먼저 열려 위젯(stale) 과 /home(최신) 이
            // 그 순간 어긋나 보이므로, TWA 를 띄우기 전에 동기로 한번 더 fetch.
            refreshWidgetCacheThenOpenHome()
            return
        }
        // 이미 로그인된 사용자는 네이티브 컨트롤 패널을 거치지 않고 곧장 TWA /home 으로 보낸다.
        // 위젯 인증·로그아웃 등 컨트롤은 웹앱 안에서 제공하므로 네이티브 화면은 비로그인 진입자 전용.
        // 위젯 탭과 동일하게 TWA 진입 전 위젯 캐시를 동기 갱신 — 앱 아이콘으로 들어와도
        // 홈 화면 위젯(stale 로컬 캐시) 과 /home(서버 최신) 의 명언이 어긋나지 않도록.
        if (AuthRepository.isSignedIn) {
            refreshWidgetCacheThenOpenHome()
            return
        }
        setContent {
            HomeScreen(
                onOpenAnima = { path -> openAnimaInTwa(path = path) },
            )
        }
        // 첫 실행 플래그는 비워두기만 한다 — 자동으로 TWA /onboarding 을 띄우지 않는다.
        // 왜: 웹 로그인 후 iframe 기반 native-bridge (intent://auth?token=...) 가
        //     최신 Chrome 의 user-gesture 정책으로 차단되면 네이티브 FirebaseAuth 가
        //     영구 미인증 상태로 갇히고 위젯이 EmptyState 에서 못 빠져나오는 회귀가 있었다.
        // 픽스: 미로그인 진입자는 네이티브 HomeScreen 의 Credential Manager 로그인(신뢰성 100%)
        //       으로 먼저 인증시키고, HomeScreen 의 LaunchedEffect 가 nativeToken 을 실어
        //       TWA /onboarding · /home 으로 진입한다 — 웹 SSO 도 그 한 번에 보장.
        consumeFirstLaunchFlag()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (shouldOpenHomeFromIntent(intent)) {
            refreshWidgetCacheThenOpenHome()
            return
        }
        // singleTop 이 아니므로 LAUNCHER 재진입에서 이 경로는 잘 안 타지만, 안전을 위해 동일 가드 유지.
        if (AuthRepository.isSignedIn) {
            refreshWidgetCacheThenOpenHome()
        }
    }

    /**
     * /home TWA 진입 직전, 위젯 로컬 캐시를 한번 동기로 갱신해 /home 과의 명언 불일치를 봉합.
     * 모든 진입 경로(위젯 탭 · 알림 탭 · 앱 아이콘) 가 이 함수를 거쳐 들어온다.
     *
     * - 미로그인이면 TWA 진입 대신 네이티브 HomeScreen 으로 떨어뜨린다 — iframe 기반
     *   native-bridge 신뢰성 문제를 피하기 위함 (자세한 사유는 함수 안 주석 참고).
     * - 네트워크가 느리거나 실패해도 최대 [REFRESH_BEFORE_HOME_TIMEOUT_MS] 만 기다리고 진행 —
     *   잠시 stale 한 위젯을 한번 더 봐도, TWA 탭이 무한 대기하는 것보다 사용자 경험이 나음.
     * - 타임아웃/예외 시에는 비동기 Worker 를 폴백으로 큐잉해 다음 fetch 에서 봉합.
     */
    private fun refreshWidgetCacheThenOpenHome() {
        // 사용자가 위젯에서 실제로 본 카드의 날짜. 동기 갱신이 실패해도 이 키로
        // /home 을 고정하면 "방금 탭한 그 카드"와 화면이 일치한다.
        val clickedYmd = intent?.getStringExtra(EXTRA_QUOTE_YMD)
            ?.takeIf { YMD_REGEX.matches(it) }

        if (!AuthRepository.isSignedIn) {
            // 미로그인으로 위젯/알림 탭에서 진입한 케이스 — 곧장 TWA /home 을 띄우면
            // 사용자는 웹 로그인 화면을 만나게 되고, 이후 iframe 기반 native-bridge 가
            // 차단될 경우 네이티브 FirebaseAuth 미인증 → 위젯 영구 EmptyState 회귀.
            // 픽스: 네이티브 HomeScreen 으로 떨어뜨려 Credential Manager 로그인을 먼저 받는다.
            //       로그인 직후 HomeScreen 이 nativeToken 을 실어 자동으로 TWA 로 진입.
            setContent {
                HomeScreen(
                    onOpenAnima = { path -> openAnimaInTwa(path = path) },
                )
            }
            return
        }
        lifecycleScope.launch {
            val completed = try {
                withTimeoutOrNull(REFRESH_BEFORE_HOME_TIMEOUT_MS) {
                    QuoteRepository.refresh(this@MainActivity)
                    QuoteWidget().updateAll(this@MainActivity)
                    true
                }
            } catch (e: Exception) {
                Log.w(TAG, "TWA 진입 전 위젯 캐시 갱신 실패 — Worker 폴백", e)
                null
            }
            if (completed != true) {
                WorkScheduler.scheduleOneTimeRefresh(this@MainActivity)
            }
            // 권위 키 결정:
            //  - 갱신 성공: 방금 받은 서버-기준 캐시의 ymd (위젯도 updateAll 로 같은 값으로 재렌더됨).
            //  - 실패/타임아웃: 사용자가 본 stale 위젯과 맞추기 위해 clickedYmd 로 폴백.
            // 어느 쪽이든 /home 과 화면의 위젯이 같은 dailyMotivations 문서를 가리킨다.
            val syncedYmd = try {
                QuoteRepository.getCached(this@MainActivity)?.response?.ymd
                    ?.takeIf { YMD_REGEX.matches(it) }
            } catch (e: Exception) {
                Log.w(TAG, "동기화된 캐시 ymd 조회 실패 — clickedYmd 폴백", e)
                null
            }
            val authoritativeYmd = if (completed == true) (syncedYmd ?: clickedYmd) else clickedYmd
            openAnimaInTwa(path = "/home", finishAfterLaunch = true, qDate = authoritativeYmd)
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
     *
     * @param finishAfterLaunch TWA 가 실제로 뜬 직후 이 액티비티를 종료한다. setContent 를
     *   생략하고 곧장 TWA 로 넘기는 경로(딥링크, 이미 로그인된 사용자) 에서 true 로 호출 —
     *   안 하면 빈 윈도가 백스택에 남아 TWA back 이 흰 화면으로 떨어진다.
     *   HomeScreen Composable 가 떠 있는 경로에서는 false 로 두어 사용자가 돌아왔을 때
     *   로그인/온보딩 UI 가 보이도록 한다.
     * @param qDate 위젯이 보던 카드의 날짜(YYYY-MM-DD). null 이 아니면 `&qDate=` 로 실어
     *   /home 이 기기 시계 대신 이 날짜로 dailyMotivations 문서를 읽게 한다 (위젯-홈 명언 일치의 핵심).
     */
    private fun openAnimaInTwa(
        path: String?,
        finishAfterLaunch: Boolean = false,
        qDate: String? = null,
    ) {
        val baseUrl = BuildConfig.ANIMA_API_BASE_URL.removeSuffix("/")
        val rawUrl = if (path.isNullOrBlank()) baseUrl else baseUrl + path
        // fromApp=1 마커를 항상 부착 — 웹 AuthProvider 가 이 값을 보고 native-bridge 를 발화한다.
        // 이미 fromApp 쿼리가 있으면 그대로 둔다 (중복 추가 방지).
        val urlWithFromApp = if (rawUrl.contains("fromApp=")) {
            rawUrl
        } else {
            rawUrl + (if (rawUrl.contains("?")) "&" else "?") + "fromApp=1"
        }
        // 위젯-홈 명언 일치: 위젯이 본 날짜를 권위 키로 넘긴다. 형식 검증된 값만,
        // 중복 부착 방지. (별도 statement 로 분리 — Kotlin 에서 if-식에 .let 을 체이닝하면
        // else 분기에만 바인딩되는 함정이 있어 가독성·정확성 위해 풀어 쓴다.)
        val finalUrlBeforeToken =
            if (qDate != null && YMD_REGEX.matches(qDate) && !urlWithFromApp.contains("qDate=")) {
                "$urlWithFromApp&qDate=${Uri.encode(qDate)}"
            } else {
                urlWithFromApp
            }
        // 비로그인이거나 토큰 발급에 실패하면 그대로 띄운다 — 사용자가 웹에서 로그인하면 web→native 브릿지로 보정.
        if (!AuthRepository.isSignedIn) {
            launchTwaWithUrl(finalUrlBeforeToken)
            if (finishAfterLaunch) finish()
            return
        }
        // 로그인 상태면 customToken 을 받아 URL 에 실어 보낸다 — 웹 AuthProvider 가 1회 소비.
        // 네트워크가 200~500ms 가량 추가되지만 TWA 자체 로딩이 가려 사용자 체감은 거의 없음.
        // finish 는 customToken 교환과 launchTwaWithUrl 이 끝난 뒤 — 그 전에 finish 하면
        // lifecycleScope 가 취소돼 코루틴이 죽고 TWA 가 미인증 상태로 떠 흰 화면이 자주 난다.
        lifecycleScope.launch {
            val customToken = try {
                ApiClient.nativeBridgeApi.exchange().customToken
            } catch (e: Exception) {
                Log.w(TAG, "native-bridge customToken 발급 실패 — 웹은 미인증 상태로 진입", e)
                null
            }
            val finalUrl = if (customToken.isNullOrBlank()) {
                finalUrlBeforeToken
            } else {
                finalUrlBeforeToken + "&nativeToken=" + Uri.encode(customToken)
            }
            launchTwaWithUrl(finalUrl)
            if (finishAfterLaunch) finish()
        }
    }

    private fun launchTwaWithUrl(url: String) {
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
        private const val TAG = "MainActivity"
        // 인텐트 extra 키: 어느 화면을 열어 달라는 지시. 위젯/알림 등 외부 진입점이 공유한다.
        const val EXTRA_OPEN_TARGET = "open_target"
        // 잘한 일 저녁 알림 탭 — /home (잘한 일 섹션 포함) 으로 보낸다.
        const val OPEN_TARGET_WINS = "wins"
        // 다짐 아침 알림 탭 — /home (다짐 따라쓰기 영역 포함) 으로 보낸다.
        const val OPEN_TARGET_AFFIRMATIONS = "affirmations"
        // 잠금화면 위젯 탭 — /home 으로 보낸다.
        const val OPEN_TARGET_HOME = "home"
        // 위젯이 탭 순간 "그리고 있던" 카드의 날짜(YYYY-MM-DD). /home 이 기기 시계로
        // ymd 를 다시 계산하지 않고 위젯과 같은 dailyMotivations 문서를 읽게 하는 권위 키.
        const val EXTRA_QUOTE_YMD = "quote_ymd"
        // qDate 로 넘기기 전 형식 검증 — 잘못된 값이 URL 에 실리면 웹이 그냥 무시하지만
        // 애초에 안 싣는 게 안전하다.
        private val YMD_REGEX = Regex("""^\d{4}-\d{2}-\d{2}$""")

        private const val PREFS_APP_FLAGS = "anima_app_flags"
        private const val KEY_HAS_LAUNCHED = "has_launched_v1"
        private const val ONBOARDING_PATH = "/onboarding"
        // 위젯/알림 탭에서 /home TWA 를 띄우기 전, 위젯 캐시 동기 갱신에 허용할 최대 대기.
        // 정상 캐시 히트(Firestore 1회 read) 는 200-500ms 라 보통 그 안에 끝난다.
        private const val REFRESH_BEFORE_HOME_TIMEOUT_MS = 2500L
    }
}
