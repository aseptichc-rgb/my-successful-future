/**
 * 온보딩 완료 여부 로컬 캐시.
 *
 * 진실은 서버 (Firestore users/{uid}.onboardedAt). 이 캐시는 부팅 직후 네트워크가
 * 도착하기 전 "마지막으로 본 상태" 를 즉시 보여주기 위한 용도.
 *
 * 저장 형태: uid → "true"/"false". 다른 uid 가 들어오면 stale 로 간주 (= UNKNOWN).
 */
package com.michaelkim.anima.data.auth

import android.content.Context

internal enum class OnboardingStatus {
    /** 서버 응답 또는 캐시가 없음 — 결정 보류 (로딩 화면). */
    UNKNOWN,

    /** Firestore.onboardedAt 이 있는 사용자 — 메인 홈으로. */
    DONE,

    /** Firestore.onboardedAt 이 없는 사용자 — 게이트로. */
    PENDING,
}

internal object OnboardingPrefs {
    private const val PREFS = "anima_onboarding"
    private const val KEY_UID = "cached_uid"
    private const val KEY_DONE = "cached_done"

    /**
     * 마지막으로 본 서버 결과를 uid 기준으로 캐싱. 다른 uid 가 다음에 들어오면 무시된다.
     */
    fun cache(context: Context, uid: String, done: Boolean) {
        try {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_UID, uid)
                .putBoolean(KEY_DONE, done)
                .apply()
        } catch (_: Exception) {
        }
    }

    /**
     * 같은 uid 의 캐시가 있으면 그 값을, 없으면 UNKNOWN 을 돌려준다.
     */
    fun read(context: Context, uid: String): OnboardingStatus {
        return try {
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val cachedUid = prefs.getString(KEY_UID, null) ?: return OnboardingStatus.UNKNOWN
            if (cachedUid != uid) return OnboardingStatus.UNKNOWN
            if (prefs.getBoolean(KEY_DONE, false)) OnboardingStatus.DONE else OnboardingStatus.PENDING
        } catch (_: Exception) {
            OnboardingStatus.UNKNOWN
        }
    }

    fun clear(context: Context) {
        try {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .clear()
                .apply()
        } catch (_: Exception) {
        }
    }
}
