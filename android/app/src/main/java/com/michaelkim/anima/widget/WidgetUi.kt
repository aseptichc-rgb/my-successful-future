/**
 * Glance 위젯 UI 컴포저블 — 글래스모피즘 리디자인.
 *
 * 디자인 목표(우주 배경화면과의 일체감 + 세련/깔끔):
 * - 배경: RemoteViews 라 backdrop blur 불가 → 반투명 딥네이비 그라데이션 + 1px 화이트
 *   테두리 + 22dp 라운드로 "프로스트 글래스" 패널을 구현(widget_card_*.xml).
 * - 인용구: 좌측 상단에 연한 따옴표 글리프(“)로 인용임을 직관화.
 * - 타이포 계층: 한글 본문(15sp Medium) / 원어(11sp Italic·연회색) / 작가명(10sp·우측 정렬).
 * - 체크리스트: 텍스트 기호(□) 제거. 둥근 사각형 SVG 체크박스 아이콘 + 줄별 카드 칩으로
 *   "조작하고 싶은 UI" 의 직관성 확보. 완료 시 아이콘이 라벤더로 채워지고(✓),
 *   라벨은 50% 투명 + 취소선(Strikethrough) 마이크로 인터랙션.
 * - 좁은 위젯(small)에서는 공간상 라벨을 접고 3개 아이콘만 노출(우아한 축소).
 *
 * Glance 가 RemoteViews 로 컴파일되므로 복잡한 레이아웃·애니메이션은 금지.
 */
package com.michaelkim.anima.widget

import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ColorFilter
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
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
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontStyle
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextDecoration
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import com.michaelkim.anima.MainActivity
import com.michaelkim.anima.R
import com.michaelkim.anima.data.WidgetSlot
import com.michaelkim.anima.data.WidgetTodayProgress

// 위젯 체크리스트 라벨 — 홈 화면 섹션 타이틀과 동일 문구.
// 세로 카드(가로 폭 충분)로 바뀌어 더는 줄바꿈(\n)이 필요 없다.
// "3가지" 는 lib/firebase.ts 의 MAX_DAILY_WINS(=3) 와 동기화.
private const val PROGRESS_LABEL_AFFIRMATION = "성공한 나에게 한 발 더"
private const val PROGRESS_LABEL_ACTIONS = "목표를 이루기 위한 오늘의 행동"
private const val PROGRESS_LABEL_WINS = "오늘 잘한 일 3가지"

// 위젯이 "넓다" 고 보는 최소 가로 폭. medium(250x120)/large(250x250) 가 이를 넘는다.
// small(120x120) 에서는 좁아 세로 카드 리스트 대신 아이콘만 노출한다.
private val WIDE_THRESHOLD_DP = 220.dp

// 매직 넘버 제거용 디자인 토큰.
private const val ALPHA_QUOTE_GLYPH = 0.20f
private const val ALPHA_SECONDARY = 0.55f
private const val ALPHA_AUTHOR = 0.62f
private const val ALPHA_DIVIDER = 0.14f
private const val ALPHA_LABEL_DONE = 0.50f
private const val ALPHA_LABEL_TODO = 0.92f
private const val ALPHA_ICON_TODO_DARK = 0.72f
private const val ALPHA_ICON_TODO_LIGHT = 0.50f
private val CHECK_ICON_SIZE = 21.dp
private val CARD_RADIUS = 22.dp

@Composable
fun WidgetContent(slot: WidgetSlot?, progress: WidgetTodayProgress?, ymd: String?) {
    val context = LocalContext.current
    val size = LocalSize.current
    val isWide = size.width >= WIDE_THRESHOLD_DP
    val isLight = slot?.gradient?.tone == "light"

    val cardRes = if (isLight) R.drawable.widget_card_light else R.drawable.widget_card_dark
    val textPrimary = if (isLight) Color(0xFF1E1B4B) else Color(0xFFF6F5FA)

    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(ImageProvider(cardRes))
            .cornerRadius(CARD_RADIUS)
            .padding(horizontal = 18.dp, vertical = 16.dp)
            .clickable(
                actionStartActivity(
                    Intent(context, MainActivity::class.java).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                        // 위젯 탭은 곧장 웹 /home 으로 — 컨트롤 패널을 거치지 않음.
                        putExtra(MainActivity.EXTRA_OPEN_TARGET, MainActivity.OPEN_TARGET_HOME)
                        // 사용자가 실제로 본 카드의 날짜를 함께 넘긴다. 네트워크 동기화가
                        // 늦거나 실패해도 /home 이 "방금 탭한 그 카드"와 일치하도록 하는 폴백 키.
                        if (!ymd.isNullOrBlank()) {
                            putExtra(MainActivity.EXTRA_QUOTE_YMD, ymd)
                        }
                    },
                ),
            ),
        contentAlignment = Alignment.TopStart,
    ) {
        if (slot == null) {
            EmptyState(textPrimary)
            return@Box
        }
        LoadedContent(slot, progress, isWide, isLight, textPrimary)
    }
}

@Composable
private fun EmptyState(textPrimary: Color) {
    Box(
        modifier = GlanceModifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "오늘의 한 마디를 불러오는 중…",
                style = TextStyle(
                    color = ColorProvider(textPrimary),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                ),
                maxLines = 2,
            )
            Spacer(GlanceModifier.height(6.dp))
            Text(
                text = "Anima 앱에서 로그인 후 표시됩니다.",
                style = TextStyle(
                    color = ColorProvider(textPrimary.copy(alpha = ALPHA_SECONDARY)),
                    fontSize = 11.sp,
                ),
                maxLines = 2,
            )
        }
    }
}

@Composable
private fun LoadedContent(
    slot: WidgetSlot,
    progress: WidgetTodayProgress?,
    isWide: Boolean,
    isLight: Boolean,
    textPrimary: Color,
) {
    Column(modifier = GlanceModifier.fillMaxSize()) {
        // 인용구 글리프 — 명언임을 직관적으로 인지시키는 그래픽 요소.
        Text(
            text = "“",
            style = TextStyle(
                color = ColorProvider(textPrimary.copy(alpha = ALPHA_QUOTE_GLYPH)),
                fontSize = 34.sp,
                fontWeight = FontWeight.Bold,
            ),
            maxLines = 1,
        )
        Text(
            text = slot.text,
            style = TextStyle(
                color = ColorProvider(textPrimary),
                fontSize = 15.sp,
                fontWeight = FontWeight.Medium,
            ),
            maxLines = 4,
        )
        // 넓은 위젯에서만 원어 원문을 본문 아래 작게(이탤릭·연회색) 병기.
        val originalText = slot.originalText
        if (isWide && !originalText.isNullOrBlank()) {
            Spacer(GlanceModifier.height(4.dp))
            Text(
                text = originalText,
                style = TextStyle(
                    color = ColorProvider(textPrimary.copy(alpha = ALPHA_SECONDARY)),
                    fontSize = 11.sp,
                    fontStyle = FontStyle.Italic,
                ),
                maxLines = 3,
            )
        }
        if (slot.author.isNotBlank()) {
            Spacer(GlanceModifier.height(6.dp))
            // 작가명 — 우측 정렬·축소로 본문과의 시각 간섭 최소화.
            Row(
                modifier = GlanceModifier.fillMaxWidth(),
                horizontalAlignment = Alignment.End,
            ) {
                Text(
                    text = "— ${slot.author}",
                    style = TextStyle(
                        color = ColorProvider(textPrimary.copy(alpha = ALPHA_AUTHOR)),
                        fontSize = 10.sp,
                    ),
                    maxLines = 1,
                )
            }
        }
        if (progress != null) {
            // 명언 영역과 체크리스트를 분리하는 여백 + 헤어라인 디바이더.
            Spacer(GlanceModifier.height(14.dp))
            Box(
                modifier = GlanceModifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(ColorProvider(textPrimary.copy(alpha = ALPHA_DIVIDER))),
            ) {}
            Spacer(GlanceModifier.height(14.dp))
            if (isWide) {
                ProgressList(progress, isLight, textPrimary)
            } else {
                ProgressIconsCompact(progress, isLight, textPrimary)
            }
        }
    }
}

/** 넓은 위젯: 줄별 카드 칩으로 세로 나열. */
@Composable
private fun ProgressList(progress: WidgetTodayProgress, isLight: Boolean, textPrimary: Color) {
    ProgressRowCard(PROGRESS_LABEL_AFFIRMATION, progress.affirmation, isLight, textPrimary)
    Spacer(GlanceModifier.height(8.dp))
    ProgressRowCard(PROGRESS_LABEL_ACTIONS, progress.actions, isLight, textPrimary)
    Spacer(GlanceModifier.height(8.dp))
    ProgressRowCard(PROGRESS_LABEL_WINS, progress.wins, isLight, textPrimary)
}

@Composable
private fun ProgressRowCard(
    label: String,
    done: Boolean,
    isLight: Boolean,
    textPrimary: Color,
) {
    val rowBg = if (isLight) R.drawable.widget_row_light else R.drawable.widget_row_dark
    val labelAlpha = if (done) ALPHA_LABEL_DONE else ALPHA_LABEL_TODO
    Row(
        modifier = GlanceModifier
            .fillMaxWidth()
            .background(ImageProvider(rowBg))
            .cornerRadius(13.dp)
            .padding(horizontal = 12.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CheckIcon(done, isLight, textPrimary)
        Spacer(GlanceModifier.width(10.dp))
        Text(
            text = label,
            style = TextStyle(
                color = ColorProvider(textPrimary.copy(alpha = labelAlpha)),
                fontSize = 12.sp,
                fontWeight = if (done) FontWeight.Normal else FontWeight.Medium,
                textDecoration = if (done) TextDecoration.LineThrough else TextDecoration.None,
            ),
            maxLines = 1,
        )
    }
}

/** 좁은 위젯: 라벨을 접고 3개 체크 아이콘만 균등 노출. */
@Composable
private fun ProgressIconsCompact(
    progress: WidgetTodayProgress,
    isLight: Boolean,
    textPrimary: Color,
) {
    Row(
        modifier = GlanceModifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CheckIcon(progress.affirmation, isLight, textPrimary)
        Spacer(GlanceModifier.width(16.dp))
        CheckIcon(progress.actions, isLight, textPrimary)
        Spacer(GlanceModifier.width(16.dp))
        CheckIcon(progress.wins, isLight, textPrimary)
    }
}

/**
 * 체크박스 아이콘.
 * - 완료: 라벤더로 채워진 둥근 사각형 + 흰 체크(고정 색, tint 없음).
 * - 미완료: 둥근 사각형 아웃라인 — 톤별 색을 ColorFilter.tint 로 입힌다.
 */
@Composable
private fun CheckIcon(done: Boolean, isLight: Boolean, textPrimary: Color) {
    if (done) {
        Image(
            provider = ImageProvider(R.drawable.ic_widget_check_done),
            contentDescription = "완료",
            modifier = GlanceModifier.size(CHECK_ICON_SIZE),
        )
    } else {
        val tint = if (isLight) {
            textPrimary.copy(alpha = ALPHA_ICON_TODO_LIGHT)
        } else {
            textPrimary.copy(alpha = ALPHA_ICON_TODO_DARK)
        }
        Image(
            provider = ImageProvider(R.drawable.ic_widget_check_todo),
            contentDescription = "미완료",
            modifier = GlanceModifier.size(CHECK_ICON_SIZE),
            colorFilter = ColorFilter.tint(ColorProvider(tint)),
        )
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
