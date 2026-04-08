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
  type Firestore,
} from "firebase/firestore";
import type { User, ChatSession, ChatMessage, NewsSource, NewsTopic } from "@/types";

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
export async function createSession(uid: string, title: string): Promise<string> {
  const db = getDbInstance();
  const ref = await addDoc(collection(db, "sessions"), {
    uid,
    title,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getSessions(uid: string): Promise<ChatSession[]> {
  const db = getDbInstance();
  const q = query(
    collection(db, "sessions"),
    where("uid", "==", uid),
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
  personaInfo?: { personaId: string; personaName: string; personaIcon: string }
): Promise<string> {
  const db = getDbInstance();
  const ref = await addDoc(collection(db, "messages"), {
    sessionId,
    role,
    content,
    sources,
    ...(personaInfo && personaInfo),
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
