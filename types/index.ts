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
  | "policy-analyst";

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
  createdAt: Timestamp;
}

// ── 대화 세션 ─────────────────────────────────────────
export interface ChatSession {
  id: string;
  uid: string;
  title: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ── 뉴스 출처 ─────────────────────────────────────────
export interface NewsSource {
  title: string;
  publisher: string;
  url: string;
  publishedAt: string;
  summary?: string;
}

// ── 메시지 ────────────────────────────────────────────
export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  sources: NewsSource[];
  createdAt: Timestamp;
  personaId?: PersonaId;
  personaName?: string;
  personaIcon?: string;
}

// ── API 요청/응답 ─────────────────────────────────────
export interface ChatRequest {
  message: string;
  sessionId: string;
  topic?: NewsTopic;
  persona?: PersonaId;
}

export interface ChatStreamEvent {
  type: "text" | "sources" | "error" | "done";
  content?: string;
  sources?: NewsSource[];
  error?: string;
}
