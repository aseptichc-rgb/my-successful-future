import { Timestamp } from "firebase/firestore";

// ── 뉴스 도메인 ──────────────────────────────────────
export type NewsTopic = "전체" | "국내" | "글로벌" | "헬스케어" | "IT";

// ── 페르소나 ─────────────────────────────────────────
// 빌트인 페르소나 ID
export type BuiltinPersonaId =
  | "default"
  | "entrepreneur"
  | "healthcare-expert"
  | "fund-trader"
  | "tech-cto"
  | "policy-analyst"
  | "future-self";

// 커스텀 페르소나 ID는 "custom:<randomId>" 형식
// 타입 시스템에서는 BuiltinPersonaId | string 으로 완화하되, 인텔리센스는 유지
export type PersonaId = BuiltinPersonaId | (string & {});

export interface Persona {
  id: PersonaId;
  name: string;
  icon: string;
  description: string;
  systemPromptAddition: string;
}

// ── 커스텀 페르소나 ────────────────────────────────
export interface CustomPersona {
  id: string;                       // "custom:xxxxx"
  name: string;
  icon: string;                     // 이모지 1자
  description: string;              // 간략 설명
  systemPromptAddition: string;     // 톤/말투/전문성 자유 서술
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ── 감정 상태 (mood-aware future-self) ────────────
export type MoodKind = "warm" | "stressed" | "flat" | "elated" | "unknown";

// ── 피어 채팅 AI 어시스트 ──────────────────────────
export type AssistMode = "summarize" | "reply" | "translate";

export interface AssistMessageInput {
  role: "user" | "assistant";
  senderName?: string;
  content: string;
  isMine?: boolean;             // 현재 사용자가 보낸 메시지인지
}

export interface AssistRequest {
  mode: AssistMode;
  messages: AssistMessageInput[];
  currentUserName?: string;
  targetLang?: string;          // translate 모드: 기본 "한국어"
  userPersona?: string;         // reply 모드: 사용자 자기소개 반영
}

export interface AssistResponse {
  mode: AssistMode;
  result: string;               // summarize/translate: 단일 텍스트
  suggestions?: string[];       // reply 모드: 여러 답장 제안
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
  // 🪑 카운슬 모드 필드
  councilGroupId?: string;       // 같은 카운슬 세션에 속한 메시지 그룹 식별자
  councilRound?: number;         // 1, 2, 3, ... / 종합은 999
  councilQuestion?: string;      // 원 질문 (첫 라운드 메시지에만 저장)
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

// ── 목표 & 마일스톤 ──────────────────────────────────
export type GoalCategory =
  | "career"
  | "health"
  | "learning"
  | "finance"
  | "relationship"
  | "other";

export interface GoalMilestone {
  title: string;
  done: boolean;
  doneAt?: Timestamp;
}

export interface Goal {
  id: string;
  title: string;
  description?: string;
  category: GoalCategory;
  targetDate?: Timestamp;          // 마감일 (선택)
  progress: number;                // 진척률 0~100
  milestones?: GoalMilestone[];
  lastCheckinAt?: Timestamp;
  lastCheckinNote?: string;        // 마지막 체크인 시 남긴 메모
  checkinCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** /api/chat 요청에 포함될 수 있는 가벼운 goal 스냅샷 */
export interface GoalSnapshot {
  title: string;
  category: GoalCategory;
  progress: number;
  targetDateISO?: string;          // YYYY-MM-DD
  daysLeft?: number;               // 양수=남은 일, 음수=지남
  lastCheckinNote?: string;
}

// ── 페르소나별 기억 샤드 ─────────────────────────────
export interface PersonaMemory {
  personaId: string;
  summary: string;                 // 이 페르소나 관점에서의 사용자 맥락 요약 (1000자 이내)
  topics?: string[];
  messageCount: number;            // 이 페르소나 대화에서 마지막 추출 시점의 메시지 수
  lastUpdatedAt: Timestamp;
}

// ── 데일리 체크리스트 ────────────────────────────────
export interface DailyTask {
  id: string;
  title: string;
  icon?: string;
  order: number;
  streakCount: number;           // 연속 완료 일수
  lastCompletedDate?: string;    // "YYYY-MM-DD" (KST) 마지막 완료일
  prevCompletedDate?: string;    // 1단계 되돌리기용 (체크 직전 값)
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface DailyTaskSnapshot {
  title: string;
  done: boolean;
  streakCount: number;
}

// ── 데일리 리추얼 ────────────────────────────────────
export interface DailyRitualConfig {
  enabled: boolean;
  morningEnabled: boolean;
  morningTime: string;             // "HH:mm" KST
  eveningEnabled: boolean;
  eveningTime: string;             // "HH:mm" KST
  lastMorningDate?: string;        // "YYYY-MM-DD" (KST) 중복 방지
  lastEveningDate?: string;
  sessionId?: string;              // 미래의 나 세션 id (메시지를 올릴 대상)
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

// ── 세션 첨부 문서 ───────────────────────────────────
export type SessionDocumentScope = "session" | "message";

export interface SessionDocument {
  id: string;
  sessionId: string;
  ownerUid: string;
  ownerName?: string;
  fileName: string;
  mime: "text/plain" | "text/markdown" | "application/pdf";
  sizeBytes: number;
  charCount: number;
  truncated: boolean;
  /** session: 세션 내내 컨텍스트 / message: 다음 1개 메시지에만 첨부 후 자동 비활성. */
  scope: SessionDocumentScope;
  active: boolean;
  /** 추출된 본문 텍스트(서버에서 sanitize 됨). */
  extractedText: string;
  createdAt: unknown; // Firestore Timestamp (클라이언트/서버 모두 사용)
}

// ── 외부 Push 토큰 (Claude Code 등에서 결과물을 채팅방에 푸시) ──
export interface PushToken {
  id: string;
  sessionId: string;
  ownerUid: string;
  ownerName?: string;
  /** 사람이 식별할 수 있는 라벨 (예: "친구A의 Claude Code"). */
  label?: string;
  /** SHA-256 해시 (원문 토큰은 발급 직후 1회만 노출). */
  tokenHash: string;
  expiresAt: unknown; // Firestore Timestamp
  revoked: boolean;
  useCount: number;
  maxUses?: number;
  lastUsedAt?: unknown;
  createdAt: unknown;
}

// ── 페르소나 자동 수집 뉴스 (1일 2회 스케줄) ─────────
/**
 * 각 빌트인 페르소나가 자기 도메인에서 자동 수집해서 보관하는 기사.
 * Firestore 경로: personaNews/{personaId}/items/{articleId}
 */
export interface CollectedArticle {
  id: string;
  personaId: BuiltinPersonaId;
  source: NewsSource;
  /** AI가 페르소나 관점에서 1~2 문장으로 요약. 토론 컨텍스트에 그대로 주입됨. */
  briefing: string;
  /** 수집 슬롯 인덱스 (0 또는 1) — 하루 2회 중 어느 회차인지 */
  slotIndex: number;
  /** YYYY-MM-DD (KST) — 동일 일자 중복 수집 방지용 */
  collectedDate: string;
  /** Firestore Timestamp (admin/client 모두 사용 가능하도록 unknown). */
  collectedAt: unknown;
}

/**
 * 페르소나별 일일 수집 스케줄.
 * 같은 날짜+페르소나 조합이면 항상 동일한 시각이 나오도록 결정론적으로 생성된다.
 * Firestore 경로: personaNewsSchedule/{YYYY-MM-DD}_{personaId}
 */
export interface PersonaNewsSchedule {
  date: string;                    // YYYY-MM-DD (KST)
  personaId: BuiltinPersonaId;
  /** [slot0Minutes, slot1Minutes] — KST 자정 기준 분 (420~1080 사이, 즉 07:00~18:00) */
  slotMinutes: [number, number];
  /** 각 슬롯이 이미 수집됐는지 */
  fetched: [boolean, boolean];
}

// ── 카운슬 토론 (사람 참여 가능 모드) ────────────────
/**
 * 진행 중인 카운슬 토론의 라이브 상태. 사람 끼어들기를 허용하기 위해
 * sendCouncilQuestion(원샷)과 별도로 useChat이 클라이언트 상태로 유지한다.
 */
export interface ActiveCouncilState {
  groupId: string;
  question: string;
  /** 아직 발언 안 한 페르소나 큐 (앞에서부터 소비). future-self는 항상 마지막. */
  remainingPersonas: PersonaId[];
  /** 지금까지 누적된 발언 (페르소나 + 사용자 끼어들기 모두 포함) */
  priorTurns: CouncilTurn[];
  /** 현재 라운드 인덱스 (1부터 시작) */
  currentRound: number;
}

export interface CouncilTurn {
  /** "persona": AI 발언 / "user": 사용자 끼어들기 */
  kind: "persona" | "user";
  speakerName: string;
  content: string;
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
