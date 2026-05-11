/**
 * 비로그인 진입자 전용 화면 — 위젯 미리보기 + 이메일/Google 로그인.
 *
 * 로그인된 사용자는 MainActivity 가 곧장 TWA /home 으로 보내므로 이 컴포저블에 도달하지 않는다.
 * 다만 폼 안에서 방금 로그인한 직후엔 잠깐 이 컴포저블이 살아있을 수 있어 — 그 경우
 * 온보딩 PENDING 이면 OnboardingGate, DONE 이면 곧장 TWA /home 으로 보내고 액티비티를 finish() 한다.
 */
package com.michaelkim.anima.ui

import android.app.Activity
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.michaelkim.anima.data.QuoteRepository
import com.michaelkim.anima.data.WidgetSlot
import com.michaelkim.anima.data.auth.AuthRepository
import com.michaelkim.anima.data.auth.OnboardingPrefs
import com.michaelkim.anima.data.auth.OnboardingStatus
import com.michaelkim.anima.data.auth.SignInOutcome
import com.michaelkim.anima.data.local.QuoteCache
import com.michaelkim.anima.widget.parseHex
import com.michaelkim.anima.work.WorkScheduler
import kotlinx.coroutines.launch

private const val ONBOARDING_PATH = "/onboarding"

/**
 * @param onOpenAnima Anima 웹앱을 Custom Tabs 로 연다. path=null 이면 루트(/), path="/onboarding" 등 지정 가능.
 */
@Composable
fun HomeScreen(onOpenAnima: (path: String?) -> Unit) {
    val context = LocalContext.current
    val cached by remember { QuoteCache.observe(context) }.collectAsState(initial = null)
    val scope = rememberCoroutineScope()
    var signedIn by remember { mutableStateOf(AuthRepository.isSignedIn) }
    var busy by remember { mutableStateOf(false) }

    // 온보딩 상태(UNKNOWN / DONE / PENDING).
    // 진실은 서버 (/api/auth/onboarding-status) — Firestore.users.{uid}.onboardedAt.
    // 부팅 직후엔 캐시된 값을 즉시 보여주고, LaunchedEffect 가 서버에 다시 문의해 보정한다.
    var onboardingStatus by remember {
        mutableStateOf(
            if (signedIn) {
                AuthRepository.currentUser?.uid?.let { OnboardingPrefs.read(context, it) }
                    ?: OnboardingStatus.UNKNOWN
            } else {
                OnboardingStatus.UNKNOWN
            },
        )
    }
    // ON_RESUME 마다 1 씩 증가 — 사용자가 브라우저에서 온보딩을 끝내고 돌아오면 이 값이 변하면서
    // 서버에 다시 물어 봐서 DONE 으로 자연스럽게 전환된다.
    var resumeTick by remember { mutableStateOf(0) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { resumeTick++ }

    // 로그인 직후 위젯/캐시 즉시 갱신
    LaunchedEffect(signedIn) {
        if (signedIn) WorkScheduler.scheduleOneTimeRefresh(context)
    }

    // signedIn / resumeTick 가 바뀔 때마다 서버에 진실값 문의.
    // 네트워크 실패 시 null → 기존 status 유지 (캐시값 그대로 보여 사용자 시각적 깜빡임 최소화).
    LaunchedEffect(signedIn, resumeTick) {
        if (!signedIn) {
            onboardingStatus = OnboardingStatus.UNKNOWN
            return@LaunchedEffect
        }
        val uid = AuthRepository.currentUser?.uid ?: return@LaunchedEffect
        val done = AuthRepository.fetchOnboardingDone() ?: return@LaunchedEffect
        OnboardingPrefs.cache(context, uid, done)
        onboardingStatus = if (done) OnboardingStatus.DONE else OnboardingStatus.PENDING
    }

    // PENDING 으로 전환되는 시점에 1회만 자동으로 /onboarding 을 띄운다.
    // (PENDING → PENDING 으로 같은 값 재할당은 LaunchedEffect 를 재기동시키지 않으므로 무한 루프 없음.)
    LaunchedEffect(onboardingStatus) {
        if (onboardingStatus == OnboardingStatus.PENDING) onOpenAnima(ONBOARDING_PATH)
    }

    // DONE 이 확정되는 즉시 TWA /home 으로 보내고 네이티브 액티비티를 finish() 한다.
    // 네이티브 컨트롤 패널은 더 이상 노출하지 않는다 — 로그아웃·새로고침 등 모든 컨트롤은 웹에서 제공.
    LaunchedEffect(signedIn, onboardingStatus) {
        if (signedIn && onboardingStatus == OnboardingStatus.DONE) {
            onOpenAnima("/home")
            (context as? Activity)?.finish()
        }
    }

    // 비로그인은 로그인 폼, PENDING 은 온보딩 게이트, UNKNOWN/DONE 은 잠깐 로딩만 노출.
    when {
        !signedIn -> {
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

                AuthSection(
                    busy = busy,
                    onBusyChange = { busy = it },
                    onSignedIn = { outcome ->
                        signedIn = true
                        Toast.makeText(
                            context,
                            "환영합니다 ${outcome.user.displayName ?: ""}",
                            Toast.LENGTH_SHORT,
                        ).show()
                        // 신규 가입자는 즉시 PENDING 으로 — 서버 응답을 기다리지 않고 게이트를 띄운다.
                        // 기존 사용자는 UNKNOWN 으로 유지 → LaunchedEffect 가 서버에 물어 DONE/PENDING 결정.
                        // DONE 으로 전환되는 순간 위쪽 LaunchedEffect 가 TWA /home 으로 보내고 액티비티를 종료.
                        if (outcome.isNewUser) {
                            OnboardingPrefs.cache(context, outcome.user.uid, false)
                            onboardingStatus = OnboardingStatus.PENDING
                        }
                    },
                )

                Spacer(Modifier.height(16.dp))
                Text(
                    text = "홈 화면을 길게 눌러 위젯 메뉴에서 Anima 위젯을 추가하세요.",
                    color = Color(0xFF1E1B4B).copy(alpha = 0.55f),
                    fontSize = 11.sp,
                )
            }
        }
        onboardingStatus == OnboardingStatus.PENDING -> {
            OnboardingGate(
                onReopen = { onOpenAnima(ONBOARDING_PATH) },
                onCompleted = {
                    AuthRepository.currentUser?.uid?.let { OnboardingPrefs.cache(context, it, true) }
                    onboardingStatus = OnboardingStatus.DONE
                },
                onSignOut = {
                    scope.launch {
                        OnboardingPrefs.clear(context)
                        AuthRepository.signOut(context)
                        onboardingStatus = OnboardingStatus.UNKNOWN
                        signedIn = false
                    }
                },
            )
        }
        else -> {
            // UNKNOWN(서버 응답 대기) 또는 DONE(곧 TWA 로 넘어가는 짧은 순간).
            LoadingGate()
        }
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

private enum class AuthMode { SignIn, SignUp }

private const val MIN_PASSWORD_LENGTH = 6

/**
 * 비로그인 상태에서 보이는 인증 섹션.
 * 탭으로 [AuthMode.SignIn] / [AuthMode.SignUp] 을 토글하고, 폼 아래에 Google 시작하기 버튼을 둔다.
 */
@Composable
private fun AuthSection(
    busy: Boolean,
    onBusyChange: (Boolean) -> Unit,
    onSignedIn: (SignInOutcome) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var mode by remember { mutableStateOf(AuthMode.SignIn) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("") }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    Column(modifier = Modifier.fillMaxWidth()) {
        TabRow(selectedTabIndex = mode.ordinal) {
            Tab(
                selected = mode == AuthMode.SignIn,
                onClick = {
                    mode = AuthMode.SignIn
                    errorMessage = null
                },
                text = { Text("로그인") },
            )
            Tab(
                selected = mode == AuthMode.SignUp,
                onClick = {
                    mode = AuthMode.SignUp
                    errorMessage = null
                },
                text = { Text("회원가입") },
            )
        }

        Spacer(Modifier.height(12.dp))

        if (mode == AuthMode.SignUp) {
            OutlinedTextField(
                value = displayName,
                onValueChange = { displayName = it },
                label = { Text("이름") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(8.dp))
        }

        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("이메일") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(8.dp))

        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("비밀번호") },
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )

        if (mode == AuthMode.SignUp) {
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = confirmPassword,
                onValueChange = { confirmPassword = it },
                label = { Text("비밀번호 확인") },
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        if (errorMessage != null) {
            Spacer(Modifier.height(8.dp))
            Text(
                text = errorMessage ?: "",
                color = Color(0xFFB91C1C),
                fontSize = 13.sp,
            )
        }

        Spacer(Modifier.height(12.dp))

        Button(
            onClick = {
                errorMessage = null
                if (mode == AuthMode.SignUp) {
                    if (displayName.trim().isEmpty()) {
                        errorMessage = "이름을 입력해 주세요."
                        return@Button
                    }
                    if (password.length < MIN_PASSWORD_LENGTH) {
                        errorMessage = "비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다."
                        return@Button
                    }
                    if (password != confirmPassword) {
                        errorMessage = "비밀번호가 일치하지 않습니다."
                        return@Button
                    }
                }
                onBusyChange(true)
                scope.launch {
                    val result = if (mode == AuthMode.SignIn) {
                        AuthRepository.signInWithEmail(email, password)
                    } else {
                        AuthRepository.signUpWithEmail(email, password, displayName)
                    }
                    onBusyChange(false)
                    result.fold(
                        onSuccess = { outcome -> onSignedIn(outcome) },
                        onFailure = { err ->
                            errorMessage = err.message ?: "오류가 발생했습니다."
                        },
                    )
                }
            },
            enabled = !busy,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1E1B4B)),
        ) {
            val label = when {
                busy -> "처리 중…"
                mode == AuthMode.SignIn -> "이메일로 로그인"
                else -> "이메일로 회원가입"
            }
            Text(label)
        }

        Spacer(Modifier.height(16.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            HorizontalDivider(modifier = Modifier.weight(1f))
            Text(
                text = "또는",
                color = Color(0xFF1E1B4B).copy(alpha = 0.5f),
                fontSize = 12.sp,
                modifier = Modifier.padding(horizontal = 8.dp),
            )
            HorizontalDivider(modifier = Modifier.weight(1f))
        }
        Spacer(Modifier.height(16.dp))

        OutlinedButton(
            onClick = {
                onBusyChange(true)
                scope.launch {
                    val result = AuthRepository.signInWithGoogle(context)
                    onBusyChange(false)
                    result.fold(
                        onSuccess = { outcome -> onSignedIn(outcome) },
                        onFailure = { err ->
                            errorMessage = err.message ?: "Google 로그인에 실패했습니다."
                        },
                    )
                }
            },
            enabled = !busy,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Google 로 시작하기")
        }
    }
}

/**
 * 로그인은 됐지만 서버에서 온보딩 상태를 받아오기 전 한 박자.
 * 캐시 미스 + 첫 로그인 직후에만 잠깐 보이고, 응답이 도착하면 메인 홈 또는 게이트로 자동 전환된다.
 */
@Composable
private fun LoadingGate() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF0EDE6)),
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator(color = Color(0xFF1E1B4B))
    }
}

/**
 * 신규 가입자 전용 게이트. 게이트가 떠 있는 동안엔 일반 홈(오늘의 한 마디 / Anima 열기) 이 노출되지 않는다.
 * - "온보딩 다시 열기": Custom Tab 으로 /onboarding 재오픈.
 * - "온보딩 완료 — 메인으로": pending 플래그 해제 → 일반 홈으로 전환.
 * - "다른 계정으로 로그인": 잘못된 계정으로 가입했을 때 탈출구.
 */
@Composable
private fun OnboardingGate(
    onReopen: () -> Unit,
    onCompleted: () -> Unit,
    onSignOut: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF0EDE6))
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = "Anima 시작하기",
            color = Color(0xFF1E1B4B),
            fontSize = 26.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = "먼저 온보딩을 진행해 페르소나와 목표를 설정해 주세요. 다 끝내야 메인 홈이 열립니다.",
            color = Color(0xFF1E1B4B).copy(alpha = 0.7f),
            fontSize = 14.sp,
        )
        Spacer(Modifier.height(24.dp))
        Button(
            onClick = onReopen,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1E1B4B)),
        ) {
            Text("온보딩 다시 열기")
        }
        Spacer(Modifier.height(8.dp))
        OutlinedButton(
            onClick = onCompleted,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("온보딩 완료 — 메인으로")
        }
        Spacer(Modifier.height(8.dp))
        OutlinedButton(
            onClick = onSignOut,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("다른 계정으로 로그인")
        }
    }
}
