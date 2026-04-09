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
  query,
  where,
  orderBy,
  Timestamp,
  serverTimestamp,
  onSnapshot,
  arrayUnion,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import type { User, ChatSession, ChatMessage, Invitation, NewsSource, NewsTopic } from "@/types";

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

// ── 세션 CRUD ─────────────────────────────────────────
export async function createSession(uid: string, title: string, displayName: string = ""): Promise<string> {
  const db = getDbInstance();
  const ref = await addDoc(collection(db, "sessions"), {
    uid,
    title,
    participants: [uid],
    participantNames: { [uid]: displayName || "나" },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getSessions(uid: string): Promise<ChatSession[]> {
  const db = getDbInstance();
  // 참여 중인 모든 세션 조회 (본인 생성 + 초대받은 세션)
  const q = query(
    collection(db, "sessions"),
    where("participants", "array-contains", uid),
    orderBy("updatedAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ChatSession);
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
  await updateDoc(doc(db, "sessions", sessionId), {
    updatedAt: serverTimestamp(),
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
  return onSnapshot(q, (snap) => {
    const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ChatMessage);
    callback(msgs);
  });
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
  return onSnapshot(q, (snap) => {
    const invites = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Invitation);
    callback(invites);
  });
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
