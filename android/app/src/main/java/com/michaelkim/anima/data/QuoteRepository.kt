/**
 * 위젯/메인 앱 단일 진입점.
 * - getCached(): 즉시 보여줄 캐시 (없으면 null)
 * - refresh(): 네트워크에서 최신 받아 캐시 갱신, 결과 반환
 * - currentSlot(): 캐시 기반으로 "지금" 슬롯 반환 (응답 시점 currentSlotIndex 그대로 사용)
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

    /** 캐시에서 "지금 보여야 할" 슬롯 1건 추출. 슬롯 비어있으면 null. */
    fun currentSlot(state: CachedWidgetState?): WidgetSlot? {
        val resp = state?.response ?: return null
        if (resp.slots.isEmpty()) return null
        val idx = resp.currentSlotIndex.coerceIn(0, resp.slots.size - 1)
        return resp.slots[idx]
    }
}
