import { Timestamp } from "firebase/firestore";

/**
 * 앱 UI 언어. 미설정 시 클라이언트는 "ko" 로 폴백한다.
 * 서버(Gemini 프롬프트 / 명언 시드 풀) 도 같은 코드로 분기한다.
 */
export type UserLanguage = "ko" | "en" | "es" | "zh";

// ── 사용자 ────────────────────────────────────────────
export interface User {
  uid: string;
  displayName: string;
  email: string;
  /** "10년 후의 나의 모습" 자유 텍스트 — 동기부여 카드 컨텍스트로 사용. */
  futurePersona?: string;
  futurePersonaUpdatedAt?: Timestamp;
  /**
   * 온보딩 몰입형 7문항(일상/일·위치/자산/가족/성취/존경/성장)의 구조화 답변.
   * 저장 시 composeFuturePersona() 로 합성한 문자열을 futurePersona 에도 함께 기록해
   * 기존 AI 소비처(카드/비전/정체성/작가추천)는 읽기 경로 수정 없이 그대로 동작한다.
   */
  futureSelfAnswers?: FutureSelfAnswers;
  futureSelfAnswersUpdatedAt?: Timestamp;
  /** 답변을 종합해 생성한 "10년 후 나의 모습" 초상 — 서버(Admin)에서만 생성·갱신. */
  futureSelfPortrait?: FutureSelfPortrait;
  onboardedAt?: Timestamp;
  /**
   * UI 와 매일 카드 출력 언어. 온보딩 1단계에서 선택, 설정에서 변경 가능.
   * 미설정(레거시 사용자) 이면 클라/서버 모두 "ko" 로 처리.
   */
  language?: UserLanguage;
  languageUpdatedAt?: Timestamp;
  /** 사용자가 직접 적은 목표 (최대 10개). 홈 대시보드에서 편집. */
  goals?: string[];
  goalsUpdatedAt?: Timestamp;
  /** 오늘의 명언 큐레이션 설정. */
  quotePreference?: QuotePreference;
  quotePreferenceUpdatedAt?: Timestamp;
  /** 로컬 알림 설정 — 미설정이면 lib/notificationPolicy 기본값(전부 켜짐, 08/21시). */
  notificationPrefs?: NotificationPrefs;
  notificationPrefsUpdatedAt?: Timestamp;
  /** 미션 응답이 강화하는 정체성 라벨 풀. futurePersona 변경 시 서버에서 재생성. */
  identities?: UserIdentities;
  /**
   * "성공한 나의 모습" 다짐 (최대 10개, 각 60자).
   * 매일 카드 미션 영역에 placeholder 로 그대로 노출되고, 사용자가 글자 단위로 일치하게
   * 다시 적으면 affirmationStreak 가 +1 된다.
   */
  successAffirmations?: string[];
  successAffirmationsUpdatedAt?: Timestamp;
  /** 다짐 따라쓰기 연속일 진행도. lastYmd 가 어제(KST)면 +1, 아니면 1로 리셋. */
  affirmationStreak?: AffirmationStreak;
  /**
   * 목표 달성 스트릭(하루에 목표 1개 이상 달성한 날의 연속/누적). 체크인 트랜잭션이
   * 어제 dailyEntry 를 정산해 갱신 — 서버 전용 필드(firestore.rules 에서 클라 write 차단).
   */
  goalStreak?: GoalStreak;
  /**
   * 성장 단계의 유일한 원천 — 정체성 증거 표 누적 총합. 체크인 트랜잭션이 갱신하고
   * 최초 1회 identityProgress 합계로 백필한다 — 서버 전용 필드(클라 write 차단).
   */
  growth?: UserGrowth;
  /**
   * "오늘 잘한 일" 기록 보존 표식 — 해금 게이트(lib/winsUnlock) 도입 전부터 쓰던 계정에
   * 홈이 한 번만 찍는다. 값(시각) 자체는 쓰지 않고 "존재 여부"만 판정에 쓴다.
   * 스트릭으로 연 사용자에겐 필요 없다(bestCount 는 줄지 않아 판정이 스스로 유지된다).
   */
  winsUnlockedAt?: Timestamp;
  /**
   * 무료 체험 종료 시점 (Firestore Timestamp 미러).
   * 실제 게이트 판정은 Firebase custom claim 의 trialEndsAt(ms) 으로 수행하고,
   * 이 필드는 UI 의 D-day 카운트다운/안내 문구에 사용한다.
   */
  trialEndsAt?: Timestamp;
  createdAt: Timestamp;
}

/**
 * 스트릭 카운터의 공통 최소 계약 — 목표 슬롯 해금(lib/goalSlots.bestStreakCount)이
 * 다짐 전사·목표 달성 두 축을 같은 규칙으로 읽는 형태. 두 스트릭 타입이 이를 extends
 * 하므로, 스키마 필드가 리네임되면 여기서 컴파일 에러로 잡힌다(느슨한 구조적 타입을
 * 소비자 쪽에 두면 리네임이 조용히 0 폴백으로 새는 것을 막는 장치).
 */
export interface StreakCounter {
  count?: number;
  bestCount?: number;
}

/**
 * "성공한 나의 모습" 다짐 따라쓰기 연속일 카운터. 서버 트랜잭션으로만 갱신.
 * 신규 필드는 전부 optional — 레거시 문서(count/lastYmd 만 존재)와 완전 호환되며,
 * 읽기 경로는 `bestCount ?? count`, `freezesLeft ?? FREEZES_PER_MONTH` 폴백을 쓴다.
 */
export interface AffirmationStreak extends StreakCounter {
  count: number;
  /** 마지막으로 정상 체크인이 일어난 날짜 (KST YYYY-MM-DD). */
  lastYmd: string;
  updatedAt?: Timestamp;
  /** 역대 최고 연속일 — 스트릭이 끊겨도 보존된다. 누락(레거시) 시 count 로 폴백해 읽는다. */
  bestCount?: number;
  /**
   * 이번 달 남은 스트릭 프리즈(결석을 다리 놓아주는 얼음). freezeMonth 가
   * 이번 달(KST YYYY-MM)이 아니면 월초 리필(FREEZES_PER_MONTH)로 간주 — 지연 리필.
   */
  freezesLeft?: number;
  freezeMonth?: string;
  /** 마지막으로 스트릭이 실제로 끊긴(1로 리셋된) 체크인 날짜 — 재약속 카드 문구용. */
  lastBrokenYmd?: string;
  /** 끊기기 직전의 연속일 — "n일을 이어온 기록" 문구용. */
  lastBrokenCount?: number;
}

/**
 * 목표 달성 스트릭 카운터. 서버(체크인 트랜잭션)로만 갱신 — lib/goalStreak.ts 가 계산.
 * 판정 대상은 언제나 "어제"의 dailyEntry.achievedGoals 라 하루 지연으로 반영된다.
 * 프리즈 없음 — 슬롯 해금(lib/goalSlots)은 bestCount 만 보므로 끊김이 칸을 뺏지 않는다.
 */
export interface GoalStreak extends StreakCounter {
  /** 현재 연속일. 달성 없는 날이 정산되면 0으로 끊긴다. */
  count: number;
  /** 마지막으로 달성이 정산된 날짜 (KST YYYY-MM-DD). */
  lastYmd: string;
  /** 역대 최고 연속일 — 슬롯 해금의 유일한 판정값. 누락(레거시) 시 count 로 폴백해 읽는다. */
  bestCount?: number;
  /** 목표를 1개 이상 달성한 날의 누적 수 (연속과 무관 — /progress "목표 지킨 날" 문구용). */
  totalDays?: number;
  updatedAt?: Timestamp;
}

/**
 * 성장 단계의 원천 카운터. 서버(체크인 트랜잭션)로만 갱신.
 * votes = 정체성 증거 표(checkin/deep/goal/win) 누적 총합 — lib/growthStage.ts 가
 * 단계(씨앗→…→숲)로 환산한다. 새 화폐가 아니라 이미 돌던 표의 승격이다.
 */
export interface UserGrowth {
  votes: number;
  /** 최초 1회 identityProgress 합계 백필이 끝난 시각 — 있으면 다시 백필하지 않는다. */
  backfilledAt?: Timestamp;
}

/**
 * 체크인 깊이. focus = 오늘 회전으로 뽑힌 1줄만 새김(하루 필수 최소치),
 * full = 저장된 다짐을 전량 새김(선택 — 정체성 증거 보너스 1표).
 *
 * 부담을 줄이려 focus 를 기본 경로로 내렸다: 하루의 앵커 행동이 가장 비싸면
 * 실행 빈도가 떨어진다(Fogg B=MAP — Ability 를 낮춰야 행동이 유지된다).
 * 전량 전사는 삭제하지 않고 보너스가 붙는 선택지로 남긴다.
 *
 * 레거시 affirmationLogs 문서엔 이 필드가 없다 — 당시엔 전량 전사만 가능했으므로
 * 읽는 쪽에서 `depth ?? "full"` 로 폴백하는 것이 사실에 부합한다.
 */
export type AffirmationCheckinDepth = "focus" | "full";

/**
 * "10년 후 나의 모습" 몰입형 질문의 차원별 답변. 모든 필드 선택 —
 * 사용자는 원하는 문항만 답하고 넘어갈 수 있다. 각 답변은 FUTURE_SELF_FIELD_MAX(200자)로 클램프.
 */
export interface FutureSelfAnswers {
  /** 진정 이루고 싶은 꿈 — 온보딩이 묻는 단 하나의 문항. */
  dream?: string;
  /** 평범한 하루의 흐름. */
  daily?: string;
  /** 하는 일과 사람들 사이에서의 위치. */
  work?: string;
  /** 자산·경제적 형편. */
  wealth?: string;
  /** 가족과 함께하는 삶. */
  family?: string;
  /** 그때까지 이루어낸 것들. */
  achievements?: string;
  /** 사람들이 보내는 존경·신뢰. */
  respect?: string;
  /** 몸·마음 상태와 계속되는 성장. */
  growth?: string;
}

/**
 * 답변을 종합해 Gemini 가 그려낸 "10년 후 나의 모습" 초상.
 * 미래 비전(1인칭·매일 회전 '어느 하루')과 달리 2인칭·고정 '정체성 앵커'로,
 * 유저 문서에 단일 객체로 저장되고 답변이 바뀔 때(sourceHash 불일치)만 재생성된다.
 */
export interface FutureSelfPortrait {
  /** 초상을 요약하는 짧은 제목. */
  title: string;
  /** "당신은 …" 2인칭 현재형 본문(4~6문장). */
  portrait: string;
  /** 구체적 증거 하이라이트 (최대 3줄, 없을 수 있음). */
  highlights?: string[];
  /** language+persona+goals 변경 감지 해시 — 다르면 ensure 가 자동 재생성. */
  sourceHash: string;
  generatedAt: Timestamp;
}

/** 정체성 라벨 풀 — 미션 응답 1건이 라벨 1개의 누적 증거가 된다. */
export interface UserIdentities {
  /** 예: ["성장하는 사람", "꾸준한 사람", "용기 있는 사람"] (3~5개) */
  labels: string[];
  generatedAt: Timestamp;
  /** futurePersona 변경 감지용 해시 — 값이 다르면 라벨을 다시 뽑는다. */
  sourcePersonaHash: string;
}

/**
 * 오늘의 명언 큐레이션 사용자 설정.
 * - pinnedAuthor 미설정 또는 pinnedDaysPerWeek<=0 이면 "주간 자동 회전" 만 작동.
 */
export interface QuotePreference {
  pinnedAuthor?: string;
  pinnedDaysPerWeek?: number;
}

/**
 * 로컬 알림(리마인더) 사용자 설정 — 정책·기본값·정규화는 lib/notificationPolicy.ts 가
 * 단일 소스로 소유하고, Android WorkManager / iOS UNUserNotificationCenter 는 실행만 한다.
 * 미설정(레거시 사용자)이면 전부 켜짐 + 08:00/21:00 — 기존 Android 동작과 동일.
 */
export interface NotificationPrefs {
  /** 아침 다짐 리마인더 (매일). */
  morningEnabled: boolean;
  /** 아침 알림 시각 (0~23, 로컬 타임존). */
  morningHour: number;
  /** 저녁 기록 리마인더 — 오늘 목표를 이미 체크했으면 침묵(조건부). */
  eveningEnabled: boolean;
  /** 저녁 알림 시각 (0~23, 로컬 타임존). */
  eveningHour: number;
  /** 일요일 주간 회고 알림 (저녁 시각에 기록 리마인더 대신 도착). */
  weeklyReviewEnabled: boolean;
  /**
   * 미완 과업 넛지 — 오늘 할 일을 이미 다 해서 저녁 리마인더가 침묵하는 날,
   * 그 빈 슬롯에 "아직 채우지 않은 것" 하나를 대신 알린다(주 2회 상한).
   * 발송 총량은 늘지 않는다(하루 최대 2건 유지). 미설정(레거시)이면 켜짐.
   */
  pendingTaskEnabled: boolean;
}

// ── 홈 대시보드: 일일 체크리스트/회고 ───────────────
export interface DailyTodo {
  id: string;
  text: string;
  done: boolean;
}

export interface DailyEntry {
  ymd: string;
  todos: DailyTodo[];
  wins: string[];
  achievedGoals?: string[];
  /**
   * 저녁 모드에서 적는 "내일 첫 행동 1개" (Masicampo & Baumeister 2011 — 계획을 적으면
   * 미완료 목표의 인지 침입이 해소된다). 오늘 문서에 저장하고, 다음 날 아침 카드가
   * "어제의 내가 정한 첫 행동"으로 어제 문서에서 읽어간다.
   */
  tomorrowFirstAction?: string;
  updatedAt: Timestamp;
}

// ── 매일 바뀌는 동기부여 카드 ───────────────────────
export interface MotivationGradient {
  from: string;
  to: string;
  angle: number;
  tone: "dark" | "light";
}

export interface DailyMotivation {
  ymd: string;
  quote: string;
  author: string;
  source?: string;
  originalText?: string;
  originalLang?: string;
  goalsSnapshot: string[];
  futurePersonaSnapshot?: string;
  gradient: MotivationGradient;
  /** 능동 인출용 한 줄 미션. 카드 생성 시 함께 만들어진다. */
  mission?: MotivationMission;
  /** 사용자가 직접 적은 한 줄 응답 — 정체성 누적의 1차 증거. */
  response?: MotivationResponse;
  /**
   * 오늘 이 사용자에게 노출됐던 명언 텍스트 누적. "또 다른 한마디" 재생성 시
   * 같은 문구가 다시 잡히지 않도록 풀에서 제외하는 데 쓴다. 첫 카드의 quote 도 포함.
   */
  seenQuotes?: string[];
  /**
   * 카드 생성 시 풀에 남은 항목이 없어 누적 히스토리(`users/{uid}.seenQuoteTexts`) 를
   * 리셋한 경우 true. 운영 디버깅용 메타 — UI 는 사용하지 않는다.
   */
  historyReset?: boolean;
  createdAt: Timestamp;
}

/**
 * 카드와 함께 던져지는 한 줄 미션.
 * - prompt: "오늘 ~을 막을 가장 큰 방해물 1개를 적어보세요" 같은 능동 인출 질문.
 * - linkedGoal: goalsSnapshot 중 어느 항목에서 파생됐는지(설명용, 응답 분류엔 사용 안 함).
 * - identityTag: 응답이 강화할 정체성 라벨 — UserIdentities.labels 중 1개.
 */
export interface MotivationMission {
  prompt: string;
  linkedGoal?: string;
  identityTag: string;
}

export interface MotivationResponse {
  text: string;
  respondedAt: Timestamp;
  /** 미션 수정 횟수(첫 응답=0). identityProgress.count 는 첫 저장에만 +1. */
  edits?: number;
}

// ── 매일 바뀌는 "미래 일상" 비전 (꿈이 실현된 하루) ───
/**
 * 미래 일상 비전의 한 장면 — 하루의 한 순간.
 * - moment: 시간대 라벨 ("아침"/"정오"/"저녁" 등, 사용자 언어).
 * - text: 그 순간을 1인칭 현재형으로 묘사한 한 단락.
 */
export interface FutureVisionScene {
  moment: string;
  text: string;
}

/**
 * 사용자가 적은 futurePersona/goals 가 이미 실현된 "어느 하루"를 1인칭 현재형으로
 * 생생하게 그린 비전. `users/{uid}/futureVisions/{ymd}` 에 하루 1건 저장(동기부여 카드와 동일 컨벤션).
 * 서버(Admin SDK)에서만 생성·갱신하고, 클라이언트는 onSnapshot 으로 read 만 한다.
 */
export interface FutureVision {
  ymd: string;
  /** 접힌 카드에 보이는 호기심 한 줄(teaser) — 결정적 장면을 암시하되 결말은 감춘다. 없을 수 있음. */
  hook?: string;
  /** 그 하루를 요약하는 짧고 강렬한 한 줄. */
  title: string;
  /** 2~4개 시간대별 장면. */
  scenes: FutureVisionScene[];
  /** 하루를 닫는 1인칭 현재형 한 문장(없을 수 있음). */
  closing?: string;
  /** 생성 시점 futurePersona 스냅샷(본인 서브컬렉션 전용, 트렁케이트). */
  futurePersonaSnapshot?: string;
  goalsSnapshot: string[];
  /** 동기부여 카드와 동일한 그라데이션 타입(시드만 달라 색이 겹치지 않음). */
  gradient: MotivationGradient;
  createdAt: Timestamp;
  /**
   * 같은 날 "또 다른 하루 보기"로 직전에 생성된 비전 제목들(최근 N개, 본인 전용).
   * 다음 재생성 프롬프트에 "이건 피하라"로 주입해 이전 하루들과 확연히 다른 하루를 만든다.
   */
  recentTitles?: string[];
}

/**
 * 사용자별 정체성 라벨 누적 진행도. 라벨당 문서 1개.
 * - 문서 ID = identityTag(라벨 문자열, 한국어 그대로 사용 가능).
 * - count: 누적 응답 수. 카드 1장 = 최대 +1 (수정은 카운트 안 함).
 * - recentResponses: 최근 5개 응답 텍스트 (UI 슬라이딩 표시).
 */
export interface IdentityProgress {
  identityTag: string;
  count: number;
  /** 마지막 "미션 응답" 시각. 증거 적립만으로 생성된 문서엔 없을 수 있다(미션 전용 필드). */
  lastRespondedAt?: Timestamp;
  recentResponses: string[];
  /**
   * 증거 출처별 누적 카운트. mission 은 카드 응답(lib/missionResponse.ts),
   * checkin/goal/win 은 체크인 트랜잭션의 증거 적립(lib/identityEvidence.ts).
   * 레거시 문서엔 없을 수 있음 — UI 는 누락 시 해당 칩을 생략한다.
   */
  sourceCounts?: {
    mission?: number;
    checkin?: number;
    goal?: number;
    win?: number;
    deep?: number;
  };
  /** 마지막 증거 적립 시각 (mission 응답의 lastRespondedAt 과 별개). */
  lastEvidenceAt?: Timestamp;
}

// ── WOOP 실행설계 (if-then) ─────────────────────────
/**
 * WOOP(Wish-Outcome-Obstacle-Plan) 실행설계 — 목표 1개당 1개.
 * `users/{uid}/executionPlans/{planId}` 에 저장. 사용자가 직접 작성하는 산문 콘텐츠라
 * dailyEntries 와 동급으로 클라이언트 직접 write 를 허용한다(위조 가치 없음).
 * 실행의도(if-then)는 목표 달성 효과 d=0.65 (Gollwitzer & Sheeran 2006).
 */
export interface ExecutionPlan {
  /** 연결된 목표 텍스트 스냅샷(User.goals 항목). 목표가 지워져도 플랜은 남는다. */
  goal: string;
  /** WOOP-O: 가장 좋은 결과를 이룬 순간의 느낌 한 줄. */
  outcome: string;
  /** WOOP-O: 나를 막는 "내 안의" 장애물 한 줄 (외부 환경이 아닌 내면의 방해물). */
  obstacle: string;
  /** if [장애물 상황이 오면] */
  ifText: string;
  /** then [나는 이렇게 한다] */
  thenText: string;
  /** 이 목표 달성이 강화할 정체성 라벨 — User.identities.labels 중 1개 (생성 시 선택, 선택사항). */
  identityTag?: string;
  /** false 면 오늘의 플랜 회전/위젯 노출에서 제외. */
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ── 정체성 증거 장부 ─────────────────────────────────
/** 정체성 증거 1건 — 어떤 행동이 어떤 라벨에 투표했는지. */
export interface IdentityEvidenceEntry {
  identityTag: string;
  /**
   * checkin=오늘 다짐 체크인(1줄 이상), goal=어제 목표 달성, win=어제 잘한 일 기록,
   * deep=오늘 다짐을 전량 따라쓴 보너스(checkin 과 별개 카테고리라 하루 최대 1표).
   */
  source: "checkin" | "goal" | "win" | "deep";
  /** 표시용 짧은 근거 (예: 달성한 목표 텍스트, 잘한 일 첫 줄 — 트렁케이트). */
  detail?: string;
}

/**
 * `users/{uid}/identityEvidence/{ymd}` — 하루치 정체성 증거 장부 + 중복 적립 방지 마커.
 * 체크인 트랜잭션(lib/identityEvidence.ts)에서만 기록 — 클라이언트 write 차단(카운트 위조 방지).
 * reconciled: 이 날짜의 goal/win 증거가 (다음 날 체크인 시점에) 이미 정산됐는지.
 * ⚠️ 존재 여부만으로 정산 여부를 판단하면 안 됨 — 당일 체크인이 checkin 엔트리로
 * 문서를 먼저 만들 수 있으므로 반드시 reconciled 플래그로 가드한다.
 */
export interface IdentityEvidenceDay {
  ymd: string;
  entries: IdentityEvidenceEntry[];
  reconciled?: boolean;
  createdAt: Timestamp;
}

// ── 안드로이드 위젯: 큐레이션 명언 ──────────────────
export type FamousQuoteCategory =
  | "philosophy"
  | "entrepreneur"
  | "classic"
  | "leader"
  | "scientist"
  | "literature"
  /** 저자 없는 큐레이션 잠언 (lib/curatedQuotes) — 위인 어록과 함께 후보로 섞인다. */
  | "wisdom"
  | "personal";

export type FamousQuoteLang = "ko" | "en";

export interface FamousQuote {
  id: string;
  text: string;
  author?: string;
  category: FamousQuoteCategory;
  language: FamousQuoteLang;
  active: boolean;
  tags?: string[];
  /** 외국인 명언일 때 원어(원문). 한국 인물이면 비워둔다. */
  originalText?: string;
  /** ISO 코드 — "en","de","fr","ru","zh","la","grc","ja" 등. originalText 가 있을 때만 의미. */
  originalLang?: string;
  createdAt: unknown;
  updatedAt: unknown;
}

/**
 * 위젯에 보이는 한 장의 카드. 과거에는 motivation 1장 + famous 7장이 24h 슬롯으로 회전했으나,
 * 웹 /home 이 motivation 1장만 노출하므로 위젯도 동일하게 motivation 1장만 보여준다.
 * 응답 호환성을 위해 `kind` 필드는 유지 — 안드로이드 측 캐시가 단일 형태로 디코딩한다.
 */
export interface WidgetSlot {
  kind: "motivation";
  text: string;
  author: string;
  source?: string;
  originalText?: string;
  originalLang?: string;
  goalsSnapshot: string[];
  gradient: MotivationGradient;
}

/**
 * 위젯 하단에 보이는 "오늘 3가지 이행 여부" 요약.
 * - affirmation: `affirmationLogs/{ymd}` 존재 (다짐 따라쓰기 1회 완료)
 * - actions: 사용자 목표가 1개 이상이고 모두 `achievedGoals` 에 포함 (전부 체크)
 * - wins: 오늘 잘한 일 3칸이 모두 비어있지 않음 (3가지 다 작성)
 */
export interface WidgetTodayProgress {
  affirmation: boolean;
  actions: boolean;
  wins: boolean;
}

/**
 * 위젯에 띄우는 "그 꿈을 사는 하루"(미래 일상 비전) 티저.
 * 위젯은 공간 제약이 커 전체 비전(여러 장면 + closing)을 다 담지 못하므로,
 * "더 보고 싶게" 만드는 최소 발췌만 싣는다 — 제목 + 첫 장면 한 토막.
 * 출처: `users/{uid}/futureVisions/{ymd}` (lib/futureVision.ts ensureFutureVision).
 * 응답 호환성: 비전 미생성/실패 시 필드 자체를 생략 — 옛/신 클라이언트 모두 안전 폴백.
 */
export interface WidgetFutureVision {
  /** 그 하루를 요약하는 짧고 강렬한 한 줄(비전 title). */
  title: string;
  /** 첫 장면 본문을 위젯 폭에 맞춰 트렁케이트한 한 토막(맛보기). */
  teaser: string;
}

/**
 * 위젯에 띄우는 "오늘의 if-then" 실행설계 한 줄.
 * 출처: `users/{uid}/executionPlans` 중 active 플랜을 ymd 시드로 회전(lib/planRotation.ts —
 * 홈 DailyPlanCard 와 동일 순수 모듈이라 위젯·홈이 항상 같은 플랜을 본다).
 * 응답 호환성: 플랜 미설정/조회 실패 시 필드 자체를 생략 — 옛/신 클라이언트 모두 섹션 자연 생략.
 */
export interface WidgetExecutionPlan {
  /** 연결된 목표 텍스트. */
  goal: string;
  /** if [장애물 상황] */
  ifText: string;
  /** then [행동] */
  thenText: string;
}

/**
 * 알림을 탭했을 때 열 화면. 위젯/알림 등 외부 진입점이 공유하는 키로,
 * Android 는 MainActivity.EXTRA_OPEN_TARGET 으로, 웹/iOS 는 경로로 해석한다.
 * `settings-*` 는 설정의 `?sheet=` 딥링크(app/settings/page.tsx readSheetDeepLink)와 1:1 대응.
 */
export type NotificationTapTarget =
  | "home"
  | "wins"
  | "affirmations"
  | "settings-future-self"
  | "settings-affirmations"
  | "settings-goals";

/**
 * 알림 한 건의 완성된 문구. **서버가 사용자 언어로 조립해서 내려준다** —
 * Android 는 strings.xml 이 한국어 하드코딩이라 스스로 로컬라이즈하지 못하고,
 * iOS 는 사전 예약 시점에 문구가 이미 확정돼 있어야 하기 때문이다.
 */
export interface WidgetNotificationCopy {
  /** 알림 제목. 잠금화면에서 한 줄로 잘리므로 짧게 조립된다. */
  title: string;
  /** 알림 본문(축약형). */
  body: string;
  /**
   * 펼쳤을 때 보여줄 전문(Android BigTextStyle). title 이 트렁케이트된 경우에만 채워진다.
   * iOS 는 확장 본문 개념이 없어 사용하지 않는다.
   */
  fullText?: string;
  target: NotificationTapTarget;
}

/**
 * 오늘 발송할 알림 3종의 완성 문구 + 침묵 슬롯 대체분.
 * 응답 호환성: 필드 자체가 생략될 수 있다(조립 실패) — 플랫폼은 기존 정적 문구로 폴백한다.
 */
export interface WidgetNotificationContent {
  /** 아침 — 오늘의 명언 실문구를 싣는다. */
  morning: WidgetNotificationCopy;
  /** 저녁 — 오늘의 목표 문구를 실은 기록 리마인더. */
  evening: WidgetNotificationCopy;
  /** 일요일 주간 회고. */
  weekly: WidgetNotificationCopy;
  /**
   * 오늘 할 일을 다 해 저녁 슬롯이 침묵할 때 대신 보낼 미완 과업 넛지.
   * null 이면 보낼 것이 없거나 오늘이 넛지 허용일이 아니다 — 현행대로 침묵한다.
   */
  pendingTask: WidgetNotificationCopy | null;
}

/**
 * 앞으로 며칠간의 위젯 명언 미리보기 1건.
 *
 * 왜 필요한가: 위젯(iOS WidgetKit·Android Glance)은 자정에 네트워크를 못 칠 수 있다
 * (iOS 는 익스텐션이 인증 호출 자체를 못 하고, Android 는 오프라인/도즈로 갱신이 밀린다).
 * 서버가 미리 며칠치 명언을 결정론적으로 뽑아 내려주면, 클라이언트는 날짜가 바뀌는 순간
 * 네트워크 없이도 그날의 새 명언으로 교체할 수 있다. 이후 앱/워커가 refresh 에 성공하면
 * 그날의 정식 카드(개인화 생성본)로 자연 대체된다.
 */
export interface WidgetUpcomingQuote {
  /** 이 미리보기가 유효한 KST 날짜 (YYYY-MM-DD). */
  ymd: string;
  text: string;
  author: string;
}

export interface WidgetTodayResponse {
  generatedAt: string;
  ymd: string;
  currentSlotIndex: number;
  slots: WidgetSlot[];
  nextRefreshAt: string;
  todayProgress: WidgetTodayProgress;
  /**
   * 다짐 따라쓰기 연속 일수(streak). 위젯 헤더 우상단 + 홈 헤더 우상단에 같은 값으로 표시.
   * 출처: `users/{uid}.affirmationStreak.count` (lib/affirmationCheckin.ts 에서 갱신).
   * 응답 호환성: 누락 시 위젯 측 0 폴백 — 옛 클라이언트도 동작.
   */
  streakCount?: number;
  /**
   * "성공한 나에게 한 발 더" 다짐 본문 목록. 위젯이 매일 결심을 다잡도록 그대로 노출.
   * 출처: `users/{uid}.successAffirmations` (lib/firebase.ts updateSuccessAffirmations).
   * 응답 호환성: 누락 시 위젯 측 빈 배열 폴백 — 옛 클라이언트도 동작.
   */
  affirmations?: string[];
  /**
   * `affirmations` 중 오늘 새길 줄의 인덱스(0-based) — 앱 체크인이 요구하는 그 한 줄.
   * lib/planRotation 의 pickTodayAffirmationIndex 결과로, 앱·서버와 같은 값이다.
   * 응답 호환성: 누락(또는 목록이 잘려 그 줄이 빠진 경우) 시 위젯은 강조 없이 전체를 보여준다.
   */
  affirmationFocusIndex?: number;
  /**
   * "그 꿈을 사는 하루" 비전 티저. 비전 미생성/생성 실패 시 생략된다(위젯은 해당 섹션 자연 생략).
   */
  futureVision?: WidgetFutureVision;
  /**
   * "이번 달 목표" 진척을 위젯에서 한 줄 카운트로 줄여 보여주기 위한 값.
   * goalsAchievedCount: 오늘 `achievedGoals` 에 포함돼 달성 처리된 목표 수.
   * goalsTotalCount: 사용자가 설정한 전체 목표 수.
   * 응답 호환성: 누락 시 위젯이 goalsSnapshot 길이로 폴백하거나 섹션을 생략.
   */
  goalsAchievedCount?: number;
  goalsTotalCount?: number;
  /**
   * "오늘의 if-then" 실행설계. 누락 시 위젯은 해당 섹션을 자연 생략 — 옛 클라이언트도 안전.
   */
  executionPlan?: WidgetExecutionPlan;
  /**
   * 알림 설정(정규화 완료본). Android 가 이 응답을 저장할 때 로컬 스케줄에 동기화한다 —
   * 별도 API/브릿지 없이 기존 위젯 파이프라인 하나로 정책이 흐른다.
   * 응답 호환성: 누락 시 클라이언트는 기본값(전부 켜짐, 08/21시)으로 동작.
   */
  notificationPrefs?: NotificationPrefs;
  /**
   * 사용자 언어로 조립된 알림 문구 묶음. Android Worker 가 발송 직전에 그대로 표시하고,
   * iOS 는 웹이 이 값을 읽어 네이티브 예약에 싣는다.
   * 응답 호환성: 조립 실패 시 생략 — 플랫폼은 각자의 정적 문구로 폴백한다.
   */
  notificationContent?: WidgetNotificationContent;
  /**
   * 내일부터 며칠간의 명언 미리보기(결정론적 큐레이션 선택 — LLM 비용 0).
   * 위젯이 자정에 네트워크 없이 그날의 새 명언으로 교체하는 데 쓴다.
   * 응답 호환성: 누락 시 위젯은 기존처럼 다음 성공 refresh 까지 이전 카드를 유지.
   */
  upcoming?: WidgetUpcomingQuote[];
}
