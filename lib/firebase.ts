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
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
  onSnapshot,
  orderBy,
  limit as fsLimit,
  query,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import type {
  User,
  DailyEntry,
  DailyTodo,
  DailyMotivation,
  IdentityProgress,
  QuotePreference,
} from "@/types";

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

// ── 유저 프로필 ───────────────────────────────────────
export async function createUserProfile(uid: string, displayName: string, email: string) {
  const db = getDbInstance();
  await setDoc(doc(db, "users", uid), {
    displayName,
    email,
    createdAt: serverTimestamp(),
  });
}

export async function getUserProfile(uid: string): Promise<User | null> {
  const db = getDbInstance();
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return { uid: snap.id, ...snap.data() } as User;
}

/** "10년 후의 나의 모습" 텍스트 — 동기부여 카드 생성에 컨텍스트로 쓰인다. */
export async function updateFuturePersona(uid: string, futurePersona: string) {
  const db = getDbInstance();
  await setDoc(
    doc(db, "users", uid),
    { futurePersona, futurePersonaUpdatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function markOnboarded(uid: string) {
  const db = getDbInstance();
  await setDoc(doc(db, "users", uid), { onboardedAt: serverTimestamp() }, { merge: true });
}

// ── 사용자 목표 ──────────────────────────────────────
export const MAX_USER_GOALS = 10;

export async function updateUserGoals(uid: string, goals: string[]) {
  const db = getDbInstance();
  const cleaned = goals
    .map((g) => g.trim())
    .filter((g) => g.length > 0)
    .slice(0, MAX_USER_GOALS);
  await setDoc(
    doc(db, "users", uid),
    { goals: cleaned, goalsUpdatedAt: serverTimestamp() },
    { merge: true },
  );
}

// ── 오늘의 명언 큐레이션 설정 ──────────────────────
export const QUOTE_PINNED_DAYS_MIN = 0;
export const QUOTE_PINNED_DAYS_MAX = 7;

export async function updateQuotePreference(uid: string, pref: QuotePreference) {
  const db = getDbInstance();
  const author = pref.pinnedAuthor?.trim();
  const daysRaw = pref.pinnedDaysPerWeek;
  const days =
    typeof daysRaw === "number" && Number.isFinite(daysRaw)
      ? Math.max(QUOTE_PINNED_DAYS_MIN, Math.min(QUOTE_PINNED_DAYS_MAX, Math.floor(daysRaw)))
      : undefined;
  const next: QuotePreference = {};
  if (author) next.pinnedAuthor = author;
  if (typeof days === "number") next.pinnedDaysPerWeek = days;
  await setDoc(
    doc(db, "users", uid),
    { quotePreference: next, quotePreferenceUpdatedAt: serverTimestamp() },
    { merge: true },
  );
}

// ── 일일 엔트리 (할 일 / 잘한 일 / 달성 목표) ────────
export const MAX_DAILY_WINS = 3;

export function getKstYmd(date: Date = new Date()): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

export function onDailyEntrySnapshot(
  uid: string,
  ymd: string,
  callback: (entry: DailyEntry | null) => void,
): Unsubscribe {
  const db = getDbInstance();
  return onSnapshot(doc(db, "users", uid, "dailyEntries", ymd), (snap) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }
    callback({ ymd, ...snap.data() } as DailyEntry);
  });
}

export async function saveDailyTodos(uid: string, ymd: string, todos: DailyTodo[]) {
  const db = getDbInstance();
  await setDoc(
    doc(db, "users", uid, "dailyEntries", ymd),
    { ymd, todos, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function saveDailyWins(uid: string, ymd: string, wins: string[]) {
  const cleaned = wins.slice(0, MAX_DAILY_WINS);
  const db = getDbInstance();
  await setDoc(
    doc(db, "users", uid, "dailyEntries", ymd),
    { ymd, wins: cleaned, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/**
 * 잘한 일(wins) 기록 히스토리 조회.
 * `ymd` 필드(YYYY-MM-DD KST) 내림차순으로 최신 날짜부터 가져온다.
 * 빈 문자열만 있는 날짜는 제외해서 "기록한 날"만 보여준다.
 */
export const WINS_HISTORY_DEFAULT_LIMIT = 60;

export async function getDailyWinsHistory(
  uid: string,
  limitCount: number = WINS_HISTORY_DEFAULT_LIMIT,
): Promise<{ ymd: string; wins: string[] }[]> {
  const db = getDbInstance();
  const colRef = collection(db, "users", uid, "dailyEntries");
  const q = query(colRef, orderBy("ymd", "desc"), fsLimit(limitCount));
  const snap = await getDocs(q);
  const result: { ymd: string; wins: string[] }[] = [];
  snap.forEach((d) => {
    const data = d.data() as Partial<DailyEntry>;
    const wins = Array.isArray(data.wins)
      ? data.wins.map((w) => (typeof w === "string" ? w.trim() : "")).filter((w) => w.length > 0)
      : [];
    if (wins.length === 0) return;
    result.push({ ymd: d.id, wins });
  });
  return result;
}

export async function saveDailyAchievedGoals(uid: string, ymd: string, achieved: string[]) {
  const db = getDbInstance();
  await setDoc(
    doc(db, "users", uid, "dailyEntries", ymd),
    { ymd, achievedGoals: achieved, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

// ── 오늘의 동기부여 카드 구독 ───────────────────────
export function onDailyMotivationSnapshot(
  uid: string,
  ymd: string,
  callback: (m: DailyMotivation | null) => void,
): Unsubscribe {
  const db = getDbInstance();
  return onSnapshot(doc(db, "users", uid, "dailyMotivations", ymd), (snap) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }
    callback(snap.data() as DailyMotivation);
  });
}

// ── 정체성 진행도 구독 ──────────────────────────────
/**
 * 사용자의 모든 정체성 라벨별 진행도를 실시간으로 받는다.
 * 라벨이 새로 생기거나 카운터가 올라갈 때마다 콜백이 호출된다.
 */
export function onIdentityProgressSnapshot(
  uid: string,
  callback: (entries: IdentityProgress[]) => void,
): Unsubscribe {
  const db = getDbInstance();
  return onSnapshot(collection(db, "users", uid, "identityProgress"), (snap) => {
    const list: IdentityProgress[] = snap.docs.map((d) => d.data() as IdentityProgress);
    callback(list);
  });
}
