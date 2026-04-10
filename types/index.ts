import { Timestamp } from "firebase/firestore";

// ── 뉴스 도메인 ──────────────────────────────────────
export type NewsTopic = "전체" | "국내" | "글로벌" | "헬스케어" | "IT";

// ── 페르소나 ─────────────────────────────────────────
export type PersonaId =
  | "default"
  | "entrepreneur"
  | "healthcare-expert"
  | "fund-trader"
  | "tech-cto"
  | "policy-analyst"
  | "future-self";

export interface Persona {
  id: PersonaId;
  name: string;
  icon: string;
  description: string;
  systemPromptAddition: string;
}

// ── 사용자 ────────────────────────────────────────────
export interface User {
  uid: string;
  displayName: string;
  email: string;
  preferredTopics: NewsTopic[];
  userPersona?: string;
  futurePersona?: string;              // "되고 싶은 미래의 나" 자유 텍스트
  futurePersonaUpdatedAt?: Timestamp;
  // ── AI가 학습한 사용자 메모리 ──
  userMemory?: string;                 // AI가 누적 추출한 사용자 인사이트 (요약 텍스트)
  userMemoryUpdatedAt?: Timestamp;     // 메모리 마지막 업데이트 시각
  userMemoryMessageCount?: number;     // 마지막 메모리 업데이트 시점의 메시지 수
  createdAt: Timestamp;
}

// ── 세션 타입 ─────────────────────────────────────────
export type SessionType = "ai" | "dm" | "group" | "future-self";

// ── 대화 세션 ─────────────────────────────────────────
export interface ChatSession {
  id: string;
  uid: string;
  title: string;
  sessionType: SessionType;     // 세션 유형 (기본값 "ai")
  participants: string[];       // 참여자 uid 배열 (방장 포함)
  participantNames: Record<string, string>; // uid → displayName 매핑
  lastMessage?: string;         // 마지막 메시지 미리보기
  lastMessageAt?: Timestamp;    // 마지막 메시지 시간
  lastMessageSenderName?: string; // 마지막 메시지 발신자
  unreadCounts?: Record<string, number>; // uid별 안읽은 메시지 수
  pinnedBy?: string[];          // 고정한 사용자 uid 목록
  mutedBy?: string[];           // 음소거한 사용자 uid 목록
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ── 초대 ──────────────────────────────────────────────
export interface Invitation {
  id: string;
  sessionId: string;
  sessionTitle: string;
  fromUid: string;
  fromName: string;
  toUid: string;
  toEmail: string;
  status: "pending" | "accepted" | "declined";
  createdAt: Timestamp;
}

// ── 초대 링크 ────────────────────────────────────────
export interface InviteLink {
  id: string;
  sessionId: string;
  sessionTitle: string;
  fromUid: string;
  fromName: string;
  token: string;
  expiresAt: Timestamp;
  createdAt: Timestamp;
}

// ── 뉴스 출처 ─────────────────────────────────────────
export interface NewsSource {
  title: string;
  publisher: string;
  url: string;
  publishedAt: string;
  summary?: string;
  imageUrl?: string;
}

// ── 메시지 ────────────────────────────────────────────
export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  sources: NewsSource[];
  createdAt: Timestamp;
  senderUid?: string;
  senderName?: string;
  personaId?: PersonaId;
  personaName?: string;
  personaIcon?: string;
}

// ── FCM 토큰 ─────────────────────────────────────────
export interface UserFCMToken {
  id?: string;
  token: string;
  uid: string;
  createdAt: Timestamp;
  userAgent?: string;
}

// ── 사용자 프레즌스 ──────────────────────────────────
export interface UserPresence {
  uid: string;
  online: boolean;
  lastSeen: Timestamp;
  activeSessionId?: string;
}

// ── 자동 뉴스 설정 ───────────────────────────────────
export interface AutoNewsConfig {
  enabled: boolean;
  intervalMinutes: number;         // 폴링 간격 (기본 60분)
  activePersonas: PersonaId[];     // 자동 뉴스를 올릴 페르소나 목록
  customTopics?: string[];         // 사용자 지정 관심 주제 키워드
  lastCheckedAt?: Timestamp;       // 마지막 자동 뉴스 체크 시각
}

// ── 키워드 알림 설정 (페르소나 불필요, 순수 키워드 기반) ────
export interface KeywordAlertConfig {
  enabled: boolean;
  intervalMinutes: number;         // 폴링 간격 (기본 60분)
  keywords: string[];              // 사용자가 직접 등록한 검색 키워드
  lastCheckedAt?: Timestamp;       // 마지막 체크 시각
}

// ── API 요청/응답 ─────────────────────────────────────
export interface ChatRequest {
  message: string;
  sessionId: string;
  topic?: NewsTopic;
  persona?: PersonaId;
  userPersona?: string;
  futurePersona?: string;
}

export interface ChatStreamEvent {
  type: "text" | "sources" | "error" | "done";
  content?: string;
  sources?: NewsSource[];
  error?: string;
}

// ── 자동 뉴스 API ────────────────────────────────────
export interface AutoNewsRequest {
  sessionId: string;
  personaId: PersonaId;
  customTopics?: string[];
  futurePersona?: string;        // future-self 페르소나일 때 사용
  currentPersona?: string;       // 사용자 현재 자기소개 (보조 컨텍스트)
}

export interface AutoNewsResponse {
  hasNews: boolean;
  content?: string;
  sources?: NewsSource[];
  personaId?: PersonaId;
}

// ── 키워드 알림 API ──────────────────────────────────
export interface KeywordAlertRequest {
  sessionId: string;
  keywords: string[];
}

export interface KeywordAlertResponse {
  hasNews: boolean;
  content?: string;
  sources?: NewsSource[];
  matchedKeyword?: string;
}
