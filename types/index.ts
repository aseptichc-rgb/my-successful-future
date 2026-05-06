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
  createdAt: Timestamp;
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
