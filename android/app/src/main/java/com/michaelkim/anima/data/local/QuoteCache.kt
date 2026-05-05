/**
 * 위젯/메인 앱이 공유하는 단일 캐시.
 *
 * - 최신 `WidgetTodayResponse` 와 디스크 기록 시각을 DataStore Preferences 에 JSON 으로 저장.
 * - 위젯 콜드부트 시 즉시 보여줄 데이터 — 네트워크 대기 없이 placeholder 대신 이전 카드를 노출.
 *
 * 보안: ID 토큰은 여기 저장하지 않는다 (Firebase SDK 가 영속화 책임).
 */
package com.michaelkim.anima.data.local

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.michaelkim.anima.data.CachedWidgetState
import com.michaelkim.anima.data.WidgetTodayResponse
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

private val Context.widgetDataStore by preferencesDataStore(name = "anima_widget_cache")

object QuoteCache {
    private val KEY_PAYLOAD: Preferences.Key<String> = stringPreferencesKey("today_payload")
    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

    fun observe(context: Context): Flow<CachedWidgetState?> =
        context.widgetDataStore.data.map { prefs ->
            val raw = prefs[KEY_PAYLOAD] ?: return@map null
            try {
                json.decodeFromString(CachedWidgetState.serializer(), raw)
            } catch (_: SerializationException) {
                null
            }
        }

    suspend fun read(context: Context): CachedWidgetState? = observe(context).first()

    suspend fun save(context: Context, response: WidgetTodayResponse) {
        val state = CachedWidgetState(
            response = response,
            cachedAtEpochMs = System.currentTimeMillis(),
        )
        val encoded = json.encodeToString(CachedWidgetState.serializer(), state)
        context.widgetDataStore.edit { prefs ->
            prefs[KEY_PAYLOAD] = encoded
        }
    }

    suspend fun clear(context: Context) {
        context.widgetDataStore.edit { it.clear() }
    }
}
