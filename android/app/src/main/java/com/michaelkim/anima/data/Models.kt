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

/**
 * "그 꿈을 사는 하루"(미래 일상 비전) 위젯 티저.
 * 위젯은 전체 비전을 다 담지 못해 제목 + 한 토막만 받아 "더 보고 싶게" 만든다.
 * 백엔드가 비전을 못 만들었으면 응답에서 통째로 생략되므로 nullable 로 둔다.
 */
@Serializable
data class WidgetFutureVision(
    val title: String,
    val teaser: String,
)

/**
 * 로컬 알림 설정 — 정책의 단일 소스는 웹(lib/notificationPolicy.ts)이고, 이 클래스는
 * `/api/widget/today` 응답으로 실려 온 값을 담아 WorkScheduler 에 전달만 한다.
 * 기본값(전부 켜짐, 08/21시)은 옛 서버 응답/캐시와의 호환이자 기존 동작 보존.
 */
@Serializable
data class WidgetNotificationPrefs(
    val morningEnabled: Boolean = true,
    val morningHour: Int = 8,
    val eveningEnabled: Boolean = true,
    val eveningHour: Int = 21,
    val weeklyReviewEnabled: Boolean = true,
    /**
     * 미완 과업 넛지 — 오늘 할 일을 다 해서 저녁 리마인더가 침묵하는 날의 빈 슬롯만 쓴다.
     * 발송 총량은 늘지 않는다(하루 최대 2건 유지).
     */
    val pendingTaskEnabled: Boolean = true,
)

/**
 * 서버가 **사용자 언어로 완성해 내려준** 알림 한 건의 문구.
 *
 * 왜 서버가 조립하나: 이 앱의 res 는 `values/` 하나뿐이라(values-en 등 없음) 네이티브가
 * 스스로 로컬라이즈하지 못한다. 게다가 본문에 그날의 명언·미완 과업 진행도처럼 서버만
 * 아는 값이 들어간다. 조립 정의는 웹 lib/notificationContent.ts.
 *
 * 응답에 없으면(옛 서버/조립 실패) null → Worker 가 strings.xml 정적 문구로 폴백한다.
 */
@Serializable
data class WidgetNotificationCopy(
    val title: String,
    val body: String,
    /** 펼쳤을 때 보여줄 전문(BigTextStyle). 제목이 트렁케이트된 경우에만 실려 온다. */
    val fullText: String? = null,
    /**
     * 탭 시 열 화면 — MainActivity.EXTRA_OPEN_TARGET 에 그대로 실리는 키
     * (웹 types/index.ts 의 NotificationTapTarget 과 문자열까지 일치).
     * 기본값은 MainActivity.OPEN_TARGET_HOME 과 같은 "home" 이지만 상수를 참조하지 않는다 —
     * data 레이어가 Activity 를 import 하면 의존 방향이 뒤집힌다. 값이 갈리지 않도록
     * MainActivity.resolveOpenPath 가 알 수 없는 키를 홈으로 폴백한다.
     */
    val target: String = "home",
)

/**
 * 오늘 발송 후보 알림 3종의 완성 문구 + 침묵 슬롯 대체분.
 * pendingTask 가 null 이면 밀린 과업이 없거나 오늘이 넛지 허용일이 아니다 — 현행대로 침묵.
 */
@Serializable
data class WidgetNotificationContent(
    val morning: WidgetNotificationCopy? = null,
    val evening: WidgetNotificationCopy? = null,
    val weekly: WidgetNotificationCopy? = null,
    val pendingTask: WidgetNotificationCopy? = null,
)

@Serializable
data class WidgetTodayResponse(
    val generatedAt: String,
    val ymd: String,
    val currentSlotIndex: Int = 0,
    val slots: List<WidgetSlot>,
    val nextRefreshAt: String,
    val todayProgress: WidgetTodayProgress = WidgetTodayProgress(),
    /**
     * 다짐 따라쓰기 연속 일수. 신규 필드라 옛 캐시/옛 서버 응답엔 없을 수 있어 0 기본값.
     * 출처: `users/{uid}.affirmationStreak.count` (lib/affirmationCheckin.ts).
     */
    val streakCount: Int = 0,
    /**
     * "성공한 나에게 한 발 더" 다짐 본문 목록. 신규 필드라 옛 캐시/옛 서버 응답엔
     * 없을 수 있어 빈 리스트 기본값. 출처: `users/{uid}.successAffirmations`.
     */
    val affirmations: List<String> = emptyList(),
    /**
     * "그 꿈을 사는 하루" 비전 티저. 비전 미생성/옛 응답이면 null → 위젯이 섹션을 자연 생략.
     */
    val futureVision: WidgetFutureVision? = null,
    /**
     * "이번 달 목표" 진척을 위젯 한 줄 카운트("n / N")로 줄여 보여주기 위한 값.
     * 옛 캐시/옛 서버 응답엔 없을 수 있어 0 기본값(섹션 측에서 total 0 이면 생략).
     */
    val goalsAchievedCount: Int = 0,
    val goalsTotalCount: Int = 0,
    /**
     * 알림 설정. 옛 캐시/옛 서버 응답이면 null → 리마인더는 기본값으로 동작.
     * QuoteRepository 가 응답 저장 시 NotificationPrefsStore 에 동기화하고 재예약한다.
     */
    val notificationPrefs: WidgetNotificationPrefs? = null,
    /**
     * 사용자 언어로 조립된 알림 문구. 옛 캐시/옛 서버 응답이면 null →
     * Worker 가 strings.xml 한국어 문구로 폴백한다(알림이 끊기지는 않는다).
     */
    val notificationContent: WidgetNotificationContent? = null,
)

/** DataStore 캐시 직렬화용 — 마지막 응답 + 디스크 기록 시각. */
@Serializable
data class CachedWidgetState(
    val response: WidgetTodayResponse,
    val cachedAtEpochMs: Long,
)
