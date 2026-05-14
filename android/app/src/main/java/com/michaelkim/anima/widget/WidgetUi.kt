/**
 * Glance 위젯 UI 컴포저블.
 *
 * 슬롯 종류 (motivation / famous) 에 따라 카드 톤을 다르게.
 * - 미인증/캐시 비어있을 때: "로그인 후 위젯이 채워집니다" 안내
 * - 본문이 너무 길면 ellipsize 로 잘림 (Glance 의 maxLines)
 * - 위젯이 가로로 넓을 때(medium / large)는 본문 밑에 원어 원문을 흐리게 병기.
 * - 하단에는 오늘 3가지 이행 여부(다짐 따라쓰기 / 행동 체크 / 잘한 일 3가지)를 ☑/☐ 로 노출.
 */
package com.michaelkim.anima.widget

import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import com.michaelkim.anima.MainActivity
import com.michaelkim.anima.data.WidgetSlot
import com.michaelkim.anima.data.WidgetTodayProgress

// 위젯 진행 칩 라벨 — 홈 화면의 섹션 타이틀과 동일한 문구를 그대로 사용해
// "어떤 항목이 체크된 건지" 즉시 알아볼 수 있게 한다.
// 좁은 칩 폭에 맞추기 위해 줄바꿈(\n)을 명시적으로 넣어 2줄로 표시한다.
// "3가지" 는 lib/firebase.ts 의 MAX_DAILY_WINS(=3) 와 동기화되어 있다.
private const val PROGRESS_LABEL_AFFIRMATION = "성공한 나에게\n한 발 더"
private const val PROGRESS_LABEL_ACTIONS = "목표를 이루기 위한\n오늘의 행동"
private const val PROGRESS_LABEL_WINS = "오늘 잘한 일\n3가지"
private const val PROGRESS_MARK_DONE = "☑"
private const val PROGRESS_MARK_TODO = "☐"
private const val PROGRESS_CHIP_MAX_LINES = 2

// 위젯이 "넓다" 고 간주하는 최소 가로 폭. SizeMode.Responsive 의
// medium(250x120) / large(250x250) 가 이 임계치를 넘는다.
// small(120x120) 에서는 좁아 원문을 추가로 끼우면 본문이 잘려서 표시하지 않는다.
private val WIDE_THRESHOLD_DP = 220.dp

@Composable
fun WidgetContent(slot: WidgetSlot?, progress: WidgetTodayProgress?) {
    val context = LocalContext.current
    val size = LocalSize.current
    val isWide = size.width >= WIDE_THRESHOLD_DP
    val bgColor = when (slot?.gradient?.tone) {
        "light" -> Color(parseHex(slot.gradient.from))
        "dark" -> Color(parseHex(slot.gradient.from))
        else -> Color(0xFF1E1B4B) // anima_indigo
    }
    val textColor = if (slot?.gradient?.tone == "light") Color(0xFF1E1B4B) else Color.White

    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(bgColor)
            .padding(16.dp)
            .clickable(
                actionStartActivity(
                    Intent(context, MainActivity::class.java).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                        // 위젯 탭은 곧장 웹 /home 으로 보낸다 — 컨트롤 패널을 거치지 않음.
                        putExtra(MainActivity.EXTRA_OPEN_TARGET, MainActivity.OPEN_TARGET_HOME)
                    },
                ),
            ),
        contentAlignment = Alignment.CenterStart,
    ) {
        if (slot == null) {
            Column {
                Text(
                    text = "오늘의 한 마디를 불러오는 중…",
                    style = TextStyle(color = ColorProvider(textColor), fontSize = 14.sp),
                    maxLines = 2,
                )
                Spacer(GlanceModifier.height(6.dp))
                Text(
                    text = "Anima 앱에서 로그인 후 표시됩니다.",
                    style = TextStyle(color = ColorProvider(textColor.copy(alpha = 0.7f)), fontSize = 11.sp),
                    maxLines = 2,
                )
            }
            return@Box
        }

        Column {
            Text(
                text = slot.text,
                style = TextStyle(
                    color = ColorProvider(textColor),
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Medium,
                ),
                maxLines = 4,
            )
            // 위젯이 넓을 때만 원문(원어)을 본문 아래에 작게 병기.
            // 좁은 위젯에서는 본문이 잘려 가독성이 떨어지므로 생략.
            val originalText = slot.originalText
            if (isWide && !originalText.isNullOrBlank()) {
                Spacer(GlanceModifier.height(4.dp))
                Text(
                    text = originalText,
                    style = TextStyle(
                        color = ColorProvider(textColor.copy(alpha = 0.65f)),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Normal,
                    ),
                    maxLines = 3,
                )
            }
            if (slot.author.isNotBlank()) {
                Spacer(GlanceModifier.height(6.dp))
                Text(
                    text = "— ${slot.author}",
                    style = TextStyle(color = ColorProvider(textColor.copy(alpha = 0.75f)), fontSize = 11.sp),
                    maxLines = 1,
                )
            }
            if (progress != null) {
                Spacer(GlanceModifier.height(8.dp))
                TodayProgressRow(progress = progress, textColor = textColor)
            }
        }
    }
}

@Composable
private fun TodayProgressRow(progress: WidgetTodayProgress, textColor: Color) {
    Row(modifier = GlanceModifier.fillMaxWidth()) {
        ProgressChip(label = PROGRESS_LABEL_AFFIRMATION, done = progress.affirmation, textColor = textColor)
        Spacer(GlanceModifier.width(8.dp))
        ProgressChip(label = PROGRESS_LABEL_ACTIONS, done = progress.actions, textColor = textColor)
        Spacer(GlanceModifier.width(8.dp))
        ProgressChip(label = PROGRESS_LABEL_WINS, done = progress.wins, textColor = textColor)
    }
}

@Composable
private fun ProgressChip(label: String, done: Boolean, textColor: Color) {
    val alpha = if (done) 1.0f else 0.6f
    val mark = if (done) PROGRESS_MARK_DONE else PROGRESS_MARK_TODO
    Text(
        text = "$mark $label",
        style = TextStyle(
            color = ColorProvider(textColor.copy(alpha = alpha)),
            fontSize = 11.sp,
            fontWeight = if (done) FontWeight.Bold else FontWeight.Normal,
        ),
        maxLines = PROGRESS_CHIP_MAX_LINES,
    )
}

/** "#RRGGBB" → ARGB Int. 잘못된 입력은 anima_indigo 폴백. */
internal fun parseHex(hex: String): Long {
    val cleaned = hex.removePrefix("#")
    return try {
        if (cleaned.length == 6) ("FF$cleaned").toLong(16) else 0xFF1E1B4BL
    } catch (_: NumberFormatException) {
        0xFF1E1B4BL
    }
}
