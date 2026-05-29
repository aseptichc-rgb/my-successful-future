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
import java.time.LocalDate
import java.time.LocalTime
import java.time.temporal.WeekFields
import java.util.Locale

// ────────────────────────────────────────────────────────────────────────────
// 라벨 (홈 화면과 동기화 — lib/firebase.ts MAX_DAILY_WINS=3 / dictionaries/ko.ts)
// ────────────────────────────────────────────────────────────────────────────
private const val PROGRESS_LABEL_AFFIRMATION = "성공한 나에게 한 발 더"
private const val PROGRESS_LABEL_ACTIONS = "목표를 이루기 위한 오늘의 행동"
private const val PROGRESS_LABEL_WINS = "오늘 잘한 일 3가지"
private const val SECTION_TODAY = "TODAY · 오늘의 행동"
private const val SECTION_GOALS = "GOALS · 이번 달 목표"
// "성공한 나에게 한 발 더" 다짐 본문 섹션 — 매일 결심을 다잡도록 vow 를 그대로 노출.
private const val SECTION_AFFIRMATIONS = "VOW · 성공한 나의 다짐"
// 시간대별 CTA — design/Widget Directive.md §5 morning/midday/evening 패턴.
// 색 swap(soul→success #7CB377)은 사용자 팔레트 통일 결정에 따라 보류, 카피만 시간대화.
private const val FOOTER_CTA_MORNING = "오늘 시작  →"
private const val FOOTER_CTA_MIDDAY = "기록하기  →"
private const val FOOTER_CTA_EVENING = "오늘 마무리  →"
private const val FOOTER_CTA_DONE = "오늘 3 / 3 완료  →"

// 시간대 컷오프 (KST 기기 시계 기준). 아침 끝/저녁 시작 시각.
private const val HOUR_MORNING_END = 11   // 11시 전까지가 morning
private const val HOUR_EVENING_START = 18 // 18시부터 evening
private const val MAX_GOALS_ON_WIDGET = 3
private const val TOTAL_DAILY_ACTIONS = 3
// 다짐 본문 노출 개수 — 키 충분한(extra-tall) 위젯은 더 많이, 그 외엔 컴팩트하게.
// 넘치는 항목은 "+N 더" 힌트로 알려 무음 절단(silent cap)을 피한다.
private const val MAX_AFFIRMATIONS_ON_WIDGET = 4
private const val MAX_AFFIRMATIONS_COMPACT = 2

// 요일 한글 라벨 — DayOfWeek.value 는 ISO(월=1 … 일=7).
private val DOW_KO = listOf("월", "화", "수", "목", "금", "토", "일")

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
private val LOGO_SIZE = 14.dp
private val BRAND_GAP = 7.dp

// 타이포
private val QUOTE_FONT_SIZE = 16.sp
private val ATTRIBUTION_FONT_SIZE = 10.sp
private val SECTION_HEADER_SIZE = 10.sp
private val ROW_LABEL_SIZE = 13.sp
private val GOAL_NUM_SIZE = 18.sp
private val META_SIZE = 11.sp
private val FOOTER_SIZE = 10.sp
private val BRAND_NAME_SIZE = 13.sp
private const val QUOTE_MAX_LINES_TALL = 4
private const val QUOTE_MAX_LINES_SHORT = 3

// 색 — 웹 앱과 동일한 cream + indigo + soul 팔레트.
// (Color 객체는 res/values/colors.xml 토큰과 동기화)
private val INK = Color(0xFF1E1B4B)            // widget_ink — indigo on cream
private val INK_LIGHT = Color(0xFF1E1B4B)      // 동일 (호환 유지)
private val ACCENT_SOUL = Color(0xFFD85A30)    // widget_accent_soul
private val SUCCESS = Color(0xFFD85A30)        // 웹과 동일하게 soul 단일 — 완료 시도 같은 톤

@Composable
fun WidgetContent(
    slot: WidgetSlot?,
    progress: WidgetTodayProgress?,
    ymd: String?,
    streakCount: Int = 0,
    affirmations: List<String> = emptyList(),
) {
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
        LoadedContent(slot, progress, ymd, streakCount, affirmations, isWide, isTall, isExtraTall, isLight, ink)
    }
}

@Composable
private fun EmptyState(ink: Color) {
    // 로그인 전이라도 어느 앱의 위젯인지 알 수 있게 브랜드 로고+워드마크 노출.
    // 메시지는 중앙 정렬 — 사용자가 0.5초 안에 "어느 앱 / 왜 비어있는지"를 모두 인식.
    // 빈 상태에서는 ymd/streak 모두 없으므로 날짜·streak 칩도 자연스레 생략된다.
    Column(modifier = GlanceModifier.fillMaxSize()) {
        BrandRow(
            progress = null,
            doneCount = 0,
            accent = ACCENT_SOUL,
            ink = ink,
            ymd = null,
            streakCount = 0,
            showDateMeta = false,
            showProgressCount = false,
        )
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
}

@Composable
private fun LoadedContent(
    slot: WidgetSlot,
    progress: WidgetTodayProgress?,
    ymd: String?,
    streakCount: Int,
    affirmations: List<String>,
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
        // ── 1. 브랜드 헤더 ─────────────────────────────────────────────
        // 항상 노출 — 로고 + Anima 워드마크. 진척도가 있고 키가 충분하면 같은 줄 우측에 카운트.
        // 사용자 요청: 모든 사이즈에서 어느 앱의 위젯인지 즉시 인식되도록 브랜드 마크 상시 표시.
        // 키가 충분한 위젯에는 design/Widget Directive.md §3.4 의 날짜 메타 라인도 추가.
        Column(modifier = GlanceModifier.fillMaxWidth()) {
            BrandRow(
                progress = progress,
                doneCount = doneCount,
                accent = accent,
                ink = ink,
                ymd = ymd,
                streakCount = streakCount,
                showDateMeta = isTall,
                showProgressCount = isTall && progress != null,
            )
            Spacer(GlanceModifier.height(SECTION_GAP))
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

        // ── 4. 성공한 나의 다짐 (한 발 더) ─────────────────────────────
        // 매일 결심을 다잡도록 다짐 본문을 그대로 노출. 키·폭이 충분할 때만 — 좁은 위젯은
        // 체크 신호만으로 충분하고, 본문을 욱여넣으면 신호판 가독성이 깨진다.
        if (isWide && isTall && affirmations.isNotEmpty()) {
            val maxRows = if (isExtraTall) MAX_AFFIRMATIONS_ON_WIDGET else MAX_AFFIRMATIONS_COMPACT
            AffirmationsSection(affirmations, maxRows, accent, ink)
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
// 브랜드 헤더 — (옵션) 날짜 메타 한 줄 + 로고 + "Anima" 워드마크 + 진척도 카운트
//
// design/Widget Directive.md §3.4 의 "5 · 24  TUE · WEEK 21" 패턴을 한국어 톤에
// 맞춰 "5 · 24 · 일 · WEEK 21" 로 적용. 키가 충분한 위젯에만 노출 — small 에서
// 노출하면 가용 세로 공간을 잡아먹어 체크리스트가 가려진다.
// ────────────────────────────────────────────────────────────────────────────
@Composable
private fun BrandRow(
    progress: WidgetTodayProgress?,
    doneCount: Int,
    accent: Color,
    ink: Color,
    ymd: String?,
    streakCount: Int,
    showDateMeta: Boolean,
    showProgressCount: Boolean,
) {
    Column(modifier = GlanceModifier.fillMaxWidth()) {
        // ── 메타 라인 (좌: 날짜, 우: STREAK 칩) ─────────────────────────
        // design/Widget Directive.md §3.4 의 헤더 패턴: 좌상단 날짜 메타 + 우상단 streak.
        // 둘 다 키 충분한 위젯(showDateMeta)에서만 노출 — small 에서는 가용 공간이 부족.
        // ymd 파싱 실패 또는 streak 0 인 경우 해당 자리는 자연스레 비워둔다.
        val dateMeta = if (showDateMeta) formatDateMeta(ymd) else null
        val showStreak = showDateMeta && streakCount > 0
        if (dateMeta != null || showStreak) {
            Column(modifier = GlanceModifier.fillMaxWidth()) {
                Row(
                    modifier = GlanceModifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = dateMeta ?: "",
                        style = TextStyle(
                            color = ColorProvider(ink.copy(alpha = ALPHA_META)),
                            fontSize = META_SIZE,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Medium,
                        ),
                        maxLines = 1,
                        modifier = GlanceModifier.defaultWeight(),
                    )
                    if (showStreak) {
                        // ● 글리프(원형 dot)는 accent 색의 같은 줄에 함께 — RemoteViews 가
                        // box-shadow glow 미지원이라 dot+텍스트로 표현. accent 가 dot 색을
                        // 그대로 가져가 살아있는 진척 신호로 읽힌다.
                        Text(
                            text = "●  STREAK $streakCount",
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
                Spacer(GlanceModifier.height(6.dp))
            }
        }
        // ── 브랜드 라인 (좌: 로고+워드마크, 우: 오늘의 진척 카운트) ─────
        Row(
            modifier = GlanceModifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Image(
                provider = ImageProvider(R.drawable.ic_anima_aperture),
                contentDescription = "Anima",
                modifier = GlanceModifier.size(LOGO_SIZE),
            )
            Spacer(GlanceModifier.width(BRAND_GAP))
            // "Anima" 워드마크 — serif 로 클래식한 브랜드 톤. italic 은 인용문 영역에서만 사용해
            // 두 위계가 충돌하지 않도록 Normal 로 유지.
            Text(
                text = "Anima",
                style = TextStyle(
                    color = ColorProvider(ink),
                    fontSize = BRAND_NAME_SIZE,
                    fontFamily = FontFamily.Serif,
                    fontWeight = FontWeight.Medium,
                ),
                maxLines = 1,
                modifier = GlanceModifier.defaultWeight(),
            )
            if (showProgressCount && progress != null) {
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
}

/**
 * "2026-05-24" → "5 · 24 · 일 · WEEK 21" 변환.
 * design/Widget Directive.md §3.4 의 헤더 메타 라인 포맷.
 * 입력이 ISO-8601 yyyy-MM-dd 가 아니거나 파싱 실패 시 null 반환 — 호출자는 라인을 생략한다.
 */
private fun formatDateMeta(ymd: String?): String? {
    if (ymd.isNullOrBlank()) return null
    return try {
        val date = LocalDate.parse(ymd)
        val dowIndex = (date.dayOfWeek.value - 1).coerceIn(0, DOW_KO.size - 1)
        val dow = DOW_KO[dowIndex]
        val week = date.get(WeekFields.of(Locale.KOREA).weekOfWeekBasedYear())
        "${date.monthValue} · ${date.dayOfMonth} · $dow · WEEK $week"
    } catch (_: Exception) {
        // DateTimeParseException 등 모든 파싱 실패를 한 곳에서 잡고 null 로 폴백.
        null
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
// "성공한 나에게 한 발 더" 다짐 본문 섹션
// — 위 진척도 체크리스트의 "성공한 나에게 한 발 더" 항목이 "오늘 했나?" 라면,
//   이 섹션은 "무엇을 다짐했나" 의 본문을 보여줘 매일 결심을 다잡게 한다.
// — Glance 회귀 방지: if 분기의 직접 자식은 이 Column 하나로 유지.
// ────────────────────────────────────────────────────────────────────────────
@Composable
private fun AffirmationsSection(
    affirmations: List<String>,
    maxRows: Int,
    accent: Color,
    ink: Color,
) {
    Column(modifier = GlanceModifier.fillMaxWidth()) {
        HairlineDivider(ink)
        SectionHeader(SECTION_AFFIRMATIONS, null, accent, ink)
        val shown = affirmations.take(maxRows)
        shown.forEach { AffirmationRow(it, accent, ink) }
        // 넘치는 다짐은 무음 절단 대신 "+N 더" 로 명시 — 사용자가 본문 일부만 보임을 인지.
        val remaining = affirmations.size - shown.size
        if (remaining > 0) {
            Column(modifier = GlanceModifier.fillMaxWidth()) {
                Spacer(GlanceModifier.height(2.dp))
                Text(
                    text = "+$remaining 더",
                    style = TextStyle(
                        color = ColorProvider(ink.copy(alpha = ALPHA_META)),
                        fontSize = META_SIZE,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Medium,
                    ),
                    maxLines = 1,
                )
            }
        }
    }
}

@Composable
private fun AffirmationRow(text: String, accent: Color, ink: Color) {
    Row(
        modifier = GlanceModifier
            .fillMaxWidth()
            .padding(vertical = ROW_V_PADDING),
        verticalAlignment = Alignment.Top,
    ) {
        // 마커 — accent dash. 목표(serif 번호)와 구분되는 "다짐" 신호.
        Box(
            modifier = GlanceModifier.width(GOAL_NUM_WIDTH),
            contentAlignment = Alignment.CenterStart,
        ) {
            Text(
                text = "—",
                style = TextStyle(
                    color = ColorProvider(accent),
                    fontSize = ROW_LABEL_SIZE,
                    fontFamily = FontFamily.Serif,
                ),
                maxLines = 1,
            )
        }
        // 다짐 본문 — serif italic 으로 "나의 맹세" 톤. 한 줄을 넘으면 2줄까지 허용.
        Text(
            text = text,
            style = TextStyle(
                color = ColorProvider(ink),
                fontSize = ROW_LABEL_SIZE,
                fontFamily = FontFamily.Serif,
                fontStyle = FontStyle.Italic,
                fontWeight = FontWeight.Normal,
            ),
            maxLines = 2,
        )
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 푸터 — 다음 한 동작 CTA. 데이터 부족으로 "탭하여 열기" 폴백.
// ────────────────────────────────────────────────────────────────────────────
@Composable
private fun FooterCta(allDone: Boolean, ink: Color, accent: Color) {
    // HairlineDivider + Spacer + Row 세 자식 → Column 으로 1개로 묶는다.
    val cta = if (allDone) FOOTER_CTA_DONE else currentTimeOfDayCta()
    Column(modifier = GlanceModifier.fillMaxWidth()) {
        HairlineDivider(ink)
        Spacer(GlanceModifier.height(10.dp))
        Row(
            modifier = GlanceModifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = cta,
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

/**
 * 기기 시계 기준 morning/midday/evening 으로 CTA 카피 분기.
 * 위젯은 WorkManager 주기와 사용자 탭에 의해서만 갱신되므로 다음 갱신까지 카피가 살짝 stale 할
 * 수 있지만 시간대 "힌트" 수준이라 사용자 경험에 무해.
 * LocalTime.now() 는 시스템 시계 손상 같은 극한 상황에서만 던지므로 catch-all 폴백.
 */
private fun currentTimeOfDayCta(): String {
    return try {
        val hour = LocalTime.now().hour
        when {
            hour < HOUR_MORNING_END -> FOOTER_CTA_MORNING
            hour < HOUR_EVENING_START -> FOOTER_CTA_MIDDAY
            else -> FOOTER_CTA_EVENING
        }
    } catch (_: Exception) {
        FOOTER_CTA_MIDDAY
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 유틸
// ────────────────────────────────────────────────────────────────────────────

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
