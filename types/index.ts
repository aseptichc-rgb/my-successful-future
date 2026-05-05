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
  /** 커스텀 페르소나용 프로필 사진 dataURL. 없으면 icon 사용. */
  photoUrl?: string;
  description: string;
  systemPromptAddition: string;
}

// ── 커스텀 페르소나 ────────────────────────────────
export interface CustomPersona {
  id: string;                       // "custom:xxxxx"
  name: string;
  icon: string;                     // 이모지 1자
  /** 사용자가 업로드한 프로필 사진 (256px 정사각, JPEG dataURL). 있으면 icon 대신 노출. */
  photoUrl?: string;
  description: string;              // 간략 설명
  systemPromptAddition: string;     // 톤/말투/전문성 자유 서술
  /** true 면 publicPersonas 컬렉션에 미러링되어 다른 사용자가 둘러보고 복제할 수 있다. */
  isPublic?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ── 공개 페르소나 (다른 사용자가 둘러보고 복제할 수 있는 멘토) ──
// 저장 위치: publicPersonas/{personaId}  (top-level)
// 문서 ID = 원본 CustomPersona.id ("custom:xxxxx")
// 작성자가 isPublic 을 켜는 순간 미러로 생성·갱신되고, 끄거나 삭제 시 함께 사라진다.
export interface PublicPersona {
  id: string;                       // 원본 CustomPersona.id
  name: string;
  icon: string;
  photoUrl?: string;
  description: string;
  systemPromptAddition: string;
  /** 작성자 uid — 권한 체크 + 본인 항목 필터링 용도 */
  creatorUid: string;
  /** 작성자 displayName 비정규화 (목록에서 "by ○○" 표기) */
  creatorName: string;
  publishedAt: Timestamp;
  updatedAt: Timestamp;
}

// ── 빌트인 페르소나 사용자별 오버라이드 ────────────
// Firestore: users/{uid}/personaOverrides/{builtinPersonaId}
// 문서가 없으면 = 기본값 사용. 문서 삭제 = 리셋.
export interface PersonaOverride {
  personaId: BuiltinPersonaId;
  name?: string;
  icon?: string;
  /** 사용자가 업로드한 프로필 사진 (256px 정사각, JPEG dataURL). 있으면 빌트인 라인 아이콘 대신 노출. */
  photoUrl?: string;
  description?: string;
  systemPromptAddition?: string;
  updatedAt: Timestamp;
}
export type PersonaOverrideInput = Pick<
  PersonaOverride,
  "name" | "icon" | "photoUrl" | "description" | "systemPromptAddition"
>;

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
  onboardedAt?: Timestamp;             // 3단계 온보딩 위저드 완료 시각. 없으면 위저드 재노출.
  /** 사용자가 직접 적은 목표 (최대 10개). 홈 대시보드에서 편집. */
  goals?: string[];
  goalsUpdatedAt?: Timestamp;
  createdAt: Timestamp;
}

// ── 홈 대시보드: 일일 체크리스트/회고 ───────────────
// Firestore 경로: users/{uid}/dailyEntries/{YYYY-MM-DD} (KST 기준)
export interface DailyTodo {
  id: string;                          // 클라이언트에서 부여한 안정 ID (crypto.randomUUID)
  text: string;
  done: boolean;
}

export interface DailyEntry {
  ymd: string;                         // YYYY-MM-DD (KST)
  todos: DailyTodo[];
  wins: string[];                      // 오늘 스스로 잘한 일 (최대 3개)
  /** 오늘 달성한 "나의 목표" 텍스트 목록. 목표 텍스트가 바뀌면 자연스럽게 무효화된다. */
  achievedGoals?: string[];
  updatedAt: Timestamp;
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
  /** 이 방에 소속된 AI 자문단(페르소나) 목록. 복수 가능. 생성 시 고정된다. */
  advisorIds?: PersonaId[];
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
  // 🔔 정시 키워드 뉴스 배달 배지
  scheduledSlot?: string;        // "HH:mm" KST — 크론이 정시 알림으로 전달한 메시지
  matchedKeyword?: string;       // 어떤 키워드 매칭으로 전달됐는지 (UI 배지)
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
/** "HH:mm" KST 특정 시각 발사 슬롯 */
export interface ScheduledNewsSlot {
  time: string;                    // "HH:mm" KST (24h)
  lastFiredYmd?: string;           // "YYYY-MM-DD" KST - 일일 중복 방지
}

export interface KeywordAlertConfig {
  enabled: boolean;
  intervalMinutes: number;         // 폴링 간격 (기본 60분)
  keywords: string[];              // 사용자가 직접 등록한 검색 키워드
  lastCheckedAt?: Timestamp;       // 마지막 체크 시각
  // ── 정시 알림 (서버 크론 기반) ──
  scheduledEnabled?: boolean;      // 특정 시각 알림 on/off (interval과 독립)
  scheduledTimes?: ScheduledNewsSlot[]; // 발사 시각 슬롯 목록
}

// ── 챗봇(빌트인/커스텀) 정시 키워드 뉴스 자동 배달 설정 ────
// 저장 위치: users/{uid}/personaSchedules/{personaId}
// personaId 는 빌트인 ID (예: "entrepreneur") 또는 커스텀 ID ("custom:xxx") 둘 다 허용한다.
// 크론이 collectionGroup 으로 스캔하므로 uid 를 비정규화해서 같이 저장한다.
export interface PersonaSchedule {
  personaId: string;               // 빌트인 PersonaId 또는 "custom:xxx"
  uid: string;                     // collectionGroup 스캔 시 소유자 식별
  enabled: boolean;
  keywords: string[];              // 1~10개
  scheduledTimes: ScheduledNewsSlot[]; // 최대 6개 슬롯 ("HH:mm" KST)
  /** 최초 진입 실시간 브리프 중복 방지 ("YYYY-MM-DD" KST). 슬롯과 독립. */
  lastLazyBriefYmd?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ── 페르소나 일일 격려 메시지 ────────────────────────
// 페르소나가 매일 8~18시 KST 사이에 한 번씩 사용자에게 보내는 짧은 격려 메시지.
// 저장 위치: users/{uid}/dailyEncouragements/{YYYY-MM-DD}
// 일일 1회 발사 보장 + 크론 재시도 안전성을 위해 fired 플래그를 항목별로 관리한다.
export interface DailyEncouragementItem {
  /** 빌트인 PersonaId 또는 "custom:xxx" */
  personaId: string;
  /** KST 자정 기준 발사 분 (480~1080, 즉 08:00~18:00) */
  dueMinute: number;
  /** 이미 발사됐는지 */
  fired: boolean;
  /** 발사된 세션 (디버그/조회용) */
  sessionId?: string;
  /** 발사 시각 (디버그용) */
  firedAt?: Timestamp;
}

export interface DailyEncouragementPlan {
  uid: string;
  /** YYYY-MM-DD (KST) */
  ymd: string;
  items: DailyEncouragementItem[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ── 매일 바뀌는 동기부여 카드 (배경화면용) ─────────
// 10년 후의 나가 보내는 한 마디 + 사용자 목표를 합친 "오늘의 한 장".
// 저장 위치: users/{uid}/dailyMotivations/{YYYY-MM-DD}  (KST)
export interface MotivationGradient {
  /** CSS 색상값 (#RRGGBB) */
  from: string;
  to: string;
  /** 그라데이션 각도 (deg) */
  angle: number;
  /** 텍스트 대비를 위해 다크/라이트 톤 표기 */
  tone: "dark" | "light";
}

export interface DailyMotivation {
  ymd: string;                     // YYYY-MM-DD (KST)
  /** 1~2 문장의 오늘의 격려 메시지 */
  quote: string;
  /** 인용 출처 — 보통 "10년 후의 나" */
  author: string;
  /** 카드에 표시할 사용자 목표 스냅샷 (최대 3개) */
  goalsSnapshot: string[];
  /** 인용을 만들 때 사용한 future persona 스냅샷 (요약) */
  futurePersonaSnapshot?: string;
  /** 결정론적으로 선택된 배경 그라데이션 */
  gradient: MotivationGradient;
  createdAt: Timestamp;
}

// ── 페르소나별 기억 샤드 ─────────────────────────────
export interface PersonaMemory {
  personaId: string;
  summary: string;                 // 이 페르소나 관점에서의 사용자 맥락 요약 (1000자 이내)
  topics?: string[];
  messageCount: number;            // 이 페르소나 대화에서 마지막 추출 시점의 메시지 수
  lastUpdatedAt: Timestamp;
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
 * 페르소나가 자기 도메인에서 누적해온 일일 흐름 한 줄 요약.
 * 매 슬롯 수집이 성공한 직후 collector 가 append 하며, 최근 N개만 보관한다.
 * Firestore 경로: personaDomainTimeline/{personaId} (단일 문서, entries 배열)
 *
 * 목적: 각 페르소나가 같은 도메인의 흐름을 시간 축으로 추적하고 있다는 걸
 * 시스템 프롬프트에 주입해, 다른 페르소나와의 전문성 격차를 만든다.
 */
export interface PersonaDomainTimelineEntry {
  /** YYYY-MM-DD (KST) */
  date: string;
  /** 슬롯 인덱스 (0 또는 1) — 같은 날 두 슬롯이 생기면 둘 다 보관 */
  slotIndex: number;
  /** 한 줄 브리핑 — collector 가 그 슬롯에서 만들어둔 것을 그대로 저장 */
  briefing: string;
}

export interface PersonaDomainTimeline {
  personaId: BuiltinPersonaId;
  entries: PersonaDomainTimelineEntry[];
  updatedAt: unknown;
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
