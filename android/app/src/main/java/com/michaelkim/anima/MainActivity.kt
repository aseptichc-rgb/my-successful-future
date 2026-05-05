/**
 * 메인 화면 진입점.
 *
 * 두 가지 역할:
 *  1) 위젯이 비어있을 때 사용자를 데려와 Google 로그인 → 위젯 채움.
 *  2) Anima 의 모든 기능 (페르소나 채팅, 데일리 리추얼 등) 은 Custom Tabs 로 웹앱을 열어 그대로 사용.
 *
 * 네이티브 화면은 "오늘의 한 마디" 미리보기 + 갱신 버튼 + Anima 열기 버튼 정도로만 유지.
 */
package com.michaelkim.anima

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.michaelkim.anima.ui.HomeScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            HomeScreen(
                onOpenAnima = { openAnimaInCustomTab() },
            )
        }
    }

    private fun openAnimaInCustomTab() {
        val baseUrl = BuildConfig.ANIMA_API_BASE_URL.removeSuffix("/")
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(baseUrl)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(intent)
        } catch (_: Exception) {
            // 외부 브라우저 미설치 등 — 무시.
        }
    }
}
