/**
 * 홈/잠금화면 위젯.
 *
 * Glance 가 RemoteViews 로 컴파일되므로 복잡한 레이아웃·이미지·애니메이션 사용 금지.
 * 데이터는 QuoteCache 에서 즉시 읽고, "비어있을 때 어떻게 보일지" 는 WidgetUi 가 책임.
 */
package com.michaelkim.anima.widget

import android.content.Context
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceId
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.provideContent
import com.michaelkim.anima.data.QuoteRepository

class QuoteWidget : GlanceAppWidget() {

    override val sizeMode = SizeMode.Responsive(
        setOf(
            DpSize(120.dp, 120.dp), // small (2x2)
            DpSize(250.dp, 120.dp), // medium (4x2)
            DpSize(250.dp, 250.dp), // large (4x4)
        ),
    )

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val cached = QuoteRepository.getCached(context)
        val slot = QuoteRepository.currentSlot(cached)
        val progress = cached?.response?.todayProgress
        provideContent {
            WidgetContent(slot, progress)
        }
    }
}
