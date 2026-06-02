/**
 * 비치명적 오류 보고 단일 통로.
 *
 * - 기존처럼 Logcat 에 남기고(Log.w), 더해 Crashlytics 에 비치명적 예외로 보고한다.
 * - PII 부착 금지: message 에 이메일/토큰/사용자 본문(다짐·잘한 일·"10년 후의 나")을 넣지 말 것.
 *   화면·작업 식별용 짧은 메시지만 받는다. 모든 보고가 이 한 곳을 지나므로 마스킹을 단일 통제.
 * - 보고 경로 자체가 절대 던지지 않도록 가드 — 오류 보고가 앱을 죽이면 안 된다.
 * - 디버그 빌드에서는 수집이 꺼져 있어(AnimaApplication 에서 설정) recordException 이 무해하게 no-op.
 */
package com.michaelkim.anima.util

import android.util.Log
import com.google.firebase.crashlytics.FirebaseCrashlytics

object CrashReporter {
    fun record(tag: String, message: String, throwable: Throwable) {
        Log.w(tag, message, throwable)
        try {
            FirebaseCrashlytics.getInstance().apply {
                log("[$tag] $message")
                recordException(throwable)
            }
        } catch (_: Throwable) {
            // Crashlytics 미초기화/수집 비활성 등 — 보고 실패가 앱 흐름을 깨면 안 되므로 무시.
        }
    }
}
