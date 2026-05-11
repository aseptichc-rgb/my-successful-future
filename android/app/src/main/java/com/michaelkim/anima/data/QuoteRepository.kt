/**
 * 위젯/메인 앱 단일 진입점.
 * - getCached(): 즉시 보여줄 캐시 (없으면 null)
 * - refresh(): 네트워크에서 최신 받아 캐시 갱신, 결과 반환
 * - currentSlot(): 캐시 기반으로 "지금" 슬롯 반환.
 *
 * 위젯/홈 일치 정책: 웹 /home 화면이 dailyMotivation 한 장만 노출하므로,
 * 위젯도 항상 motivation 슬롯을 골라 같은 한 마디를 보여준다.
 * famousQuotes 풀(slots[1..])은 응답에 포함되어 있어도 현재는 사용하지 않는다.
 *
 * 예외: refresh() 는 네트워크/인증 실패 시 throw — Worker/UI 가 try-catch 로 처리.
 */
package com.michaelkim.anima.data

import android.content.Context
import com.michaelkim.anima.data.api.ApiClient
import com.michaelkim.anima.data.local.QuoteCache

object QuoteRepository {

    suspend fun getCached(context: Context): CachedWidgetState? = QuoteCache.read(context)

    /**
     * @param lang null = 백엔드 기본 ("ko")
     */
    suspend fun refresh(context: Context, lang: String? = null): WidgetTodayResponse {
        val response = ApiClient.widgetApi.getToday(lang = lang)
        QuoteCache.save(context, response)
        return response
    }

    /**
     * 캐시에서 "지금 보여야 할" 슬롯 1건 추출.
     * 웹 /home 과 동일한 dailyMotivation 카드를 보여주기 위해 motivation 슬롯을 우선 선택한다.
     * motivation 슬롯이 없으면(이론적 폴백) currentSlotIndex 또는 slots[0] 사용.
     */
    fun currentSlot(state: CachedWidgetState?): WidgetSlot? {
        val resp = state?.response ?: return null
        if (resp.slots.isEmpty()) return null
        resp.slots.firstOrNull { it is WidgetSlot.Motivation }?.let { return it }
        val idx = resp.currentSlotIndex.coerceIn(0, resp.slots.size - 1)
        return resp.slots[idx]
    }
}
