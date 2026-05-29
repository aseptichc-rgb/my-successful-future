/**
 * 홈/잠금화면 위젯.
 *
 * Glance 가 RemoteViews 로 컴파일되므로 복잡한 레이아웃·이미지·애니메이션 사용 금지.
 * 데이터는 QuoteCache 에서 즉시 읽고, "비어있을 때 어떻게 보일지" 는 WidgetUi 가 책임.
 */
package com.michaelkim.anima.widget

import android.content.Context
import androidx.glance.GlanceId
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.provideContent
import com.michaelkim.anima.data.QuoteRepository

class QuoteWidget : GlanceAppWidget() {

    // Responsive 는 미리 정의한 변형 중 하나를 호스트가 고르는데, 큰 화면에서도 320dp
    // 변형이 안 골라지는 경우가 있어 "나의 목표" 블록이 트리거되지 않았다.
    // Exact 모드로 바꿔 위젯이 차지한 실제 dp 를 그대로 받게 한다 — WidgetUi 의
    // EXTRA_TALL_THRESHOLD_DP(280dp) 임계치가 실제 사이즈로 평가된다.
    // 비용: 사이즈가 바뀔 때마다 provideGlance 재호출되지만 위젯 리사이즈 빈도가 낮아 부담 없음.
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val cached = QuoteRepository.getCached(context)
        val slot = QuoteRepository.currentSlot(cached)
        val progress = cached?.response?.todayProgress
        // 위젯이 "지금 그리고 있는" 카드가 속한 날짜(ymd). 탭 시 이 값을 /home 으로
        // 넘겨, 웹이 기기 시계로 다시 계산하지 않고 위젯과 같은 문서를 읽게 한다.
        val ymd = cached?.response?.ymd
        // 다짐 streak — 옛 캐시는 0 으로 기본값 처리되어 자연스레 숨겨진다.
        val streak = cached?.response?.streakCount ?: 0
        // "성공한 나에게 한 발 더" 다짐 본문 — 옛 캐시엔 없어 빈 리스트로 폴백된다.
        val affirmations = cached?.response?.affirmations ?: emptyList()
        provideContent {
            WidgetContent(slot, progress, ymd, streak, affirmations)
        }
    }
}
