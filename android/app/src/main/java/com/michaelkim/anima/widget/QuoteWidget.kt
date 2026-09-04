/**
 * 홈/잠금화면 위젯.
 *
 * Glance 가 RemoteViews 로 컴파일되므로 복잡한 레이아웃·이미지·애니메이션 사용 금지.
 * 데이터는 QuoteCache 에서 즉시 읽고, "비어있을 때 어떻게 보일지" 는 WidgetUi 가 책임.
 */
package com.michaelkim.anima.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.widget.RemoteViews
import androidx.glance.GlanceId
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.provideContent
import com.michaelkim.anima.R
import com.michaelkim.anima.data.QuoteRepository
import com.michaelkim.anima.data.auth.AuthRepository
import com.michaelkim.anima.util.CrashReporter
import com.michaelkim.anima.work.WorkScheduler
import kotlinx.coroutines.withTimeoutOrNull

class QuoteWidget : GlanceAppWidget() {

    // Responsive 는 미리 정의한 변형 중 하나를 호스트가 고르는데, 큰 화면에서도 320dp
    // 변형이 안 골라지는 경우가 있어 "나의 목표" 블록이 트리거되지 않았다.
    // Exact 모드로 바꿔 위젯이 차지한 실제 dp 를 그대로 받게 한다 — WidgetUi 의
    // EXTRA_TALL_THRESHOLD_DP(280dp) 임계치가 실제 사이즈로 평가된다.
    // 비용: 사이즈가 바뀔 때마다 provideGlance 재호출되지만 위젯 리사이즈 빈도가 낮아 부담 없음.
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        // 캐시 읽기 실패(디스크 손상 등)가 위젯 렌더 전체를 죽이면 안 된다 — null 로 폴백해
        // EmptyState 를 그리고, 자가 복구/Worker 경로가 다시 채우게 한다.
        var cached = try {
            QuoteRepository.getCached(context)
        } catch (e: Exception) {
            CrashReporter.record(TAG, "위젯 캐시 읽기 실패 — EmptyState 폴백", e)
            null
        }

        // ── 자가 복구(self-heal) ────────────────────────────────────────────
        // 캐시가 비어 있는데 네이티브 로그인 상태라면, 워커/웹 브릿지가 따라잡기를 기다리지
        // 않고 이 자리에서 직접 한 번 받아온다. provideGlance 는 위젯이 그려질 때마다(추가·리사이즈·
        // 호스트 갱신) 호출되므로, 로그인만 돼 있으면 다음 redraw 에서 자연히 채워진다.
        //
        // 이것이 "처음 로그인 후에도 위젯이 계속 '로그인 후 표시됩니다' 에 갇히던" 회귀의 근본 차단:
        // 기존엔 위젯이 캐시를 읽기만 해, 워커 인증 타이밍이 어긋나면 EmptyState 가 영영 굳었다.
        // 미로그인 시엔 네트워크를 건드리지 않고 곧장 EmptyState(연동 CTA) 로 떨어진다.
        if (cached == null && AuthRepository.isSignedIn) {
            val healed = withTimeoutOrNull(SELF_HEAL_TIMEOUT_MS) {
                try {
                    QuoteRepository.refreshWithEntitlementRecovery(context)
                    true
                } catch (_: Exception) {
                    // 네트워크/서버/인증 만료 — 아래에서 워커 백오프 재시도에 위임.
                    false
                }
            }
            if (healed == true) {
                cached = QuoteRepository.getCached(context)
            } else {
                // 동기 시도 실패/타임아웃 — 백오프 재시도를 워커에 위임(REPLACE 정책이라 중복 없음).
                try {
                    WorkScheduler.scheduleOneTimeRefresh(context)
                } catch (_: Exception) {
                    // enqueue 실패는 다음 정주기 워커가 봉합.
                }
            }
        } else if (AuthRepository.isSignedIn && QuoteRepository.isStale(cached)) {
            // ── 묵은 캐시 따라잡기 ──────────────────────────────────────────
            // 그릴 것은 있지만 낡았다(정주기 Worker 를 Doze/오프라인으로 건너뛰었거나,
            // 자정 Worker 가 못 돌아 ymd 가 어제에 멈춰 있다). 홈(/home)은 Firestore 실시간
            // 구독이라 늘 최신이니, 이 상태가 곧 "위젯 명언 ≠ 앱 명언" 이다. 아래
            // effectiveResponseForDisplay 가 upcoming 미리보기로 표시는 메워 주지만
            // 그날의 정식 카드로 맞추려면 결국 네트워크 갱신이 필요하다.
            //
            // 위 자가 복구와 달리 **동기로 기다리지 않는다** — 보여줄 캐시가 이미 있으니
            // redraw 를 최대 4초 붙잡을 이유가 없다. Worker 에 맡기고 이번 프레임은 캐시를
            // 그대로 그린 뒤, 갱신이 끝나면 Worker 의 updateAll 이 다음 프레임을 새로 그린다.
            try {
                WorkScheduler.scheduleOneTimeRefresh(context)
            } catch (e: Exception) {
                // enqueue 실패해도 화면은 캐시로 정상 렌더 — 다음 정주기 Worker 가 봉합.
                CrashReporter.record(TAG, "묵은 캐시 따라잡기 enqueue 실패", e)
            }
        }

        // 날짜가 지난 캐시는 upcoming 미리보기로 "오늘 명언" 을 보정한다 — 자정에 오프라인이거나
        // 워커가 밀려도 위젯이 어제 명언에 고착되지 않는다. refresh 성공 시 정식 카드가 자연 대체.
        val response = QuoteRepository.effectiveResponseForDisplay(cached?.response)
        val slot = response?.slots?.firstOrNull()
        val progress = response?.todayProgress
        // 위젯이 "지금 그리고 있는" 카드가 속한 날짜(ymd). 탭 시 이 값을 /home 으로
        // 넘겨, 웹이 기기 시계로 다시 계산하지 않고 위젯과 같은 문서를 읽게 한다.
        val ymd = response?.ymd
        // 다짐 streak — 옛 캐시는 0 으로 기본값 처리되어 자연스레 숨겨진다.
        val streak = response?.streakCount ?: 0
        // "성공한 나에게 한 발 더" 다짐 본문 — 옛 캐시엔 없어 빈 리스트로 폴백된다.
        val affirmations = response?.affirmations ?: emptyList()
        // "그 꿈을 사는 하루" 비전 티저 — 옛 캐시/미생성이면 null 로 폴백돼 섹션이 자연 생략된다.
        val futureVision = response?.futureVision
        // "이번 달 목표" 한 줄 카운트용 — 옛 캐시엔 없어 0 폴백(total 0 이면 섹션 생략).
        val goalsAchieved = response?.goalsAchievedCount ?: 0
        val goalsTotal = response?.goalsTotalCount ?: 0
        // 목표 본문 — 옛 캐시엔 없어 빈 리스트로 폴백되고, 그때 위젯은 카운트 한 줄만 그린다.
        val goals = response?.goals ?: emptyList()
        // EmptyState 가 "로그인 안내" 와 "불러오는 중" 을 구분하도록 인증 상태를 함께 넘긴다.
        // (로그인했는데도 "로그인 후 표시됩니다" 라고 거짓 안내하던 UX 버그 제거.)
        val signedIn = AuthRepository.isSignedIn
        provideContent {
            WidgetContent(
                slot, progress, ymd, streak, affirmations,
                futureVision, goalsAchieved, goalsTotal, goals, signedIn,
            )
        }
    }

    /**
     * Glance 컴포지션/RemoteViews 변환 실패가 프로세스를 죽이지 않도록 하는 최후 방어선.
     * 기본 구현은 예외를 다시 던져 앱을 종료시킬 수 있다 — 여기서는 Crashlytics 비치명 보고 후
     * 로딩 레이아웃으로 폴백해, 사용자에겐 "위젯이 잠시 로딩 상태"로만 보이게 한다.
     */
    override fun onCompositionError(
        context: Context,
        glanceId: GlanceId,
        appWidgetId: Int,
        throwable: Throwable,
    ) {
        CrashReporter.record(TAG, "위젯 컴포지션 실패 — 로딩 레이아웃 폴백", throwable)
        try {
            val fallback = RemoteViews(context.packageName, R.layout.widget_loading)
            AppWidgetManager.getInstance(context).updateAppWidget(appWidgetId, fallback)
        } catch (e: Exception) {
            // 폴백 렌더마저 실패 — 다음 updateAll 사이클에 위임. 크래시보다 낫다.
            CrashReporter.record(TAG, "위젯 폴백 렌더 실패", e)
        }
    }

    private companion object {
        const val TAG = "QuoteWidget"
        // 자가 복구 동기 fetch 대기 한도. 위젯 redraw 중 백그라운드 코루틴에서 실행되므로
        // 사용자 메인 스레드를 막지 않는다. 정상 캐시 히트(Firestore 1회 read)는 200-500ms,
        // 슬로 네트워크 여유까지 고려해 4초. 초과 시 워커 폴백이 인계.
        const val SELF_HEAL_TIMEOUT_MS = 4_000L
    }
}
