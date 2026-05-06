/**
 * 메인 화면 진입점.
 *
 * 두 가지 역할:
 *  1) 위젯이 비어있을 때 사용자를 데려와 Google 로그인 → 위젯 채움.
 *  2) Anima 의 모든 기능 (페르소나 채팅, 데일리 리추얼 등) 은 Custom Tabs 로 웹앱을 열어 그대로 사용.
 *
 * 네이티브 화면은 "오늘의 한 마디" 미리보기 + 갱신 버튼 + Anima 열기 버튼 정도로만 유지.
 *
 * 추가 동작:
 *  - 잘한 일 저녁 알림 탭으로 진입한 경우(EXTRA_OPEN_TARGET=wins) → 곧장 /home 으로 Custom Tabs 진입.
 *  - Android 13+ 에서 POST_NOTIFICATIONS 런타임 권한 요청 (1회).
 */
package com.michaelkim.anima

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import com.michaelkim.anima.ui.HomeScreen
import com.michaelkim.anima.work.WinsReminderWorker

class MainActivity : ComponentActivity() {

    private val requestNotificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* 결과 무시: 거부해도 앱 흐름은 유지 */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ensureNotificationPermission()
        setContent {
            HomeScreen(
                onOpenAnima = { openAnimaInCustomTab(path = null) },
            )
        }
        // 알림 탭으로 진입한 경우엔 잘한 일 화면(/home)으로 바로 이동.
        if (intent?.getStringExtra(WinsReminderWorker.EXTRA_OPEN_TARGET) == WinsReminderWorker.OPEN_TARGET_WINS) {
            openAnimaInCustomTab(path = "/home")
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent.getStringExtra(WinsReminderWorker.EXTRA_OPEN_TARGET) == WinsReminderWorker.OPEN_TARGET_WINS) {
            openAnimaInCustomTab(path = "/home")
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

    private fun openAnimaInCustomTab(path: String?) {
        val baseUrl = BuildConfig.ANIMA_API_BASE_URL.removeSuffix("/")
        val url = if (path.isNullOrBlank()) baseUrl else baseUrl + path
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(intent)
        } catch (_: Exception) {
            // 외부 브라우저 미설치 등 — 무시.
        }
    }
}
