import { Timestamp } from "firebase/firestore";

// ── 사용자 ────────────────────────────────────────────
export interface User {
  uid: string;
  displayName: string;
  email: string;
  /** "10년 후의 나의 모습" 자유 텍스트 — 동기부여 카드 컨텍스트로 사용. */
  futurePersona?: string;
  futurePersonaUpdatedAt?: Timestamp;
  onboardedAt?: Timestamp;
  /** 사용자가 직접 적은 목표 (최대 10개). 홈 대시보드에서 편집. */
  goals?: string[];
  goalsUpdatedAt?: Timestamp;
  /** 오늘의 명언 큐레이션 설정. */
  quotePreference?: QuotePreference;
  quotePreferenceUpdatedAt?: Timestamp;
  /** 미션 응답이 강화하는 정체성 라벨 풀. futurePersona 변경 시 서버에서 재생성. */
  identities?: UserIdentities;
  createdAt: Timestamp;
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
