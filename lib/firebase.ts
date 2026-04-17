import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  indexedDBLocalPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
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
import type { User, ChatSession, ChatMessage, Invitation, InviteLink, NewsSource, NewsTopic, SessionType, UserPresence, AutoNewsConfig, KeywordAlertConfig, PersonaId, Goal, DailyRitualConfig, DailyTask, PersonaMemory, CustomPersona, PersonaOverride, PersonaOverrideInput, BuiltinPersonaId, PersonaSchedule, ScheduledNewsSlot } from "@/types";

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

export { onAuthStateChanged, type FirebaseUser };

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

export async function updatePreferredTopics(uid: string, topics: NewsTopic[]) {
  const db = getDbInstance();
  await updateDoc(doc(db, "users", uid), { preferredTopics: topics });
}

export async function updateUserPersona(uid: string, userPersona: string) {
  const db = getDbInstance();
  await updateDoc(doc(db, "users", uid), { userPersona });
}

export async function updateFuturePersona(uid: string, futurePersona: string) {
  const db = getDbInstance();
  await updateDoc(doc(db, "users", uid), {
    futurePersona,
    futurePersonaUpdatedAt: serverTimestamp(),
  });
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
  participantNamesMap?: Record<string, string>
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

  const ref = await addDoc(collection(db, "sessions"), {
    uid,
    title,
    sessionType,
    participants,
    participantNames,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
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

export async function acceptInvitation(invitationId: string, uid: string, displayName: string) {
  const db = getDbInstance();
  const invDoc = await getDoc(doc(db, "invitations", invitationId));
  if (!invDoc.exists()) return;

  const inv = invDoc.data();

  // 초대 상태 업데이트
  await updateDoc(doc(db, "invitations", invitationId), { status: "accepted" });

  // 세션에 참여자 추가
  await updateDoc(doc(db, "sessions", inv.sessionId), {
    participants: arrayUnion(uid),
    [`participantNames.${uid}`]: displayName,
    updatedAt: serverTimestamp(),
  });
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

export async function joinSessionViaLink(
  token: string,
  uid: string,
  displayName: string
): Promise<{ success: boolean; sessionId?: string; error?: string }> {
  const inviteLink = await getInviteLinkByToken(token);
  if (!inviteLink) {
    return { success: false, error: "유효하지 않은 초대 링크입니다." };
  }

  if (inviteLink.expiresAt.toMillis() < Date.now()) {
    return { success: false, error: "만료된 초대 링크입니다." };
  }

  const session = await getSessionById(inviteLink.sessionId);
  if (!session) {
    return { success: false, error: "존재하지 않는 대화방입니다." };
  }

  if (session.participants?.includes(uid)) {
    return { success: true, sessionId: inviteLink.sessionId };
  }

  const db = getDbInstance();
  await updateDoc(doc(db, "sessions", inviteLink.sessionId), {
    participants: arrayUnion(uid),
    [`participantNames.${uid}`]: displayName,
    updatedAt: serverTimestamp(),
  });

  return { success: true, sessionId: inviteLink.sessionId };
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

// ── 목표 CRUD ───────────────────────────────────────
// 저장 위치: users/{uid}/goals/{goalId}
export async function createGoal(
  uid: string,
  data: Pick<Goal, "title" | "category"> & Partial<Pick<Goal, "description" | "targetDate" | "progress" | "milestones">>
): Promise<string> {
  const db = getDbInstance();
  const ref = await addDoc(collection(db, "users", uid, "goals"), {
    title: data.title,
    description: data.description || "",
    category: data.category,
    ...(data.targetDate && { targetDate: data.targetDate }),
    progress: data.progress ?? 0,
    milestones: data.milestones || [],
    checkinCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateGoal(
  uid: string,
  goalId: string,
  updates: Partial<Goal>
) {
  const db = getDbInstance();
  // id, createdAt 은 업데이트 대상에서 제거
  const { id: _id, createdAt: _createdAt, ...rest } = updates as Partial<Goal> & { id?: string; createdAt?: unknown };
  void _id;
  void _createdAt;
  await updateDoc(doc(db, "users", uid, "goals", goalId), {
    ...rest,
    updatedAt: serverTimestamp(),
  });
}

export async function checkinGoal(
  uid: string,
  goalId: string,
  progress: number,
  note?: string
) {
  const db = getDbInstance();
  await updateDoc(doc(db, "users", uid, "goals", goalId), {
    progress: Math.max(0, Math.min(100, Math.round(progress))),
    ...(note !== undefined && { lastCheckinNote: note }),
    lastCheckinAt: serverTimestamp(),
    checkinCount: increment(1),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteGoal(uid: string, goalId: string) {
  const db = getDbInstance();
  await deleteDoc(doc(db, "users", uid, "goals", goalId));
}

export async function getGoals(uid: string): Promise<Goal[]> {
  const db = getDbInstance();
  const snap = await getDocs(collection(db, "users", uid, "goals"));
  const goals = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Goal);
  return sortGoals(goals);
}

export function onGoalsSnapshot(
  uid: string,
  callback: (goals: Goal[]) => void
): Unsubscribe {
  const db = getDbInstance();
  return onSnapshot(
    collection(db, "users", uid, "goals"),
    (snap) => {
      const goals = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Goal);
      callback(sortGoals(goals));
    },
    (error) => {
      console.warn("목표 리스너 에러:", error.message);
    }
  );
}

// 마감 임박순 정렬 (targetDate 없는 것은 뒤로)
function sortGoals(goals: Goal[]): Goal[] {
  return [...goals].sort((a, b) => {
    const aHas = !!a.targetDate;
    const bHas = !!b.targetDate;
    if (aHas && bHas) {
      return (a.targetDate!.toMillis() - b.targetDate!.toMillis());
    }
    if (aHas) return -1;
    if (bHas) return 1;
    // 둘 다 마감일 없음 → 최신 업데이트 우선
    const au = a.updatedAt?.toMillis?.() ?? 0;
    const bu = b.updatedAt?.toMillis?.() ?? 0;
    return bu - au;
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

// ── 데일리 체크리스트 CRUD ──────────────────────────
// 저장 위치: users/{uid}/dailyTasks/{taskId}
function kstDateString(date: Date = new Date()): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function yesterdayKst(): string {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return kstDateString(d);
}

export async function createDailyTask(
  uid: string,
  title: string,
  icon?: string
): Promise<string> {
  const db = getDbInstance();
  // 가장 마지막 order 값 찾기
  const existing = await getDocs(collection(db, "users", uid, "dailyTasks"));
  const maxOrder = existing.docs.reduce((max, d) => {
    const o = (d.data() as DailyTask).order ?? 0;
    return o > max ? o : max;
  }, -1);
  const ref = await addDoc(collection(db, "users", uid, "dailyTasks"), {
    title,
    ...(icon && { icon }),
    order: maxOrder + 1,
    streakCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateDailyTask(
  uid: string,
  taskId: string,
  updates: Partial<Pick<DailyTask, "title" | "icon" | "order">>
) {
  const db = getDbInstance();
  await updateDoc(doc(db, "users", uid, "dailyTasks", taskId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteDailyTask(uid: string, taskId: string) {
  const db = getDbInstance();
  await deleteDoc(doc(db, "users", uid, "dailyTasks", taskId));
}

/**
 * 오늘 체크 / 체크 해제 토글.
 * 체크: lastCompletedDate=today, 이전 값이 어제면 streak+1, 아니면 streak=1
 * 언체크: 체크 직전 값으로 롤백 (prevCompletedDate → lastCompletedDate)
 */
export async function toggleDailyTaskToday(uid: string, task: DailyTask) {
  const db = getDbInstance();
  const today = kstDateString();
  const yesterday = yesterdayKst();
  const isDoneToday = task.lastCompletedDate === today;

  if (isDoneToday) {
    // 언체크 → 직전 상태로 되돌림
    const prev = task.prevCompletedDate;
    const newStreak = prev && prev === yesterday ? Math.max(task.streakCount - 1, 0) : 0;
    await updateDoc(doc(db, "users", uid, "dailyTasks", task.id), {
      lastCompletedDate: prev ?? null,
      prevCompletedDate: null,
      streakCount: newStreak,
      updatedAt: serverTimestamp(),
    });
  } else {
    // 체크
    const newStreak = task.lastCompletedDate === yesterday ? task.streakCount + 1 : 1;
    await updateDoc(doc(db, "users", uid, "dailyTasks", task.id), {
      prevCompletedDate: task.lastCompletedDate ?? null,
      lastCompletedDate: today,
      streakCount: newStreak,
      updatedAt: serverTimestamp(),
    });
  }
}

export function onDailyTasksSnapshot(
  uid: string,
  callback: (tasks: DailyTask[]) => void
): Unsubscribe {
  const db = getDbInstance();
  return onSnapshot(
    collection(db, "users", uid, "dailyTasks"),
    (snap) => {
      const tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DailyTask);
      tasks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      callback(tasks);
    },
    (error) => {
      console.warn("데일리 체크리스트 리스너 에러:", error.message);
    }
  );
}

// ── 커스텀 페르소나 CRUD ────────────────────────────
// 저장 위치: users/{uid}/customPersonas/{personaId}
// 문서 ID는 "custom:xxxxx" 형식의 랜덤 token
function generateCustomPersonaId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 10; i++) token += chars.charAt(Math.floor(Math.random() * chars.length));
  return `custom:${token}`;
}

export async function createCustomPersona(
  uid: string,
  data: Pick<CustomPersona, "name" | "icon" | "description" | "systemPromptAddition">
): Promise<string> {
  const db = getDbInstance();
  const id = generateCustomPersonaId();
  await setDoc(doc(db, "users", uid, "customPersonas", id), {
    id,
    name: data.name,
    icon: data.icon || "✨",
    description: data.description || "",
    systemPromptAddition: data.systemPromptAddition,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
}

export async function updateCustomPersona(
  uid: string,
  id: string,
  updates: Partial<Pick<CustomPersona, "name" | "icon" | "description" | "systemPromptAddition">>
) {
  const db = getDbInstance();
  await updateDoc(doc(db, "users", uid, "customPersonas", id), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteCustomPersona(uid: string, id: string) {
  const db = getDbInstance();
  // 정시 뉴스 스케줄도 같이 지운다 (실패해도 페르소나 삭제는 진행 — 데이터 정합성보다 사용자 액션 우선)
  try {
    await deleteDoc(doc(db, "users", uid, "personaSchedules", id));
  } catch (err) {
    console.warn("[deleteCustomPersona] schedule 캐스케이드 실패:", err);
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
