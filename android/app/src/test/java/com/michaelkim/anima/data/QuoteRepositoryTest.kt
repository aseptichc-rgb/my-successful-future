/**
 * QuoteRepository 의 순수 판정 로직 단위 테스트 (Android 런타임 불필요).
 *
 * 2026-09-02 위젯 고착 사고 회귀 방지:
 *  - 위젯이 8/22 카드에 11일간 멈춰 있었다. 앱을 열 때마다 서버는 카드를 만들고 쿼터까지 셌지만
 *    (usage.widgetRefresh 매일 1), 캐시는 한 번도 갱신되지 않았다.
 *  - 원인 중 하나가 [QuoteRepository.refreshIfStale] 의 throttle 이 "실패/취소된 시도" 까지
 *    성공으로 간주해, 그 실패 때문에 큐잉된 폴백 Worker 가 네트워크를 건너뛰던 것이다.
 *  - 이 테스트는 throttle 의 유일한 근거가 "캐시가 실제로 방금 갱신됐는가" 임을 고정한다.
 */
package com.michaelkim.anima.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class QuoteRepositoryTest {

    private val window = 90_000L
    private val now = 1_700_000_000_000L

    @Test
    fun `cache written inside the window is fresh`() {
        assertTrue(QuoteRepository.isFreshWithin(cachedAtEpochMs = now - 30_000L, nowMs = now, minIntervalMs = window))
    }

    @Test
    fun `cache written exactly at the window edge is not fresh`() {
        assertFalse(QuoteRepository.isFreshWithin(cachedAtEpochMs = now - window, nowMs = now, minIntervalMs = window))
    }

    @Test
    fun `eleven day old cache is never fresh`() {
        val elevenDays = 11L * 24 * 60 * 60 * 1000
        assertFalse(QuoteRepository.isFreshWithin(cachedAtEpochMs = now - elevenDays, nowMs = now, minIntervalMs = window))
    }

    @Test
    fun `cache timestamp in the future (clock rewind) is treated as stale`() {
        assertFalse(QuoteRepository.isFreshWithin(cachedAtEpochMs = now + 5_000L, nowMs = now, minIntervalMs = window))
    }

    // ── 표시 보정 — 옛 캐시(upcoming 없음)는 그대로 노출된다는 사실을 문서화 ─────────────
    // 8/22 캐시엔 upcoming 미리보기가 없어 자정 보정이 불가능했다. 이 경우 위젯은 캐시를 그대로
    // 그리므로, 네트워크 갱신만이 유일한 탈출구다 — 그래서 throttle 이 폴백을 막으면 안 된다.

    private fun response(ymd: String, upcoming: List<WidgetUpcomingQuote> = emptyList()) = WidgetTodayResponse(
        generatedAt = "${ymd}T00:00:00.000Z",
        ymd = ymd,
        slots = listOf(
            WidgetSlot(
                text = "quote-$ymd",
                author = "author",
                gradient = MotivationGradient(from = "#000000", to = "#FFFFFF", angle = 135, tone = "dark"),
            ),
        ),
        nextRefreshAt = "${ymd}T15:00:00.000Z",
        todayProgress = WidgetTodayProgress(affirmation = true),
        upcoming = upcoming,
    )

    @Test
    fun `stale cache without upcoming preview is displayed unchanged`() {
        val cached = response("2026-08-22")
        val shown = QuoteRepository.effectiveResponseForDisplay(cached, todayYmd = "2026-09-02")
        assertEquals(cached, shown)
    }

    @Test
    fun `stale cache with upcoming preview swaps quote and resets daily progress`() {
        val cached = response(
            "2026-09-01",
            upcoming = listOf(WidgetUpcomingQuote(ymd = "2026-09-02", text = "preview", author = "p")),
        )
        val shown = QuoteRepository.effectiveResponseForDisplay(cached, todayYmd = "2026-09-02")!!
        assertEquals("2026-09-02", shown.ymd)
        assertEquals("preview", shown.slots.single().text)
        assertFalse(shown.todayProgress.affirmation)
        assertNull(shown.futureVision)
    }

    @Test
    fun `null cache stays null`() {
        assertNull(QuoteRepository.effectiveResponseForDisplay(null, todayYmd = "2026-09-02"))
    }
}
