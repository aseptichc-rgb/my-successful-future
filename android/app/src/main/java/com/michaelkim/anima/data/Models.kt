/**
 * `/api/widget/today` 응답 데이터 모델.
 * Next.js 백엔드의 `types/index.ts` 와 1:1 대응 — 여기서 필드를 바꾸면 백엔드도 함께 갱신할 것.
 */
package com.michaelkim.anima.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonClassDiscriminator
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

@Serializable
data class MotivationGradient(
    val from: String,
    val to: String,
    val angle: Int,
    val tone: String, // "dark" | "light"
)

/**
 * 백엔드의 WidgetSlot 합타입을 안전하게 풀기 위한 Kotlin 표현.
 * kotlinx.serialization 의 sealed class + JsonClassDiscriminator 를 쓰면 가장 깔끔하지만,
 * 백엔드는 "kind" 라는 평탄한 필드를 쓰므로 OptIn 으로 정합.
 */
@OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)
@Serializable
@JsonClassDiscriminator("kind")
sealed class WidgetSlot {
    abstract val text: String
    abstract val gradient: MotivationGradient

    @Serializable
    @SerialName("motivation")
    data class Motivation(
        override val text: String,
        val author: String,
        val goalsSnapshot: List<String> = emptyList(),
        val originalText: String? = null,
        val originalLang: String? = null,
        override val gradient: MotivationGradient,
    ) : WidgetSlot()

    @Serializable
    @SerialName("famous")
    data class Famous(
        override val text: String,
        val author: String? = null,
        val category: String,
        val originalText: String? = null,
        val originalLang: String? = null,
        override val gradient: MotivationGradient,
    ) : WidgetSlot()
}

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
    val currentSlotIndex: Int,
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

internal fun JsonObject.stringOrNull(key: String): String? =
    (this[key] as? JsonElement)?.jsonPrimitive?.contentOrNull
