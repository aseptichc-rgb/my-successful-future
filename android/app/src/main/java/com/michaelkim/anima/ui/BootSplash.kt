/**
 * 앱 부팅 스플래시 — 앱을 켰을 때 가장 먼저, 가장 크게 보이는 한 문장.
 *
 * 왜 필요한가:
 *  로그인된 사용자는 MainActivity 가 setContent 없이 곧장 위젯 캐시를 동기 갱신하고
 *  (최대 2.5초) TWA 를 띄우기 때문에, 그 사이 화면에는 windowBackground 만 떠 있었다.
 *  사용자가 앱에서 가장 먼저 마주하는 몇 초라, 이 제품의 한 문장을 크게 보여주는 자리로 쓴다.
 *
 * 아트디렉션: anima-ig-01-obsidian-gold.png (인스타 포스터) — 흑요석 배경 · 크림 세리프
 * 헤드라인 · 마지막 한 조각만 골드 이탤릭 · 번트오렌지 아이브로우 · 골드 헤어라인.
 * 웹의 [components/ui/BootSplash] 와 같은 문장·같은 색을 쓴다 — TWA 가 뜨는 순간 네이티브
 * 스플래시에서 웹 스플래시로 넘어가므로, 두 화면이 어긋나면 깜빡임처럼 보인다.
 * 문구를 바꿀 때는 strings.xml 의 boot_* 와 lib/i18n 의 "splash.*" 를 함께 바꿀 것.
 */
package com.michaelkim.anima.ui

import androidx.compose.foundation.Image
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.colorResource
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.michaelkim.anima.R

// 색은 values/colors.xml 의 boot_* 한 곳에서만 관리한다 (themes.xml · 벡터 마크와 공유).
private val BootSidePadding = 26.dp
private val BootTopPadding = 30.dp
private val BootBottomPadding = 96.dp
private val BootMarkSize = 22.dp
private val BootMarkGap = 8.dp
private val BootWordmarkSize = 18.sp
private val BootEyebrowSize = 11.sp
private val BootEyebrowTracking = 3.4.sp
private val BootEyebrowGap = 18.dp
private val BootHeadlineSize = 32.sp
private val BootHeadlineLineHeight = 42.sp
private val BootRuleGap = 30.dp
private val BootRuleWidth = 220.dp
private val BootRuleHeight = 1.dp
private val BootSpinnerGap = 26.dp
private val BootSpinnerSize = 16.dp
private val BootSpinnerStroke = 1.5.dp

/**
 * 부팅 스플래시 한 화면. 로딩 스피너 외에는 아무 상호작용도 두지 않는다 —
 * 이 화면의 목적은 "첫 문장을 읽히는 것" 하나뿐이다.
 */
@Composable
fun BootSplash(modifier: Modifier = Modifier) {
    val obsidian = colorResource(R.color.boot_obsidian)
    val obsidianDeep = colorResource(R.color.boot_obsidian_deep)
    val cream = colorResource(R.color.boot_cream)
    val gold = colorResource(R.color.boot_gold)
    val ember = colorResource(R.color.boot_ember)
    val hairline = colorResource(R.color.boot_hairline)

    // stringResource 는 @Composable 이라 buildAnnotatedString 람다 안에서 못 부른다 — 먼저 읽어둔다.
    val lead = stringResource(R.string.boot_belief_lead)
    val accent = stringResource(R.string.boot_belief_accent)
    val headline = buildAnnotatedString {
        append(lead)
        append(" ")
        // 마지막 조각만 골드 — 크림 문장 끝에서 한 번 더 시선이 걸린다.
        // 포스터는 이탤릭이지만 한글은 기울임을 시스템이 합성해 글자가 뭉개지므로 색만 바꾼다.
        withStyle(SpanStyle(color = gold)) { append(accent) }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(listOf(obsidian, obsidianDeep))),
    ) {
        // 좌상단 브랜드 락업 — 포스터와 같은 자리.
        Row(
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(start = BootSidePadding, top = BootTopPadding),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Image(
                painter = painterResource(R.drawable.ic_anima_aperture_gold),
                contentDescription = null,
                modifier = Modifier.size(BootMarkSize),
            )
            Spacer(Modifier.width(BootMarkGap))
            Text(
                text = "anima",
                color = cream,
                fontSize = BootWordmarkSize,
                fontFamily = FontFamily.Serif,
            )
        }

        // 문장 블록은 아래쪽 1/3 — 포스터의 시선 흐름(빈 상단 → 문장) 을 그대로 옮겼다.
        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .padding(
                    start = BootSidePadding,
                    end = BootSidePadding,
                    bottom = BootBottomPadding,
                ),
            verticalArrangement = Arrangement.Bottom,
        ) {
            Text(
                text = stringResource(R.string.boot_eyebrow),
                color = ember,
                fontSize = BootEyebrowSize,
                fontWeight = FontWeight.Medium,
                letterSpacing = BootEyebrowTracking,
            )
            Spacer(Modifier.height(BootEyebrowGap))
            Text(
                text = headline,
                color = cream,
                fontSize = BootHeadlineSize,
                lineHeight = BootHeadlineLineHeight,
                fontFamily = FontFamily.Serif,
            )
            Spacer(Modifier.height(BootRuleGap))
            Box(
                modifier = Modifier
                    .width(BootRuleWidth)
                    .height(BootRuleHeight)
                    .background(Brush.horizontalGradient(listOf(hairline, Color.Transparent))),
            )
            Spacer(Modifier.height(BootSpinnerGap))
            CircularProgressIndicator(
                modifier = Modifier.size(BootSpinnerSize),
                color = gold,
                strokeWidth = BootSpinnerStroke,
            )
        }
    }
}
