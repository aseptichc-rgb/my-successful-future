import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
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
import type { User, ChatSession, ChatMessage, Invitation, InviteLink, NewsSource, NewsTopic, SessionType, UserPresence, AutoNewsConfig, PersonaId } from "@/types";

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
export async function addMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  sources: NewsSource[] = [],
  personaInfo?: { personaId: string; personaName: string; personaIcon: string },
  senderUid?: string,
  senderName?: string
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
