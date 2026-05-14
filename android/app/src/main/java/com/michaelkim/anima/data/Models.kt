/**
 * `/api/widget/today` 응답 데이터 모델.
 * Next.js 백엔드의 `types/index.ts` 와 1:1 대응 — 여기서 필드를 바꾸면 백엔드도 함께 갱신할 것.
 */
package com.michaelkim.anima.data

import kotlinx.serialization.Serializable

@Serializable
data class MotivationGradient(
    val from: String,
    val to: String,
    val angle: Int,
    val tone: String, // "dark" | "light"
)

/**
 * 위젯에 보이는 한 장의 카드. 백엔드가 `kind: "motivation"` 을 보내지만 단일 형태이므로
 * 디스크리미네이터 분기 없이 평탄한 data class 로 디코딩한다.
 * `Json { ignoreUnknownKeys = true }` 라 `kind` 필드는 안전히 무시된다.
 */
@Serializable
data class WidgetSlot(
    val text: String,
    val author: String,
    val originalText: String? = null,
    val originalLang: String? = null,
    val goalsSnapshot: List<String> = emptyList(),
    val gradient: MotivationGradient,
)

/**
 * 위젯 하단 "오늘 3가지 이행 여부" 요약.
 * 백엔드 미발급(과거 캐시) 경우 explicitNulls=false 로 null 이 들어와도 폴백 가능하도록
 * 전부 기본값 false 로 둔다.
 */
@Serializable
data class WidgetTodayProgress(
    val affirmation: Boolean = false,
    val actions: Boolean = false,
    val wins: Boolean = false,
)

@Serializable
data class WidgetTodayResponse(
    val generatedAt: String,
    val ymd: String,
    val currentSlotIndex: Int = 0,
    val slots: List<WidgetSlot>,
    val nextRefreshAt: String,
    val todayProgress: WidgetTodayProgress = WidgetTodayProgress(),
)

/** DataStore 캐시 직렬화용 — 마지막 응답 + 디스크 기록 시각. */
@Serializable
data class CachedWidgetState(
    val response: WidgetTodayResponse,
    val cachedAtEpochMs: Long,
)
