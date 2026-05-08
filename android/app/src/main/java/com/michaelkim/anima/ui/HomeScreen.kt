/**
 * 메인 앱 화면 — 위젯 미리보기 + 로그인/로그아웃 + Anima 웹 열기.
 *
 * 의도적으로 "단순한 컨트롤 패널". 실제 페르소나 대화/온보딩 등은 Custom Tabs 의 Anima 웹앱에서.
 */
package com.michaelkim.anima.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.util.Log
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.michaelkim.anima.data.QuoteRepository
import com.michaelkim.anima.data.WidgetSlot
import com.michaelkim.anima.data.auth.AuthRepository
import com.michaelkim.anima.data.local.QuoteCache
import com.michaelkim.anima.widget.parseHex
import com.michaelkim.anima.work.WorkScheduler
import kotlinx.coroutines.launch

@Composable
fun HomeScreen(onOpenAnima: () -> Unit) {
    val context = LocalContext.current
    val cached by remember { QuoteCache.observe(context) }.collectAsState(initial = null)
    val scope = rememberCoroutineScope()
    var signedIn by remember { mutableStateOf(AuthRepository.isSignedIn) }
    var busy by remember { mutableStateOf(false) }

    // 로그인 직후 위젯/캐시 즉시 갱신
    LaunchedEffect(signedIn) {
        if (signedIn) WorkScheduler.scheduleOneTimeRefresh(context)
    }

    val slot = QuoteRepository.currentSlot(cached)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF0EDE6))
            .padding(20.dp),
    ) {
        Text(
            text = "Anima",
            color = Color(0xFF1E1B4B),
            fontSize = 24.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = "오늘의 한 마디 미리보기",
            color = Color(0xFF1E1B4B).copy(alpha = 0.6f),
            fontSize = 13.sp,
        )
        Spacer(Modifier.height(16.dp))

        SlotPreview(slot)

        Spacer(Modifier.height(20.dp))

        if (!signedIn) {
            Button(
                onClick = {
                    busy = true
                    scope.launch {
                        val result = AuthRepository.signInWithGoogle(context)
                        busy = false
                        result.fold(
                            onSuccess = {
                                signedIn = true
                                Toast.makeText(context, "환영합니다 ${it.displayName ?: ""}", Toast.LENGTH_SHORT).show()
                            },
                            onFailure = {
                                Toast.makeText(
                                    context,
                                    "로그인 실패: ${it.message ?: "알 수 없는 오류"}",
                                    Toast.LENGTH_LONG,
                                ).show()
                            },
                        )
                    }
                },
                enabled = !busy,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1E1B4B)),
            ) {
                Text(if (busy) "처리 중…" else "Google 로 시작하기")
            }
        } else {
            Button(
                onClick = {
                    busy = true
                    scope.launch {
                        try {
                            // 신규/구 사용자 모두 위젯 호출 직전에 trial claim 을 한 번 점검.
                            // 이미 claim 이 있으면 멱등 no-op.
                            AuthRepository.ensureTrialStarted()
                            QuoteRepository.refresh(context)
                            Toast.makeText(context, "오늘의 한 마디를 받아왔어요", Toast.LENGTH_SHORT).show()
                        } catch (e: Exception) {
                            // HttpException 의 경우 코드/본문을 같이 보여 진짜 원인을 추적 가능하게.
                            val detail = when (e) {
                                is retrofit2.HttpException -> {
                                    val body = runCatching { e.response()?.errorBody()?.string() }.getOrNull()
                                    "HTTP ${e.code()} ${body ?: e.message() ?: ""}"
                                }
                                else -> e.message ?: "네트워크 확인"
                            }
                            // 토스트가 잘려 진짜 원인이 안 보이는 문제 — 에러 전문을 클립보드에 복사하고
                            // Logcat 에도 동일하게 남겨 진단 가능하도록.
                            Log.e("Anima/Home", "오늘의 한 마디 받기 실패: $detail", e)
                            runCatching {
                                val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                                cm?.setPrimaryClip(ClipData.newPlainText("Anima error", detail))
                            }
                            Toast.makeText(
                                context,
                                "오늘의 한 마디 받기 실패 — 에러 전문을 클립보드에 복사했습니다.",
                                Toast.LENGTH_LONG,
                            ).show()
                        } finally {
                            busy = false
                        }
                    }
                },
                enabled = !busy,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1E1B4B)),
            ) {
                Text(if (busy) "받아오는 중…" else "오늘의 한 마디 받기")
            }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(
                onClick = onOpenAnima,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Anima 열기 (페르소나 대화·데일리 리추얼)")
            }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(
                onClick = {
                    scope.launch {
                        AuthRepository.signOut(context)
                        signedIn = false
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("로그아웃")
            }
        }

        Spacer(Modifier.height(16.dp))
        Text(
            text = "홈 화면을 길게 눌러 위젯 메뉴에서 Anima 위젯을 추가하세요.",
            color = Color(0xFF1E1B4B).copy(alpha = 0.55f),
            fontSize = 11.sp,
        )
    }
}

@Composable
private fun SlotPreview(slot: WidgetSlot?) {
    val tone = slot?.gradient?.tone ?: "dark"
    val fromColor = slot?.gradient?.from?.let { Color(parseHex(it)) } ?: Color(0xFF1E1B4B)
    val toColor = slot?.gradient?.to?.let { Color(parseHex(it)) } ?: Color(0xFF7C3AED)
    val textColor = if (tone == "light") Color(0xFF1E1B4B) else Color.White

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(200.dp)
            .clip(RoundedCornerShape(20.dp))
            .background(Brush.linearGradient(colors = listOf(fromColor, toColor)))
            .padding(20.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        if (slot == null) {
            Column(verticalArrangement = Arrangement.Center) {
                Text(
                    text = "오늘의 한 마디를 불러오는 중…",
                    color = textColor,
                    fontSize = 16.sp,
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    text = "로그인 후 위젯이 채워집니다.",
                    color = textColor.copy(alpha = 0.7f),
                    fontSize = 12.sp,
                )
            }
        } else {
            Column {
                Text(
                    text = slot.text,
                    color = textColor,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Medium,
                )
                val author = when (slot) {
                    is WidgetSlot.Motivation -> slot.author
                    is WidgetSlot.Famous -> slot.author
                }
                if (!author.isNullOrBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = "— $author",
                        color = textColor.copy(alpha = 0.8f),
                        fontSize = 13.sp,
                    )
                }
            }
        }
    }
}
