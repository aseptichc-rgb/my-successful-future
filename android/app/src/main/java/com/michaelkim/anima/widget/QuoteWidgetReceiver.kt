/**
 * AppWidget 시스템과 Glance 사이의 어댑터.
 *
 * 위젯이 처음 추가되거나 시스템이 갱신을 트리거하면 onUpdate 가 호출되는데,
 * 그 순간 백그라운드 Worker 도 함께 깨워 최신 데이터를 받아오게 한다.
 */
package com.michaelkim.anima.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import com.michaelkim.anima.work.WorkScheduler

class QuoteWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = QuoteWidget()

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        super.onUpdate(context, appWidgetManager, appWidgetIds)
        // 위젯이 갱신될 때마다 OneTime Worker 1회 + Periodic 보장
        WorkScheduler.scheduleOneTimeRefresh(context)
        WorkScheduler.schedulePeriodicRefresh(context)
    }

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        // 첫 위젯이 추가된 순간 — 최초 데이터 받기
        WorkScheduler.scheduleOneTimeRefresh(context)
        WorkScheduler.schedulePeriodicRefresh(context)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
    }
}
