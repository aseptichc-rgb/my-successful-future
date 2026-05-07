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
   * 무료 체험 종료 시점 (Firestore Timestamp 미러).
   * 실제 게이트 판정은 Firebase custom claim 의 trialEndsAt(ms) 으로 수행하고,
   * 이 필드는 UI 의 D-day 카운트다운/안내 문구에 사용한다.
   */
  trialEndsAt?: Timestamp;
  createdAt: Timestamp;
}

/** "성공한 나의 모습" 다짐 따라쓰기 연속일 카운터. 서버 트랜잭션으로만 갱신. */
export interface AffirmationStreak {
  count: number;
  /** 마지막으로 정상 체크인이 일어난 날짜 (KST YYYY-MM-DD). */
  lastYmd: string;
  updatedAt?: Timestamp;
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

/**
 * 사용자별 정체성 라벨 누적 진행도. 라벨당 문서 1개.
 * - 문서 ID = identityTag(라벨 문자열, 한국어 그대로 사용 가능).
 * - count: 누적 응답 수. 카드 1장 = 최대 +1 (수정은 카운트 안 함).
 * - recentResponses: 최근 5개 응답 텍스트 (UI 슬라이딩 표시).
 */
export interface IdentityProgress {
  identityTag: string;
  count: number;
  lastRespondedAt: Timestamp;
  recentResponses: string[];
}

// ── 안드로이드 위젯: 큐레이션 명언 ──────────────────
export type FamousQuoteCategory =
  | "philosophy"
  | "entrepreneur"
  | "classic"
  | "leader"
  | "scientist"
  | "literature"
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
  createdAt: unknown;
  updatedAt: unknown;
}

export interface WidgetSlotMotivation {
  kind: "motivation";
  text: string;
  author: string;
  source?: string;
  originalText?: string;
  originalLang?: string;
  goalsSnapshot: string[];
  gradient: MotivationGradient;
}
export interface WidgetSlotFamous {
  kind: "famous";
  text: string;
  author?: string;
  category: FamousQuoteCategory;
  gradient: MotivationGradient;
}
export type WidgetSlot = WidgetSlotMotivation | WidgetSlotFamous;

export interface WidgetTodayResponse {
  generatedAt: string;
  ymd: string;
  currentSlotIndex: number;
  slots: WidgetSlot[];
  nextRefreshAt: string;
}
