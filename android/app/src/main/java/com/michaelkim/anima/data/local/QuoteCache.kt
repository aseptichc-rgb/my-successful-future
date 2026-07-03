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
import androidx.datastore.preferences.core.emptyPreferences
import com.michaelkim.anima.data.CachedWidgetState
import com.michaelkim.anima.data.WidgetTodayResponse
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json
import java.io.IOException

private val Context.widgetDataStore by preferencesDataStore(name = "anima_widget_cache")

object QuoteCache {
    private val KEY_PAYLOAD: Preferences.Key<String> = stringPreferencesKey("today_payload")
    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

    fun observe(context: Context): Flow<CachedWidgetState?> =
        context.widgetDataStore.data
            // 디스크 손상/IO 오류로 DataStore 읽기가 던지면 위젯 렌더 전체가 죽는다 —
            // 빈 Preferences 로 폴백해 EmptyState 를 그리고 다음 refresh 가 다시 채우게 한다.
            .catch { e ->
                if (e is IOException) emit(emptyPreferences()) else throw e
            }
            .map { prefs ->
                val raw = prefs[KEY_PAYLOAD] ?: return@map null
                try {
                    json.decodeFromString(CachedWidgetState.serializer(), raw)
                } catch (_: Exception) {
                    // SerializationException 외에도 잘못된 캐시 형식(IllegalArgumentException 등)
                    // 전부를 "캐시 없음" 으로 취급 — 캐시는 언제든 재생성 가능한 데이터다.
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
