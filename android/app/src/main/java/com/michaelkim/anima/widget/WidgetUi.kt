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

// 라벨 달린 세로 체크리스트 3행을 클립 없이 그리려면 최소 이 정도의 세로 폭이 필요.
// medium(250x120) 처럼 키가 낮은 위젯은 명언만으로도 공간이 빠듯해 라벨을 펼치면
// 두 번째·세 번째 행이 그대로 잘려 나가므로, 이 임계치 미만에서는 콤팩트 아이콘 행으로 폴백한다.
private val TALL_THRESHOLD_DP = 200.dp

// 사용자가 위젯을 "위아래로 크게" 늘렸을 때(QuoteWidget 의 250x320 변형) "나의 목표" 블록을
// 체크리스트 아래에 추가로 노출. large(250x250) 까지는 기존 레이아웃 유지.
private val EXTRA_TALL_THRESHOLD_DP = 280.dp

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

// 인용구 영역 타이포 토큰. 글리프를 24sp 로 줄여 큰 위젯에서도 체크리스트 3행이 자리 잡을
// 세로 공간을 확보한다 — 시각 무게는 여전히 충분.
private val QUOTE_GLYPH_SIZE = 24.sp
private const val QUOTE_MAX_LINES_TALL = 4
private const val QUOTE_MAX_LINES_SHORT = 3
private const val ORIGINAL_MAX_LINES = 2

// 명언/체크리스트 사이의 여백. 14dp → 10dp 로 좁혀 세 번째 행이 잘리는 마진을 추가 확보.
private val DIVIDER_SPACER = 10.dp

// 체크리스트 한 줄의 위·아래 패딩. 7dp → 6dp 로 1dp 씩 줄여, 3행 합산 6dp 의 여유 확보.
private val PROGRESS_ROW_V_PADDING = 6.dp
private val PROGRESS_ROW_GAP = 5.dp

// "나의 목표" 블록 토큰 — 위젯이 매우 클 때만 노출.
// 라벨은 lib/i18n/dictionaries/ko.ts 의 "motivation.wallpaper.goalsLabel" 와 동기화.
private const val GOALS_LABEL = "나의 목표"
private const val MAX_GOALS_ON_WIDGET = 3
private const val ALPHA_GOAL_TEXT = 0.88f

@Composable
fun WidgetContent(slot: WidgetSlot?, progress: WidgetTodayProgress?, ymd: String?) {
    val context = LocalContext.current
    val size = LocalSize.current
    val isWide = size.width >= WIDE_THRESHOLD_DP
    // 라벨 리스트는 가로뿐 아니라 세로 공간도 충분해야 펼친다 — 그렇지 않으면 클립 발생.
    val isTall = size.height >= TALL_THRESHOLD_DP
    // 사용자가 위젯을 위아래로 더 늘린 경우 "나의 목표" 블록까지 노출.
    val isExtraTall = size.height >= EXTRA_TALL_THRESHOLD_DP
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
        LoadedContent(slot, progress, isWide, isTall, isExtraTall, isLight, textPrimary)
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
    isTall: Boolean,
    isExtraTall: Boolean,
    isLight: Boolean,
    textPrimary: Color,
) {
    Column(modifier = GlanceModifier.fillMaxSize()) {
        // 모든 자식을 자기 자연 크기로 위쪽 정렬해 쌓는다. defaultWeight() 를 쓰면
        // AppWidgetManager 가 보고한 위젯 사이즈와 호스트(One UI 등)의 실제 가시 영역이
        // 어긋날 때, weight 자식이 남는 공간을 다 차지하면서 그 아래 형제(체크리스트·
        // 목표 블록)가 가시 영역 밖으로 잘려 나가는 사고가 났다. 자연 크기 + 위쪽 정렬은
        // 아래에 빈 공간이 생길 수 있지만 잘림 위험은 0.
        Column(modifier = GlanceModifier.fillMaxWidth()) {
            // 인용구 글리프 — 명언임을 직관적으로 인지시키는 그래픽 요소.
            Text(
                text = "“",
                style = TextStyle(
                    color = ColorProvider(textPrimary.copy(alpha = ALPHA_QUOTE_GLYPH)),
                    fontSize = QUOTE_GLYPH_SIZE,
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
                // 넉넉한 큰 위젯에선 4줄, 그 외에는 3줄로 자른다 — 어느 쪽이든 체크리스트 우선.
                maxLines = if (isTall) QUOTE_MAX_LINES_TALL else QUOTE_MAX_LINES_SHORT,
            )
            // 넓고 키도 큰 위젯에서만 원어 원문을 본문 아래 작게(이탤릭·연회색) 병기.
            // 키가 낮으면 체크리스트 공간이 부족하므로 과감히 생략한다.
            val originalText = slot.originalText
            if (isWide && isTall && !originalText.isNullOrBlank()) {
                Spacer(GlanceModifier.height(4.dp))
                Text(
                    text = originalText,
                    style = TextStyle(
                        color = ColorProvider(textPrimary.copy(alpha = ALPHA_SECONDARY)),
                        fontSize = 11.sp,
                        fontStyle = FontStyle.Italic,
                    ),
                    maxLines = ORIGINAL_MAX_LINES,
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
        }
        if (progress != null) {
            // 명언 영역과 체크리스트를 분리하는 여백 + 헤어라인 디바이더.
            Spacer(GlanceModifier.height(DIVIDER_SPACER))
            Box(
                modifier = GlanceModifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(ColorProvider(textPrimary.copy(alpha = ALPHA_DIVIDER))),
            ) {}
            Spacer(GlanceModifier.height(DIVIDER_SPACER))
            // 가로뿐 아니라 세로도 넉넉할 때만 라벨 리스트. medium(250x120) 처럼 키가 낮은
            // 위젯은 라벨을 펼치면 폭이 부족해 잘리므로 콤팩트 아이콘 행으로 폴백.
            if (isWide && isTall) {
                ProgressList(progress, isLight, textPrimary)
            } else {
                ProgressIconsCompact(progress, isLight, textPrimary)
            }
        }
        // 사용자가 위젯을 위아래로 크게 늘렸을 때만 "나의 목표" 블록을 추가 노출.
        // 가로 폭도 충분해야 한 줄 텍스트가 클립 없이 들어간다.
        // 사용자가 위젯을 위아래로 크게 늘렸을 때만 "나의 목표" 블록 노출.
        // 실측: Glance→RemoteViews 변환이 이 if 분기 안에 자식이 2개 이상이면 두 번째부터
        // 통째로 누락한다(라벨 Text 는 보이지만 다음 Text 가 사라짐). 그래서 라벨 + 목표 1·2·3
        // 을 단일 Text 의 여러 줄(\n) 로 합쳐 자식 1개로 구성한다 — 스타일 분리는 포기하되
        // 사용자가 큰 위젯에서 목표를 확인할 수 있는 가시성을 100% 보장한다.
        if (isExtraTall && isWide && slot.goalsSnapshot.isNotEmpty()) {
            val combined = buildString {
                append(GOALS_LABEL)
                slot.goalsSnapshot.take(MAX_GOALS_ON_WIDGET).forEachIndexed { i, g ->
                    append('\n')
                    append("${i + 1}. $g")
                }
            }
            Text(
                text = combined,
                style = TextStyle(
                    color = ColorProvider(textPrimary.copy(alpha = ALPHA_GOAL_TEXT)),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                ),
                // 라벨 1줄 + 목표 최대 3줄.
                maxLines = 1 + MAX_GOALS_ON_WIDGET,
            )
        }
    }
}

/** 넓은 위젯: 줄별 카드 칩으로 세로 나열. */
@Composable
private fun ProgressList(progress: WidgetTodayProgress, isLight: Boolean, textPrimary: Color) {
    ProgressRowCard(PROGRESS_LABEL_AFFIRMATION, progress.affirmation, isLight, textPrimary)
    Spacer(GlanceModifier.height(PROGRESS_ROW_GAP))
    ProgressRowCard(PROGRESS_LABEL_ACTIONS, progress.actions, isLight, textPrimary)
    Spacer(GlanceModifier.height(PROGRESS_ROW_GAP))
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
            .padding(horizontal = 12.dp, vertical = PROGRESS_ROW_V_PADDING),
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
