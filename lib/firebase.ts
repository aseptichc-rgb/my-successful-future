import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  indexedDBLocalPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithCustomToken,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  onIdTokenChanged,
  type Auth,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  serverTimestamp,
  onSnapshot,
  arrayUnion,
  arrayRemove,
  writeBatch,
  increment,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import type { User, ChatSession, ChatMessage, Invitation, InviteLink, NewsSource, NewsTopic, SessionType, UserPresence, AutoNewsConfig, KeywordAlertConfig, PersonaId, DailyRitualConfig, PersonaMemory, CustomPersona, PersonaOverride, PersonaOverrideInput, BuiltinPersonaId, PersonaSchedule, ScheduledNewsSlot, DailyEntry, DailyTodo, PublicPersona, DailyMotivation } from "@/types";

// ── Firebase 지연 초기화 ─────────────────────────────
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;

function getFirebaseApp(): FirebaseApp {
  if (!_app) {
    _app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  }
  return _app;
}

function getAuthInstance(): Auth {
  if (!_auth) {
    _auth = getAuth(getFirebaseApp());
    // 브라우저를 닫았다 열어도 로그인 상태 유지 (기본값이지만 명시적으로 설정)
    if (typeof window !== "undefined") {
      setPersistence(_auth, indexedDBLocalPersistence).catch(() => {
        setPersistence(_auth!, browserLocalPersistence).catch(() => {});
      });
    }
  }
  return _auth;
}

function getDbInstance(): Firestore {
  if (!_db) {
    _db = getFirestore(getFirebaseApp());
  }
  return _db;
}

// auth, db를 getter로 노출
export { getAuthInstance as getAuth_, getDbInstance as getDb_ };

// ── Auth 헬퍼 ─────────────────────────────────────────
const googleProvider = new GoogleAuthProvider();

export async function signInWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(getAuthInstance(), email, password);
}

export async function signInWithGoogle() {
  return signInWithPopup(getAuthInstance(), googleProvider);
}

export async function signUp(email: string, password: string, displayName: string) {
  const credential = await createUserWithEmailAndPassword(getAuthInstance(), email, password);
  await createUserProfile(credential.user.uid, displayName, email);
  return credential;
}

export async function signOut() {
  return firebaseSignOut(getAuthInstance());
}

export async function signInWithCustomTokenClient(token: string) {
  return signInWithCustomToken(getAuthInstance(), token);
}

export { onAuthStateChanged, onIdTokenChanged, type FirebaseUser };

// ── 유저 프로필 CRUD ──────────────────────────────────
export async function createUserProfile(
  uid: string,
  displayName: string,
  email: string
) {
  const db = getDbInstance();
  await setDoc(doc(db, "users", uid), {
    displayName,
    email,
    preferredTopics: ["전체"] as NewsTopic[],
    createdAt: serverTimestamp(),
  });
}

export async function getUserProfile(uid: string): Promise<User | null> {
  const db = getDbInstance();
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return { uid: snap.id, ...snap.data() } as User;
}

/**
 * setDoc + merge 사용 이유:
 * - updateDoc 은 문서가 존재해야만 성공. 구글 로그인 등 createUserProfile 흐름을
 *   타지 않은 사용자는 users/{uid} 문서가 없을 수 있다.
 * - merge:true 로 하면 문서 생성·부분 갱신 모두 한 번에 처리되고, 이미 있는 필드는 보존.
 * - 온보딩·설정에서 이 함수들이 실패하면 UI 가 영원히 "저장 중…" 으로 멈추는 문제를 예방.
 */
export async function updatePreferredTopics(uid: string, topics: NewsTopic[]) {
  const db = getDbInstance();
  await setDoc(doc(db, "users", uid), { preferredTopics: topics }, { merge: true });
}

export async function updateUserPersona(uid: string, userPersona: string) {
  const db = getDbInstance();
  await setDoc(doc(db, "users", uid), { userPersona }, { merge: true });
}

export async function updateFuturePersona(uid: string, futurePersona: string) {
  const db = getDbInstance();
  await setDoc(
    doc(db, "users", uid),
    {
      futurePersona,
      futurePersonaUpdatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/**
 * 3단계 온보딩 완료 표시. 홈 진입 시 이 필드 부재면 /onboarding 으로 분기한다.
 */
export async function markOnboarded(uid: string) {
  const db = getDbInstance();
  await setDoc(
    doc(db, "users", uid),
    { onboardedAt: serverTimestamp() },
    { merge: true },
  );
}

/**
 * AI가 추출한 사용자 메모리(인사이트 요약)를 저장한다.
 * messageCount는 마지막 추출 시점의 메시지 수로, 다음 추출 트리거 판정에 사용.
 */
export async function updateUserMemory(
  uid: string,
  userMemory: string,
  messageCount: number
) {
  const db = getDbInstance();
  await updateDoc(doc(db, "users", uid), {
    userMemory,
    userMemoryUpdatedAt: serverTimestamp(),
    userMemoryMessageCount: messageCount,
  });
}

/**
 * 사용자의 future-self 세션을 찾는다 (없으면 null).
 */
export async function findFutureSelfSession(uid: string): Promise<ChatSession | null> {
  const db = getDbInstance();
  const q = query(
    collection(db, "sessions"),
    where("sessionType", "==", "future-self"),
    where("participants", "array-contains", uid)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as ChatSession;
}

/**
 * 사용자의 future-self 세션을 가져오거나 없으면 새로 생성한다.
 */
export async function ensureFutureSelfSession(
  uid: string,
  displayName: string
): Promise<string> {
  const existing = await findFutureSelfSession(uid);
  if (existing) return existing.id;

  const db = getDbInstance();
  const ref = await addDoc(collection(db, "sessions"), {
    uid,
    title: "🌟 미래의 나와의 대화",
    sessionType: "future-self",
    participants: [uid],
    participantNames: { [uid]: displayName || "나" },
    pinnedBy: [uid],          // 항상 사이드바 상단 고정
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

// ── 세션 CRUD ─────────────────────────────────────────
export async function createSession(
  uid: string,
  title: string,
  displayName: string = "",
  sessionType: SessionType = "ai",
  participantUids?: string[],
  participantNamesMap?: Record<string, string>,
  advisorIds?: PersonaId[],
): Promise<string> {
  const db = getDbInstance();
  const participants = participantUids || [uid];
  const participantNames = participantNamesMap || { [uid]: displayName || "나" };

  // participants에 방장이 포함되도록 보장
  if (!participants.includes(uid)) {
    participants.unshift(uid);
  }
  if (!participantNames[uid]) {
    participantNames[uid] = displayName || "나";
  }

  const payload: Record<string, unknown> = {
    uid,
    title,
    sessionType,
    participants,
    participantNames,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  // Firestore는 undefined 필드를 거부하므로, 값이 있을 때만 포함한다.
  if (advisorIds && advisorIds.length > 0) {
    payload.advisorIds = advisorIds;
  }

  const ref = await addDoc(collection(db, "sessions"), payload);
  return ref.id;
}

// ── DM 중복 방지: 기존 DM 세션 찾기 ─────────────────
export async function findExistingDM(uid1: string, uid2: string): Promise<ChatSession | null> {
  const db = getDbInstance();
  const q = query(
    collection(db, "sessions"),
    where("sessionType", "==", "dm"),
    where("participants", "array-contains", uid1)
  );
  const snap = await getDocs(q);
  for (const d of snap.docs) {
    const session = { id: d.id, ...d.data() } as ChatSession;
    if (session.participants?.includes(uid2)) {
      return session;
    }
  }
  return null;
}

export async function getSessions(uid: string): Promise<ChatSession[]> {
  const db = getDbInstance();
  // 참여 중인 모든 세션 조회 (본인 생성 + 초대받은 세션)
  // orderBy를 쿼리에서 빼고 클라이언트 측에서 정렬 → Firestore 복합 인덱스 불필요
  const q = query(
    collection(db, "sessions"),
    where("participants", "array-contains", uid)
  );
  const snap = await getDocs(q);
  const sessions = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ChatSession);
  return sessions.sort((a, b) => {
    const aTime = a.updatedAt?.toMillis?.() ?? 0;
    const bTime = b.updatedAt?.toMillis?.() ?? 0;
    return bTime - aTime;
  });
}

export async function getSessionById(sessionId: string): Promise<ChatSession | null> {
  const db = getDbInstance();
  const snap = await getDoc(doc(db, "sessions", sessionId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as ChatSession;
}

export async function updateSessionTitle(sessionId: string, title: string) {
  const db = getDbInstance();
  await updateDoc(doc(db, "sessions", sessionId), {
    title,
    updatedAt: serverTimestamp(),
  });
}

/**
 * 레거시 1대1 세션 백필 — advisorIds 가 비어 있던 옛 세션을 인박스에서 다시 들어왔을 때
 * 메시지 히스토리에서 추론한 페르소나 ID 로 채워준다. updatedAt 은 손대지 않아
 * 인박스 정렬이 흔들리지 않도록 한다.
 */
export async function backfillSessionAdvisorIds(
  sessionId: string,
  advisorIds: PersonaId[],
) {
  if (!advisorIds.length) return;
  const db = getDbInstance();
  await updateDoc(doc(db, "sessions", sessionId), { advisorIds });
}

// ── 메시지 CRUD ───────────────────────────────────────
interface AddMessageExtras {
  councilGroupId?: string;
  councilRound?: number;
  councilQuestion?: string;
}

export async function addMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  sources: NewsSource[] = [],
  personaInfo?: { personaId: string; personaName: string; personaIcon: string },
  senderUid?: string,
  senderName?: string,
  extras?: AddMessageExtras
): Promise<string> {
  const db = getDbInstance();
  const ref = await addDoc(collection(db, "messages"), {
    sessionId,
    role,
    content,
    sources,
    ...(personaInfo && personaInfo),
    ...(senderUid && { senderUid }),
    ...(senderName && { senderName }),
    ...(extras?.councilGroupId && { councilGroupId: extras.councilGroupId }),
    ...(typeof extras?.councilRound === "number" && { councilRound: extras.councilRound }),
    ...(extras?.councilQuestion && { councilQuestion: extras.councilQuestion }),
    createdAt: serverTimestamp(),
  });

  // 세션의 lastMessage 및 updatedAt 갱신
  const displayName = senderName || (personaInfo?.personaName) || "";
  await updateDoc(doc(db, "sessions", sessionId), {
    updatedAt: serverTimestamp(),
    lastMessage: content.length > 100 ? content.slice(0, 100) + "..." : content,
    lastMessageAt: serverTimestamp(),
    lastMessageSenderName: displayName,
  });

  // 푸시 알림 트리거 — 사람/페르소나 구분 없이 모든 메시지에서 발송.
  // 발신자(senderUid)가 본인이면 본인 단말로는 안 가고, 현재 이 세션을 보고 있는 사람도
  // /api/notify 의 presence 필터에서 제외된다. 페르소나 메시지는 senderUid 가 비어 있어
  // 어떤 참가자 uid 와도 매칭되지 않으므로 모든 참가자가 대상이 된다.
  // 푸시 실패가 메시지 저장 흐름을 막지 않도록 fire-and-forget.
  try {
    const notifySenderUid = senderUid ?? `__persona:${personaInfo?.personaId ?? "ai"}`;
    const notifySenderName = displayName || "새 메시지";
    void fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        senderUid: notifySenderUid,
        senderName: notifySenderName,
        messagePreview: content.length > 100 ? content.slice(0, 100) + "..." : content,
      }),
    }).catch(() => {});
  } catch {
    // 푸시 트리거 자체가 실패해도 메시지는 이미 저장됐으므로 무시.
  }

  return ref.id;
}

export async function getMessages(sessionId: string): Promise<ChatMessage[]> {
  const db = getDbInstance();
  const q = query(
    collection(db, "messages"),
    where("sessionId", "==", sessionId),
    orderBy("createdAt", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ChatMessage);
}

// ── 실시간 메시지 리스너 ──────────────────────────────
export function onMessagesSnapshot(
  sessionId: string,
  callback: (messages: ChatMessage[]) => void
): Unsubscribe {
  const db = getDbInstance();
  const q = query(
    collection(db, "messages"),
    where("sessionId", "==", sessionId),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(
    q,
    (snap) => {
      const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ChatMessage);
      callback(msgs);
    },
    (error) => {
      console.warn("메시지 리스너 에러:", error.message);
    }
  );
}

// ── 이메일로 사용자 찾기 ──────────────────────────────
export async function findUserByEmail(email: string): Promise<User | null> {
  const db = getDbInstance();
  const q = query(
    collection(db, "users"),
    where("email", "==", email.trim().toLowerCase())
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { uid: d.id, ...d.data() } as User;
}

// ── 초대 CRUD ─────────────────────────────────────────
export async function sendInvitation(
  sessionId: string,
  sessionTitle: string,
  fromUid: string,
  fromName: string,
  toUid: string,
  toEmail: string
): Promise<string> {
  const db = getDbInstance();
  const ref = await addDoc(collection(db, "invitations"), {
    sessionId,
    sessionTitle,
    fromUid,
    fromName,
    toUid,
    toEmail,
    status: "pending",
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getMyInvitations(uid: string): Promise<Invitation[]> {
  const db = getDbInstance();
  const q = query(
    collection(db, "invitations"),
    where("toUid", "==", uid),
    where("status", "==", "pending"),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Invitation);
}

export function onInvitationsSnapshot(
  uid: string,
  callback: (invitations: Invitation[]) => void
): Unsubscribe {
  const db = getDbInstance();
  const q = query(
    collection(db, "invitations"),
    where("toUid", "==", uid),
    where("status", "==", "pending")
  );
  return onSnapshot(
    q,
    (snap) => {
      const invites = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Invitation);
      callback(invites);
    },
    (error) => {
      console.warn("초대 리스너 에러:", error.message);
    }
  );
}

/**
 * 초대 수락.
 * Firestore 규칙상 "아직 참여자가 아닌 사용자"는 sessions 문서를 직접 update 할 수 없으므로
 * 서버 API(Admin SDK) 경유. 세션 쿠키로 uid 인증.
 */
export async function acceptInvitation(invitationId: string, _uid: string, displayName: string) {
  const res = await fetch("/api/invitations/accept", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invitationId, displayName }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "초대 수락 실패");
  }
}

export async function declineInvitation(invitationId: string) {
  const db = getDbInstance();
  await updateDoc(doc(db, "invitations", invitationId), { status: "declined" });
}

// ── 세션 참여자 확인 ──────────────────────────────────
export async function isSessionParticipant(sessionId: string, uid: string): Promise<boolean> {
  const session = await getSessionById(sessionId);
  if (!session) return false;
  return session.participants?.includes(uid) || session.uid === uid;
}

// ── 초대 링크 CRUD ───────────────────────────────────
function generateToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 24; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

export async function createInviteLink(
  sessionId: string,
  sessionTitle: string,
  fromUid: string,
  fromName: string
): Promise<InviteLink> {
  const db = getDbInstance();
  const token = generateToken();
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(now.toMillis() + 7 * 24 * 60 * 60 * 1000); // 7일 후 만료

  const ref = await addDoc(collection(db, "inviteLinks"), {
    sessionId,
    sessionTitle,
    fromUid,
    fromName,
    token,
    expiresAt,
    createdAt: serverTimestamp(),
  });

  return {
    id: ref.id,
    sessionId,
    sessionTitle,
    fromUid,
    fromName,
    token,
    expiresAt,
    createdAt: now,
  };
}

export async function getInviteLinkByToken(token: string): Promise<InviteLink | null> {
  const db = getDbInstance();
  const q = query(
    collection(db, "inviteLinks"),
    where("token", "==", token)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as InviteLink;
}

/**
 * 초대 링크로 대화방 참여.
 * Firestore 규칙상 비참여자는 sessions 문서에 read/update 모두 불가.
 * 서버 API(Admin SDK) 경유 — 세션 쿠키로 uid 인증, 링크 유효성 및 만료도 서버에서 검증.
 */
export async function joinSessionViaLink(
  token: string,
  _uid: string,
  displayName: string
): Promise<{ success: boolean; sessionId?: string; error?: string }> {
  try {
    const res = await fetch("/api/invites/join", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, displayName }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      sessionId?: string;
      error?: string;
    };
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || "대화방 참여 실패" };
    }
    return { success: true, sessionId: data.sessionId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "대화방 참여 실패";
    return { success: false, error: message };
  }
}

// ── 실시간 세션 리스너 ──────────────────────────────
export function onSessionsSnapshot(
  uid: string,
  callback: (sessions: ChatSession[]) => void
): Unsubscribe {
  const db = getDbInstance();
  // orderBy를 쿼리에서 빼고 클라이언트 측에서 정렬 → Firestore 복합 인덱스 불필요
  const q = query(
    collection(db, "sessions"),
    where("participants", "array-contains", uid)
  );
  return onSnapshot(
    q,
    (snap) => {
      const sessions = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ChatSession);
      sessions.sort((a, b) => {
        const aTime = a.updatedAt?.toMillis?.() ?? 0;
        const bTime = b.updatedAt?.toMillis?.() ?? 0;
        return bTime - aTime;
      });
      callback(sessions);
    },
    (error) => {
      console.warn("세션 리스너 에러:", error.message);
    }
  );
}

// ── 세션 삭제 / 나가기 ────────────────────────────────
// 1:1 AI 세션 (참여자 1명) → 세션 + 메시지 전체 삭제
// 다중 참여자 세션 → 자기 자신만 participants 에서 제거 ("나가기")
export async function deleteSession(sessionId: string, uid: string) {
  const db = getDbInstance();
  const sessionRef = doc(db, "sessions", sessionId);
  const sessionSnap = await getDoc(sessionRef);
  if (!sessionSnap.exists()) return;

  const data = sessionSnap.data() as ChatSession;
  const participants = data.participants || [];
  const isSolo = participants.length <= 1;

  if (isSolo) {
    // 세션에 속한 메시지 삭제
    const msgQuery = query(
      collection(db, "messages"),
      where("sessionId", "==", sessionId)
    );
    const msgSnap = await getDocs(msgQuery);
    const batch = writeBatch(db);
    msgSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(sessionRef);
    await batch.commit();
  } else {
    // 다중 참여자: 본인만 빠지기
    const newParticipantNames = { ...(data.participantNames || {}) };
    delete newParticipantNames[uid];
    await updateDoc(sessionRef, {
      participants: arrayRemove(uid),
      participantNames: newParticipantNames,
      pinnedBy: arrayRemove(uid),
      mutedBy: arrayRemove(uid),
    });
  }
}

// ── 안읽은 메시지 카운트 ────────────────────────────
export async function incrementUnreadCounts(
  sessionId: string,
  senderUid: string,
  participants: string[]
) {
  const db = getDbInstance();
  const updates: Record<string, ReturnType<typeof increment>> = {};
  for (const uid of participants) {
    if (uid !== senderUid) {
      updates[`unreadCounts.${uid}`] = increment(1);
    }
  }
  if (Object.keys(updates).length > 0) {
    await updateDoc(doc(db, "sessions", sessionId), updates);
  }
}

export async function clearUnreadCount(sessionId: string, uid: string) {
  const db = getDbInstance();
  await updateDoc(doc(db, "sessions", sessionId), {
    [`unreadCounts.${uid}`]: 0,
  });
}

// ── 세션 고정/음소거 ────────────────────────────────
export async function pinSession(sessionId: string, uid: string) {
  const db = getDbInstance();
  await updateDoc(doc(db, "sessions", sessionId), {
    pinnedBy: arrayUnion(uid),
  });
}

export async function unpinSession(sessionId: string, uid: string) {
  const db = getDbInstance();
  await updateDoc(doc(db, "sessions", sessionId), {
    pinnedBy: arrayRemove(uid),
  });
}

export async function muteSession(sessionId: string, uid: string) {
  const db = getDbInstance();
  await updateDoc(doc(db, "sessions", sessionId), {
    mutedBy: arrayUnion(uid),
  });
}

export async function unmuteSession(sessionId: string, uid: string) {
  const db = getDbInstance();
  await updateDoc(doc(db, "sessions", sessionId), {
    mutedBy: arrayRemove(uid),
  });
}

// ── 프레즌스 관리 ───────────────────────────────────
export async function updatePresence(
  uid: string,
  online: boolean,
  activeSessionId?: string
) {
  const db = getDbInstance();
  await setDoc(doc(db, "presence", uid), {
    uid,
    online,
    lastSeen: serverTimestamp(),
    ...(activeSessionId !== undefined && { activeSessionId }),
  }, { merge: true });
}

export function onPresenceSnapshot(
  uids: string[],
  callback: (presences: Record<string, UserPresence>) => void
): Unsubscribe {
  if (uids.length === 0) return () => {};
  const db = getDbInstance();
  // Firestore 'in' 쿼리는 최대 30개까지
  const limitedUids = uids.slice(0, 30);
  const q = query(
    collection(db, "presence"),
    where("uid", "in", limitedUids)
  );
  return onSnapshot(q, (snap) => {
    const presences: Record<string, UserPresence> = {};
    snap.docs.forEach((d) => {
      const data = d.data() as UserPresence;
      presences[data.uid] = data;
    });
    callback(presences);
  });
}

// ── FCM 토큰 관리 ───────────────────────────────────
export async function saveFCMToken(uid: string, token: string) {
  const db = getDbInstance();
  // 중복 토큰 확인
  const q = query(
    collection(db, "fcmTokens"),
    where("uid", "==", uid),
    where("token", "==", token)
  );
  const snap = await getDocs(q);
  if (!snap.empty) return; // 이미 등록됨

  await addDoc(collection(db, "fcmTokens"), {
    uid,
    token,
    createdAt: serverTimestamp(),
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
  });
}

export async function removeFCMToken(uid: string, token: string) {
  const db = getDbInstance();
  const q = query(
    collection(db, "fcmTokens"),
    where("uid", "==", uid),
    where("token", "==", token)
  );
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

// ── 자동 뉴스 설정 CRUD ────────────────────────────────
export async function saveAutoNewsConfig(
  sessionId: string,
  config: AutoNewsConfig
) {
  const db = getDbInstance();
  await setDoc(doc(db, "autoNewsConfigs", sessionId), {
    ...config,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function getAutoNewsConfig(
  sessionId: string
): Promise<AutoNewsConfig | null> {
  const db = getDbInstance();
  const snap = await getDoc(doc(db, "autoNewsConfigs", sessionId));
  if (!snap.exists()) return null;
  return snap.data() as AutoNewsConfig;
}

export function onAutoNewsConfigSnapshot(
  sessionId: string,
  callback: (config: AutoNewsConfig | null) => void
): Unsubscribe {
  const db = getDbInstance();
  return onSnapshot(
    doc(db, "autoNewsConfigs", sessionId),
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      callback(snap.data() as AutoNewsConfig);
    },
    (error) => {
      console.warn("자동 뉴스 설정 리스너 에러:", error.message);
    }
  );
}

export async function updateAutoNewsLastChecked(sessionId: string) {
  const db = getDbInstance();
  await updateDoc(doc(db, "autoNewsConfigs", sessionId), {
    lastCheckedAt: serverTimestamp(),
  });
}

// ── 키워드 알림 설정 CRUD ──────────────────────────────
export async function saveKeywordAlertConfig(
  sessionId: string,
  config: KeywordAlertConfig
) {
  const db = getDbInstance();
  await setDoc(doc(db, "keywordAlerts", sessionId), {
    ...config,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function getKeywordAlertConfig(
  sessionId: string
): Promise<KeywordAlertConfig | null> {
  const db = getDbInstance();
  const snap = await getDoc(doc(db, "keywordAlerts", sessionId));
  if (!snap.exists()) return null;
  return snap.data() as KeywordAlertConfig;
}

export function onKeywordAlertConfigSnapshot(
  sessionId: string,
  callback: (config: KeywordAlertConfig | null) => void
): Unsubscribe {
  const db = getDbInstance();
  return onSnapshot(
    doc(db, "keywordAlerts", sessionId),
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      callback(snap.data() as KeywordAlertConfig);
    },
    (error) => {
      console.warn("키워드 알림 설정 리스너 에러:", error.message);
    }
  );
}

export async function updateKeywordAlertLastChecked(sessionId: string) {
  const db = getDbInstance();
  await updateDoc(doc(db, "keywordAlerts", sessionId), {
    lastCheckedAt: serverTimestamp(),
  });
}

// ── 데일리 리추얼 설정 CRUD ─────────────────────────
// 문서 ID = uid (사용자 1명당 1개 설정)
export async function saveDailyRitualConfig(
  uid: string,
  config: Partial<DailyRitualConfig>
) {
  const db = getDbInstance();
  await setDoc(
    doc(db, "dailyRitualConfigs", uid),
    { ...config, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export async function getDailyRitualConfig(
  uid: string
): Promise<DailyRitualConfig | null> {
  const db = getDbInstance();
  const snap = await getDoc(doc(db, "dailyRitualConfigs", uid));
  if (!snap.exists()) return null;
  return snap.data() as DailyRitualConfig;
}

export function onDailyRitualConfigSnapshot(
  uid: string,
  callback: (config: DailyRitualConfig | null) => void
): Unsubscribe {
  const db = getDbInstance();
  return onSnapshot(
    doc(db, "dailyRitualConfigs", uid),
    (snap) => {
      callback(snap.exists() ? (snap.data() as DailyRitualConfig) : null);
    },
    (error) => {
      console.warn("데일리 리추얼 설정 리스너 에러:", error.message);
    }
  );
}

// ── 커스텀 페르소나 CRUD ────────────────────────────
// 저장 위치: users/{uid}/customPersonas/{personaId}
// 문서 ID는 "custom:xxxxx" 형식의 랜덤 token
const CUSTOM_PERSONA_ID_LEN = 10;
const CUSTOM_PERSONA_ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
const PUBLIC_PERSONAS_COL = "publicPersonas";

function generateCustomPersonaId(): string {
  let token = "";
  for (let i = 0; i < CUSTOM_PERSONA_ID_LEN; i++) {
    token += CUSTOM_PERSONA_ID_CHARS.charAt(
      Math.floor(Math.random() * CUSTOM_PERSONA_ID_CHARS.length),
    );
  }
  return `custom:${token}`;
}

/** publicPersonas 미러 문서 페이로드 — 작성자 식별 + 노출 필드만 비정규화 */
function buildPublicPersonaPayload(args: {
  id: string;
  creatorUid: string;
  creatorName: string;
  name: string;
  icon: string;
  photoUrl?: string;
  description: string;
  systemPromptAddition: string;
  publishedAt: unknown;        // serverTimestamp() 또는 기존 Timestamp 유지
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: args.id,
    creatorUid: args.creatorUid,
    creatorName: args.creatorName,
    name: args.name,
    icon: args.icon,
    description: args.description,
    systemPromptAddition: args.systemPromptAddition,
    publishedAt: args.publishedAt,
    updatedAt: serverTimestamp(),
  };
  if (args.photoUrl) payload.photoUrl = args.photoUrl;
  return payload;
}

export async function createCustomPersona(
  uid: string,
  data: Pick<CustomPersona, "name" | "icon" | "description" | "systemPromptAddition"> &
    Partial<Pick<CustomPersona, "photoUrl" | "isPublic">>,
  /** isPublic=true 일 때 publicPersonas 미러에 저장될 작성자 표시명. 없으면 공개 불가. */
  creatorName?: string,
): Promise<string> {
  const db = getDbInstance();
  const id = generateCustomPersonaId();
  const wantsPublic = !!data.isPublic && !!creatorName;
  const personaPayload: Record<string, unknown> = {
    id,
    name: data.name,
    icon: data.icon || "✨",
    description: data.description || "",
    systemPromptAddition: data.systemPromptAddition,
    isPublic: wantsPublic,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (data.photoUrl) personaPayload.photoUrl = data.photoUrl;

  const batch = writeBatch(db);
  batch.set(doc(db, "users", uid, "customPersonas", id), personaPayload);
  if (wantsPublic) {
    batch.set(
      doc(db, PUBLIC_PERSONAS_COL, id),
      buildPublicPersonaPayload({
        id,
        creatorUid: uid,
        creatorName: creatorName!,
        name: data.name,
        icon: data.icon || "✨",
        photoUrl: data.photoUrl,
        description: data.description || "",
        systemPromptAddition: data.systemPromptAddition,
        publishedAt: serverTimestamp(),
      }),
    );
  }
  await batch.commit();
  return id;
}

export async function updateCustomPersona(
  uid: string,
  id: string,
  updates: Partial<Pick<CustomPersona, "name" | "icon" | "description" | "systemPromptAddition" | "photoUrl" | "isPublic">>,
  /** isPublic 토글에 따라 미러를 동기화하기 위한 작성자 표시명. */
  creatorName?: string,
) {
  const db = getDbInstance();
  // photoUrl: 빈 문자열은 "삭제 요청"으로 해석해 deleteField 처리
  const { deleteField } = await import("firebase/firestore");

  // 미러 동기화 결정에 필요한 현재 isPublic 상태(요청에 isPublic이 없으면 기존 값 유지)
  const personaRef = doc(db, "users", uid, "customPersonas", id);
  const currentSnap = await getDoc(personaRef);
  if (!currentSnap.exists()) {
    throw new Error("페르소나를 찾을 수 없어요.");
  }
  const current = currentSnap.data() as CustomPersona;

  const personaPayload: Record<string, unknown> = { ...updates, updatedAt: serverTimestamp() };
  if ("photoUrl" in updates && !updates.photoUrl) {
    personaPayload.photoUrl = deleteField();
  }

  const nextIsPublic = "isPublic" in updates ? !!updates.isPublic : !!current.isPublic;
  const wasPublic = !!current.isPublic;
  const merged = {
    name: updates.name ?? current.name,
    icon: updates.icon ?? current.icon,
    description: updates.description ?? current.description ?? "",
    systemPromptAddition: updates.systemPromptAddition ?? current.systemPromptAddition,
    photoUrl:
      "photoUrl" in updates ? (updates.photoUrl || undefined) : current.photoUrl,
  };

  const batch = writeBatch(db);
  batch.update(personaRef, personaPayload);

  if (nextIsPublic) {
    if (!creatorName) {
      // 작성자 이름 없이 공개 미러를 만들 수 없다 — 의도치 않은 익명 공개 방지
      throw new Error("공개하려면 사용자 이름이 필요해요. 설정에서 이름을 먼저 설정해주세요.");
    }
    // 새로 공개되는 경우 publishedAt 을 새로 찍고, 이미 공개 상태였다면 updatedAt 만 갱신.
    batch.set(
      doc(db, PUBLIC_PERSONAS_COL, id),
      buildPublicPersonaPayload({
        id,
        creatorUid: uid,
        creatorName,
        name: merged.name,
        icon: merged.icon,
        photoUrl: merged.photoUrl,
        description: merged.description,
        systemPromptAddition: merged.systemPromptAddition,
        publishedAt: wasPublic ? (current as unknown as { publishedAt?: unknown }).publishedAt ?? serverTimestamp() : serverTimestamp(),
      }),
      { merge: true },
    );
  } else if (wasPublic) {
    // 공개 → 비공개: 미러 삭제
    batch.delete(doc(db, PUBLIC_PERSONAS_COL, id));
  }

  await batch.commit();
}

export async function deleteCustomPersona(uid: string, id: string) {
  const db = getDbInstance();
  // 정시 뉴스 스케줄도 같이 지운다 (실패해도 페르소나 삭제는 진행 — 데이터 정합성보다 사용자 액션 우선)
  try {
    await deleteDoc(doc(db, "users", uid, "personaSchedules", id));
  } catch (err) {
    console.warn("[deleteCustomPersona] schedule 캐스케이드 실패:", err);
  }
  // 공개 미러도 함께 제거 (없으면 조용히 무시)
  try {
    await deleteDoc(doc(db, PUBLIC_PERSONAS_COL, id));
  } catch (err) {
    console.warn("[deleteCustomPersona] public 미러 캐스케이드 실패:", err);
  }
  await deleteDoc(doc(db, "users", uid, "customPersonas", id));
}

export function onCustomPersonasSnapshot(
  uid: string,
  callback: (map: Record<string, CustomPersona>) => void
): Unsubscribe {
  const db = getDbInstance();
  return onSnapshot(
    collection(db, "users", uid, "customPersonas"),
    (snap) => {
      const map: Record<string, CustomPersona> = {};
      snap.docs.forEach((d) => {
        const data = d.data() as CustomPersona;
        map[d.id] = { ...data, id: d.id };
      });
      callback(map);
    },
    (error) => {
      console.warn("커스텀 페르소나 리스너 에러:", error.message);
    }
  );
}

// ── 공개 페르소나 (다른 사용자가 둘러보고 복제할 수 있는 멘토) ──────────────

/** 모든 공개 페르소나를 publishedAt 내림차순 비슷하게 받음. */
export function onPublicPersonasSnapshot(
  callback: (list: PublicPersona[]) => void,
): Unsubscribe {
  const db = getDbInstance();
  const q = query(collection(db, PUBLIC_PERSONAS_COL), orderBy("publishedAt", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      const list: PublicPersona[] = [];
      snap.docs.forEach((d) => {
        const data = d.data() as PublicPersona;
        list.push({ ...data, id: d.id });
      });
      callback(list);
    },
    (error) => {
      console.warn("공개 페르소나 리스너 에러:", error.message);
    },
  );
}

/**
 * 공개 페르소나를 본인 customPersonas 로 복제한다.
 * - 새 ID 발급 (원본 personaSchedules/메모리와 충돌 방지)
 * - isPublic 은 false 로 시작 (자동 재공개 금지)
 * 반환값: 새로 만들어진 customPersona id
 */
export async function clonePublicPersona(
  uid: string,
  publicPersonaId: string,
): Promise<string> {
  const db = getDbInstance();
  const snap = await getDoc(doc(db, PUBLIC_PERSONAS_COL, publicPersonaId));
  if (!snap.exists()) {
    throw new Error("이 공개 멘토는 더 이상 존재하지 않아요.");
  }
  const src = snap.data() as PublicPersona;

  const newId = generateCustomPersonaId();
  const payload: Record<string, unknown> = {
    id: newId,
    name: src.name,
    icon: src.icon || "✨",
    description: src.description || "",
    systemPromptAddition: src.systemPromptAddition,
    isPublic: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (src.photoUrl) payload.photoUrl = src.photoUrl;
  await setDoc(doc(db, "users", uid, "customPersonas", newId), payload);
  return newId;
}

// ── 페르소나(빌트인+커스텀) 정시 뉴스 스케줄 CRUD ───────────────
// 저장 위치: users/{uid}/personaSchedules/{personaId}
// personaId 는 빌트인 ID 또는 "custom:xxx" 둘 다 허용.
// uid 필드를 비정규화 저장하여 크론에서 collectionGroup 쿼리로 스캔 가능하게 함.
export type PersonaScheduleInput = Pick<
  PersonaSchedule,
  "enabled" | "keywords" | "scheduledTimes"
>;

export async function getPersonaSchedule(
  uid: string,
  personaId: string
): Promise<PersonaSchedule | null> {
  try {
    const db = getDbInstance();
    const snap = await getDoc(doc(db, "users", uid, "personaSchedules", personaId));
    if (!snap.exists()) return null;
    return snap.data() as PersonaSchedule;
  } catch (err) {
    console.error("getPersonaSchedule 실패:", err);
    return null;
  }
}

export async function savePersonaSchedule(
  uid: string,
  personaId: string,
  input: PersonaScheduleInput
): Promise<void> {
  const db = getDbInstance();
  const ref = doc(db, "users", uid, "personaSchedules", personaId);
  // 중복 발사 방지를 위해 lastFiredYmd 는 기존 값 보존, 새 슬롯은 빈 값으로 시작
  const existing = await getDoc(ref);
  const prevSlots: ScheduledNewsSlot[] =
    (existing.exists() && (existing.data() as PersonaSchedule).scheduledTimes) || [];
  const prevByTime = new Map(prevSlots.map((s) => [s.time, s.lastFiredYmd]));
  const mergedSlots: ScheduledNewsSlot[] = input.scheduledTimes.map((s) => {
    const prev = prevByTime.get(s.time);
    return prev ? { time: s.time, lastFiredYmd: prev } : { time: s.time };
  });

  await setDoc(
    ref,
    {
      personaId,
      uid,
      enabled: input.enabled,
      keywords: input.keywords,
      scheduledTimes: mergedSlots,
      ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function deletePersonaSchedule(
  uid: string,
  personaId: string
): Promise<void> {
  const db = getDbInstance();
  await deleteDoc(doc(db, "users", uid, "personaSchedules", personaId));
}

export function onPersonaScheduleSnapshot(
  uid: string,
  personaId: string,
  callback: (schedule: PersonaSchedule | null) => void
): Unsubscribe {
  const db = getDbInstance();
  return onSnapshot(
    doc(db, "users", uid, "personaSchedules", personaId),
    (snap) => {
      callback(snap.exists() ? (snap.data() as PersonaSchedule) : null);
    },
    (error) => {
      console.warn("페르소나 스케줄 리스너 에러:", error.message);
    }
  );
}

// ── 빌트인 페르소나 오버라이드 CRUD ──────────────────
// 저장 위치: users/{uid}/personaOverrides/{builtinPersonaId}
// 문서가 없으면 기본값 사용. 문서 삭제 = 리셋.
export async function upsertPersonaOverride(
  uid: string,
  personaId: BuiltinPersonaId,
  data: PersonaOverrideInput
): Promise<void> {
  try {
    const db = getDbInstance();
    await setDoc(
      doc(db, "users", uid, "personaOverrides", personaId),
      {
        personaId,
        ...data,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    console.error("upsertPersonaOverride 실패:", error);
    throw error;
  }
}

export async function deletePersonaOverride(
  uid: string,
  personaId: BuiltinPersonaId
): Promise<void> {
  try {
    const db = getDbInstance();
    await deleteDoc(doc(db, "users", uid, "personaOverrides", personaId));
  } catch (error) {
    console.error("deletePersonaOverride 실패:", error);
    throw error;
  }
}

export function onPersonaOverridesSnapshot(
  uid: string,
  callback: (map: Record<string, PersonaOverride>) => void
): Unsubscribe {
  const db = getDbInstance();
  return onSnapshot(
    collection(db, "users", uid, "personaOverrides"),
    (snap) => {
      const map: Record<string, PersonaOverride> = {};
      snap.docs.forEach((d) => {
        const data = d.data() as PersonaOverride;
        map[d.id] = { ...data, personaId: d.id as BuiltinPersonaId };
      });
      callback(map);
    },
    (error) => {
      console.warn("페르소나 오버라이드 리스너 에러:", error.message);
    }
  );
}

// ── 페르소나별 기억 샤드 CRUD ────────────────────────
// 저장 위치: users/{uid}/personaMemories/{personaId}
export async function updatePersonaMemory(
  uid: string,
  personaId: string,
  summary: string,
  messageCount: number,
  topics?: string[]
) {
  const db = getDbInstance();
  await setDoc(
    doc(db, "users", uid, "personaMemories", personaId),
    {
      personaId,
      summary,
      ...(topics && { topics }),
      messageCount,
      lastUpdatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export function onPersonaMemoriesSnapshot(
  uid: string,
  callback: (memories: Record<string, PersonaMemory>) => void
): Unsubscribe {
  const db = getDbInstance();
  return onSnapshot(
    collection(db, "users", uid, "personaMemories"),
    (snap) => {
      const map: Record<string, PersonaMemory> = {};
      snap.docs.forEach((d) => {
        map[d.id] = d.data() as PersonaMemory;
      });
      callback(map);
    },
    (error) => {
      console.warn("페르소나 메모리 리스너 에러:", error.message);
    }
  );
}

// ── 홈 대시보드: 목표 (최대 10개) ────────────────────
export const MAX_USER_GOALS = 10;

/**
 * 사용자의 목표 리스트를 갱신한다. 빈 문자열은 제거하고 앞에서부터 MAX_USER_GOALS 개로 자른다.
 * setDoc + merge 로 사용자 문서가 없는 케이스도 안전 처리.
 */
export async function updateUserGoals(uid: string, goals: string[]) {
  const db = getDbInstance();
  const cleaned = goals
    .map((g) => g.trim())
    .filter((g) => g.length > 0)
    .slice(0, MAX_USER_GOALS);
  await setDoc(
    doc(db, "users", uid),
    {
      goals: cleaned,
      goalsUpdatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

// ── 홈 대시보드: 일일 체크리스트 / 회고 ──────────────
export const MAX_DAILY_WINS = 3;

/** KST 기준 YYYY-MM-DD 문자열 */
export function getKstYmd(date: Date = new Date()): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

export function onDailyEntrySnapshot(
  uid: string,
  ymd: string,
  callback: (entry: DailyEntry | null) => void
): Unsubscribe {
  const db = getDbInstance();
  return onSnapshot(
    doc(db, "users", uid, "dailyEntries", ymd),
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      callback(snap.data() as DailyEntry);
    },
    (error) => {
      console.warn("일일 엔트리 리스너 에러:", error.message);
    }
  );
}

export async function saveDailyTodos(uid: string, ymd: string, todos: DailyTodo[]) {
  const db = getDbInstance();
  await setDoc(
    doc(db, "users", uid, "dailyEntries", ymd),
    {
      ymd,
      todos,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function saveDailyWins(uid: string, ymd: string, wins: string[]) {
  const db = getDbInstance();
  const cleaned = wins
    .map((w) => w.trim())
    .filter((w) => w.length > 0)
    .slice(0, MAX_DAILY_WINS);
  await setDoc(
    doc(db, "users", uid, "dailyEntries", ymd),
    {
      ymd,
      wins: cleaned,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

// ── 매일 동기부여 카드 (배경화면용) ──────────────────
/**
 * 오늘의 동기부여 카드 1건을 실시간 구독한다. 카드 자체는 서버 API
 * (/api/daily-motivation) 가 생성·갱신하지만, 본인 권한이 있으므로 클라이언트가
 * 직접 onSnapshot 으로 즉시 받아본다.
 */
export function onDailyMotivationSnapshot(
  uid: string,
  ymd: string,
  callback: (motivation: DailyMotivation | null) => void
): Unsubscribe {
  const db = getDbInstance();
  return onSnapshot(
    doc(db, "users", uid, "dailyMotivations", ymd),
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      callback(snap.data() as DailyMotivation);
    },
    (error) => {
      console.warn("동기부여 카드 리스너 에러:", error.message);
    }
  );
}

/**
 * 오늘 달성한 목표 텍스트 목록을 저장한다 (목표 텍스트 자체를 키로 사용).
 * 목표 텍스트를 사용자가 수정하면 자연스럽게 체크가 풀리는 동작을 의도.
 */
export async function saveDailyAchievedGoals(uid: string, ymd: string, achieved: string[]) {
  const db = getDbInstance();
  const cleaned = Array.from(new Set(achieved.map((g) => g.trim()).filter((g) => g.length > 0)));
  await setDoc(
    doc(db, "users", uid, "dailyEntries", ymd),
    {
      ymd,
      achievedGoals: cleaned,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
