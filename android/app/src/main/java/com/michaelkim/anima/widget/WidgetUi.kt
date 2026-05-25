/**
 * Glance 위젯 UI 컴포저블 — v2 "신호판" 디자인.
 *
 * 핵심 컨셉: 위젯은 메모장이 아니라 "오늘의 상태를 0.5초 안에 전달하는 신호판".
 * 4가지 원칙:
 *  1. 상태가 보여야 한다 (헤더의 진척도 카운트, 완료 시 accent 채색)
 *  2. 활자 위계 — Serif(인용) / Sans(라벨) / Monospace(메타) 세 가족만 사용
 *  3. 컨테이너 대신 hairline 1px 8% — pill/카드 칩 제거
 *  4. 침묵이 메시지 — accent 색은 단 1개(완료 표시), 본문은 cream 단계만
 *
 * Glance → RemoteViews 제약:
 *  - 커스텀 폰트(Fraunces/Inter/JBMono) 불가 → 시스템 Serif/Sans/Monospace 로 위계 표현
 *  - letterSpacing/lineHeight 미지원 → mono 텍스트는 수동 uppercase 만 적용
 *  - if 분기 내부 직접 자식이 2개 이상이면 두 번째부터 누락(과거 실측 회귀) →
 *    조건부 블록은 항상 Column/Box 1개로 감싸 자식 1개로 유지한다.
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
import androidx.glance.text.FontFamily
import androidx.glance.text.FontStyle
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextDecoration
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import com.michaelkim.anima.MainActivity
import com.michaelkim.anima.R
import com.michaelkim.anima.data.WidgetSlot
import com.michaelkim.anima.data.WidgetTodayProgress

// ────────────────────────────────────────────────────────────────────────────
// 라벨 (홈 화면과 동기화 — lib/firebase.ts MAX_DAILY_WINS=3 / dictionaries/ko.ts)
// ────────────────────────────────────────────────────────────────────────────
private const val PROGRESS_LABEL_AFFIRMATION = "성공한 나에게 한 발 더"
private const val PROGRESS_LABEL_ACTIONS = "목표를 이루기 위한 오늘의 행동"
private const val PROGRESS_LABEL_WINS = "오늘 잘한 일 3가지"
private const val SECTION_TODAY = "TODAY · 오늘의 행동"
private const val SECTION_GOALS = "GOALS · 이번 달 목표"
private const val FOOTER_CTA_DEFAULT = "탭하여 열기  →"
private const val FOOTER_CTA_DONE = "오늘 3 / 3 완료  →"
private const val MAX_GOALS_ON_WIDGET = 3
private const val TOTAL_DAILY_ACTIONS = 3

// ────────────────────────────────────────────────────────────────────────────
// 사이즈 임계치 — Exact sizeMode 라 실제 dp 로 평가된다.
// ────────────────────────────────────────────────────────────────────────────
private val WIDE_THRESHOLD_DP = 220.dp
private val TALL_THRESHOLD_DP = 200.dp
private val EXTRA_TALL_THRESHOLD_DP = 280.dp

// ────────────────────────────────────────────────────────────────────────────
// 디자인 토큰 — 매직 넘버 제거.
// ────────────────────────────────────────────────────────────────────────────
// 알파 단계 (cream/ink 위 적용)
private const val ALPHA_META = 0.36f         // 메타·placeholder
private const val ALPHA_DIM = 0.62f          // 보조 본문
private const val ALPHA_FAINT_DIVIDER = 0.08f // hairline
private const val ALPHA_CHECK_TODO = 0.28f   // 미완료 체크박스 stroke
private const val ALPHA_LABEL_DONE = 0.36f   // 완료된 라벨 (strike-through 와 함께)

// 사이즈
private val CARD_RADIUS = 28.dp
private val CARD_PADDING_H = 22.dp
private val CARD_PADDING_V = 18.dp
private val SECTION_GAP = 14.dp
private val ROW_GAP = 4.dp
private val ROW_V_PADDING = 6.dp
private val CHECK_ICON_SIZE = 18.dp
private val CHECK_LABEL_GAP = 12.dp
private val GOAL_NUM_WIDTH = 24.dp

// 타이포
private val QUOTE_FONT_SIZE = 16.sp
private val ATTRIBUTION_FONT_SIZE = 10.sp
private val SECTION_HEADER_SIZE = 10.sp
private val ROW_LABEL_SIZE = 13.sp
private val GOAL_NUM_SIZE = 18.sp
private val META_SIZE = 11.sp
private val FOOTER_SIZE = 10.sp
private const val QUOTE_MAX_LINES_TALL = 4
private const val QUOTE_MAX_LINES_SHORT = 3

// 색 — 웹 앱과 동일한 cream + indigo + soul 팔레트.
// (Color 객체는 res/values/colors.xml 토큰과 동기화)
private val INK = Color(0xFF1E1B4B)            // widget_ink — indigo on cream
private val INK_LIGHT = Color(0xFF1E1B4B)      // 동일 (호환 유지)
private val ACCENT_SOUL = Color(0xFFD85A30)    // widget_accent_soul
private val SUCCESS = Color(0xFFD85A30)        // 웹과 동일하게 soul 단일 — 완료 시도 같은 톤

@Composable
fun WidgetContent(slot: WidgetSlot?, progress: WidgetTodayProgress?, ymd: String?) {
    val context = LocalContext.current
    val size = LocalSize.current
    val isWide = size.width >= WIDE_THRESHOLD_DP
    val isTall = size.height >= TALL_THRESHOLD_DP
    val isExtraTall = size.height >= EXTRA_TALL_THRESHOLD_DP
    val isLight = slot?.gradient?.tone == "light"

    val cardRes = if (isLight) R.drawable.widget_card_light else R.drawable.widget_card_dark
    val ink = if (isLight) INK_LIGHT else INK

    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(ImageProvider(cardRes))
            .cornerRadius(CARD_RADIUS)
            .padding(horizontal = CARD_PADDING_H, vertical = CARD_PADDING_V)
            .clickable(
                actionStartActivity(
                    Intent(context, MainActivity::class.java).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                        putExtra(MainActivity.EXTRA_OPEN_TARGET, MainActivity.OPEN_TARGET_HOME)
                        if (!ymd.isNullOrBlank()) {
                            putExtra(MainActivity.EXTRA_QUOTE_YMD, ymd)
                        }
                    },
                ),
            ),
        contentAlignment = Alignment.TopStart,
    ) {
        if (slot == null) {
            EmptyState(ink)
            return@Box
        }
        LoadedContent(slot, progress, ymd, isWide, isTall, isExtraTall, isLight, ink)
    }
}

@Composable
private fun EmptyState(ink: Color) {
    Box(
        modifier = GlanceModifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = "Anima 앱에서 로그인 후 표시됩니다",
            style = TextStyle(
                color = ColorProvider(ink.copy(alpha = ALPHA_DIM)),
                fontSize = META_SIZE,
                fontFamily = FontFamily.Monospace,
            ),
            maxLines = 2,
        )
    }
}

@Composable
private fun LoadedContent(
    slot: WidgetSlot,
    progress: WidgetTodayProgress?,
    ymd: String?,
    isWide: Boolean,
    isTall: Boolean,
    isExtraTall: Boolean,
    isLight: Boolean,
    ink: Color,
) {
    val doneCount = progress?.let { countDone(it) } ?: 0
    val allDone = progress != null && doneCount >= TOTAL_DAILY_ACTIONS
    val accent = if (allDone) SUCCESS else ACCENT_SOUL

    // Glance → RemoteViews 변환은 if/else 분기 안에 직접 자식이 2개 이상이면 두 번째부터
    // 통째로 누락되는 회귀가 있다(실측: 1.1.1). 그래서 모든 조건부 블록은 단일 Column 으로
    // 감싸 if 분기의 직접 자식을 1개로 유지한다. 마찬가지로 컴포저블 함수 호출(SectionHeader,
    // ProgressList 등)도 호출 시 다중 자식이 펼쳐지므로, 함수 내부에서도 Column 으로 래핑.
    Column(modifier = GlanceModifier.fillMaxSize()) {
        // ── 1. 헤더 ────────────────────────────────────────────────────
        if (isTall) {
            Column(modifier = GlanceModifier.fillMaxWidth()) {
                HeaderRow(ymd, progress, doneCount, accent, ink)
                Spacer(GlanceModifier.height(SECTION_GAP))
            }
        }

        // ── 2. 인용문 + 작가 ───────────────────────────────────────────
        QuoteBlock(slot, isWide, isTall, ink)

        if (progress != null) {
            Column(modifier = GlanceModifier.fillMaxWidth()) {
                HairlineDivider(ink)
                if (isWide && isTall) {
                    SectionHeader(SECTION_TODAY, "$doneCount / $TOTAL_DAILY_ACTIONS", accent, ink)
                    Spacer(GlanceModifier.height(ROW_GAP))
                    ProgressList(progress, isLight, ink)
                } else {
                    ProgressIconsCompact(progress, isLight, ink)
                }
            }
        }

        // ── 5. 이번 달 목표 ────────────────────────────────────────────
        if (isExtraTall && isWide && slot.goalsSnapshot.isNotEmpty()) {
            GoalsSection(slot.goalsSnapshot, accent, ink)
        }

        // ── 6. 푸터 CTA ───────────────────────────────────────────────
        if (isExtraTall && isWide) {
            FooterCta(allDone, ink, accent)
        }
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 헤더
// ────────────────────────────────────────────────────────────────────────────
@Composable
private fun HeaderRow(
    ymd: String?,
    progress: WidgetTodayProgress?,
    doneCount: Int,
    accent: Color,
    ink: Color,
) {
    Row(
        modifier = GlanceModifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // 좌: 날짜 — 없으면 빈 문자열(레이아웃 흔들림 방지)
        Text(
            text = formatDateHeader(ymd),
            style = TextStyle(
                color = ColorProvider(ink),
                fontSize = META_SIZE,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Medium,
            ),
            maxLines = 1,
            modifier = GlanceModifier.defaultWeight(),
        )
        // 우: 진척도 (progress 가 있을 때만 — 색은 완료 시 success swap)
        if (progress != null) {
            Text(
                text = "$doneCount / $TOTAL_DAILY_ACTIONS  OK",
                style = TextStyle(
                    color = ColorProvider(accent),
                    fontSize = META_SIZE,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Medium,
                ),
                maxLines = 1,
            )
        }
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 인용문 블록
// ────────────────────────────────────────────────────────────────────────────
@Composable
private fun QuoteBlock(slot: WidgetSlot, isWide: Boolean, isTall: Boolean, ink: Color) {
    // 호출자 입장에서 항상 1개 자식으로 보이도록 Column 으로 감싼다 (Glance if-branch
    // 누락 회귀 방어).
    Column(modifier = GlanceModifier.fillMaxWidth()) {
        // 인용 글리프(") 제거 — 의미 없는 장식. serif italic 자체가 인용임을 알린다.
        Text(
            text = slot.text,
            style = TextStyle(
                color = ColorProvider(ink),
                fontSize = QUOTE_FONT_SIZE,
                fontFamily = FontFamily.Serif,
                fontStyle = FontStyle.Italic,
                fontWeight = FontWeight.Normal,
            ),
            maxLines = if (isTall) QUOTE_MAX_LINES_TALL else QUOTE_MAX_LINES_SHORT,
        )

        val originalText = slot.originalText
        if (isWide && isTall && !originalText.isNullOrBlank()) {
            Column(modifier = GlanceModifier.fillMaxWidth()) {
                Spacer(GlanceModifier.height(4.dp))
                Text(
                    text = originalText,
                    style = TextStyle(
                        color = ColorProvider(ink.copy(alpha = ALPHA_DIM)),
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Serif,
                        fontStyle = FontStyle.Italic,
                    ),
                    maxLines = 2,
                )
            }
        }

        if (slot.author.isNotBlank()) {
            Column(modifier = GlanceModifier.fillMaxWidth()) {
                Spacer(GlanceModifier.height(6.dp))
                Row(
                    modifier = GlanceModifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.End,
                ) {
                    Text(
                        text = slot.author.uppercase(),
                        style = TextStyle(
                            color = ColorProvider(ink.copy(alpha = ALPHA_META)),
                            fontSize = ATTRIBUTION_FONT_SIZE,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Medium,
                        ),
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 섹션 헤더 (좌: 타이틀 / 우: 진척도 부가표시)
// ────────────────────────────────────────────────────────────────────────────
@Composable
private fun SectionHeader(title: String, badge: String?, accent: Color, ink: Color) {
    // 함수 호출이 호출자 스코프에서 1개 자식으로 보이도록 Column 래핑 (Glance 회귀 방어).
    Column(modifier = GlanceModifier.fillMaxWidth()) {
        Spacer(GlanceModifier.height(10.dp))
        Row(
            modifier = GlanceModifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = title,
                style = TextStyle(
                    color = ColorProvider(ink.copy(alpha = ALPHA_META)),
                    fontSize = SECTION_HEADER_SIZE,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Medium,
                ),
                maxLines = 1,
                modifier = GlanceModifier.defaultWeight(),
            )
            if (badge != null) {
                Text(
                    text = badge,
                    style = TextStyle(
                        color = ColorProvider(accent.copy(alpha = ALPHA_DIM)),
                        fontSize = SECTION_HEADER_SIZE,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Medium,
                    ),
                    maxLines = 1,
                )
            }
        }
        Spacer(GlanceModifier.height(8.dp))
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Hairline divider — full-bleed 1px 8% 화이트 (또는 잉크)
// ────────────────────────────────────────────────────────────────────────────
@Composable
private fun HairlineDivider(ink: Color) {
    // Spacer + Box 두 자식을 Column 으로 감싸 호출자에서 1개로 카운트.
    Column(modifier = GlanceModifier.fillMaxWidth()) {
        Spacer(GlanceModifier.height(SECTION_GAP))
        Box(
            modifier = GlanceModifier
                .fillMaxWidth()
                .height(1.dp)
                .background(ColorProvider(ink.copy(alpha = ALPHA_FAINT_DIVIDER))),
        ) {}
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 체크리스트 — 컨테이너(pill) 제거, hairline 만으로 구획.
// ────────────────────────────────────────────────────────────────────────────
@Composable
private fun ProgressList(progress: WidgetTodayProgress, isLight: Boolean, ink: Color) {
    // 3개 ProgressRow 를 Column 으로 감싼다 — 호출자에서 1개 자식.
    Column(modifier = GlanceModifier.fillMaxWidth()) {
        ProgressRow(PROGRESS_LABEL_AFFIRMATION, progress.affirmation, isLight, ink)
        ProgressRow(PROGRESS_LABEL_ACTIONS, progress.actions, isLight, ink)
        ProgressRow(PROGRESS_LABEL_WINS, progress.wins, isLight, ink)
    }
}

@Composable
private fun ProgressRow(label: String, done: Boolean, isLight: Boolean, ink: Color) {
    Row(
        modifier = GlanceModifier
            .fillMaxWidth()
            .padding(vertical = ROW_V_PADDING),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CheckIcon(done, isLight, ink)
        Spacer(GlanceModifier.width(CHECK_LABEL_GAP))
        Text(
            text = label,
            style = TextStyle(
                color = ColorProvider(ink.copy(alpha = if (done) ALPHA_LABEL_DONE else 1f)),
                fontSize = ROW_LABEL_SIZE,
                fontFamily = FontFamily.SansSerif,
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
    ink: Color,
) {
    // Spacer + Row 를 Column 으로 감싸 호출자에서 1개 자식 (Glance 회귀 방어).
    Column(modifier = GlanceModifier.fillMaxWidth()) {
        Spacer(GlanceModifier.height(10.dp))
        Row(
            modifier = GlanceModifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CheckIcon(progress.affirmation, isLight, ink)
            Spacer(GlanceModifier.width(18.dp))
            CheckIcon(progress.actions, isLight, ink)
            Spacer(GlanceModifier.width(18.dp))
            CheckIcon(progress.wins, isLight, ink)
        }
    }
}

@Composable
private fun CheckIcon(done: Boolean, isLight: Boolean, ink: Color) {
    if (done) {
        Image(
            provider = ImageProvider(R.drawable.ic_widget_check_done),
            contentDescription = "완료",
            modifier = GlanceModifier.size(CHECK_ICON_SIZE),
        )
    } else {
        Image(
            provider = ImageProvider(R.drawable.ic_widget_check_todo),
            contentDescription = "미완료",
            modifier = GlanceModifier.size(CHECK_ICON_SIZE),
            colorFilter = ColorFilter.tint(ColorProvider(ink.copy(alpha = ALPHA_CHECK_TODO))),
        )
    }
}

// ────────────────────────────────────────────────────────────────────────────
// "이번 달 목표" 섹션
// — Glance 회귀 방지를 위해 if 분기의 직접 자식은 이 Column 하나로 유지.
// — 진행률 bar 는 데이터(goal 별 progress)가 없으므로 생략. 데이터 추가 시 부활.
// ────────────────────────────────────────────────────────────────────────────
@Composable
private fun GoalsSection(goals: List<String>, accent: Color, ink: Color) {
    Column(modifier = GlanceModifier.fillMaxWidth()) {
        HairlineDivider(ink)
        SectionHeader(SECTION_GOALS, null, accent, ink)
        goals.take(MAX_GOALS_ON_WIDGET).forEachIndexed { i, g ->
            GoalRow(i + 1, g, accent, ink)
        }
    }
}

@Composable
private fun GoalRow(num: Int, title: String, accent: Color, ink: Color) {
    Row(
        modifier = GlanceModifier
            .fillMaxWidth()
            .padding(vertical = ROW_V_PADDING),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // 번호 — serif italic accent (메모장식 "1." 평문 대비 디자인 신호 확실)
        Box(
            modifier = GlanceModifier.width(GOAL_NUM_WIDTH),
            contentAlignment = Alignment.CenterStart,
        ) {
            Text(
                text = num.toString(),
                style = TextStyle(
                    color = ColorProvider(accent),
                    fontSize = GOAL_NUM_SIZE,
                    fontFamily = FontFamily.Serif,
                    fontStyle = FontStyle.Italic,
                    fontWeight = FontWeight.Normal,
                ),
                maxLines = 1,
            )
        }
        Text(
            text = title,
            style = TextStyle(
                color = ColorProvider(ink.copy(alpha = ALPHA_DIM)),
                fontSize = ROW_LABEL_SIZE,
                fontFamily = FontFamily.SansSerif,
                fontWeight = FontWeight.Normal,
            ),
            maxLines = 1,
        )
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 푸터 — 다음 한 동작 CTA. 데이터 부족으로 "탭하여 열기" 폴백.
// ────────────────────────────────────────────────────────────────────────────
@Composable
private fun FooterCta(allDone: Boolean, ink: Color, accent: Color) {
    // HairlineDivider + Spacer + Row 세 자식 → Column 으로 1개로 묶는다.
    Column(modifier = GlanceModifier.fillMaxWidth()) {
        HairlineDivider(ink)
        Spacer(GlanceModifier.height(10.dp))
        Row(
            modifier = GlanceModifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = if (allDone) FOOTER_CTA_DONE else FOOTER_CTA_DEFAULT,
                style = TextStyle(
                    color = ColorProvider(if (allDone) accent else ink.copy(alpha = ALPHA_DIM)),
                    fontSize = FOOTER_SIZE,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Medium,
                    textAlign = TextAlign.End,
                ),
                maxLines = 1,
                modifier = GlanceModifier.fillMaxWidth(),
            )
        }
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 유틸
// ────────────────────────────────────────────────────────────────────────────

/** "YYYY-MM-DD" → "MM·DD". 잘못된 입력은 빈 문자열(레이아웃 안정성). */
internal fun formatDateHeader(ymd: String?): String {
    if (ymd.isNullOrBlank()) return ""
    val parts = ymd.split("-")
    if (parts.size < 3) return ""
    return try {
        val m = parts[1].toInt()
        val d = parts[2].toInt()
        "${m.toString().padStart(2, '0')} · ${d.toString().padStart(2, '0')}"
    } catch (_: NumberFormatException) {
        ""
    }
}

private fun countDone(p: WidgetTodayProgress): Int {
    var n = 0
    if (p.affirmation) n++
    if (p.actions) n++
    if (p.wins) n++
    return n
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
