/**
 * Glance 위젯 UI 컴포저블.
 *
 * 슬롯 종류 (motivation / famous) 에 따라 카드 톤을 다르게.
 * - 미인증/캐시 비어있을 때: "로그인 후 위젯이 채워집니다" 안내
 * - 본문이 너무 길면 ellipsize 로 잘림 (Glance 의 maxLines)
 */
package com.michaelkim.anima.widget

import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import com.michaelkim.anima.MainActivity
import com.michaelkim.anima.data.WidgetSlot

@Composable
fun WidgetContent(slot: WidgetSlot?) {
    val context = LocalContext.current
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
                maxLines = 5,
            )
            val author = when (slot) {
                is WidgetSlot.Motivation -> slot.author
                is WidgetSlot.Famous -> slot.author
            }
            if (!author.isNullOrBlank()) {
                Spacer(GlanceModifier.height(6.dp))
                Text(
                    text = "— $author",
                    style = TextStyle(color = ColorProvider(textColor.copy(alpha = 0.75f)), fontSize = 11.sp),
                    maxLines = 1,
                )
            }
        }
    }
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
