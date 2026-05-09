import { initializeApp, getApps, getApp, FirebaseError, type FirebaseApp } from "firebase/app";
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
  fetchSignInMethodsForEmail,
  linkWithCredential,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  onIdTokenChanged,
  type Auth,
  type AuthCredential,
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
  deleteField,
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
  UserLanguage,
} from "@/types";

const SUPPORTED_LANGUAGES: ReadonlyArray<UserLanguage> = ["ko", "en", "es", "zh"];

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

/**
 * Google 로그인 결과.
 * - ok: 정상 로그인 완료.
 * - needsLink: 같은 이메일로 이미 이메일/비밀번호 계정이 있어 Firebase 가
 *   account-exists-with-different-credential 을 던진 케이스. 호출자는 사용자에게
 *   비밀번호를 입력받아 [linkGoogleCredentialToEmailAccount] 로 두 provider 를 합쳐야 한다.
 */
export type GoogleSignInResult =
  | { kind: "ok" }
  | {
      kind: "needsLink";
      email: string;
      pendingCredential: AuthCredential;
      existingMethods: string[];
    };

export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  try {
    await signInWithPopup(getAuthInstance(), googleProvider);
    return { kind: "ok" };
  } catch (err) {
    // 동일 이메일이 이미 다른 provider(이메일/비밀번호)로 가입된 경우.
    // pending Google credential 을 보존했다가, 사용자가 기존 비밀번호로 인증하면
    // linkWithCredential 로 두 provider 를 한 uid 에 묶는다.
    if (err instanceof FirebaseError && err.code === "auth/account-exists-with-different-credential") {
      const pendingCredential = GoogleAuthProvider.credentialFromError(err);
      const email = (err.customData?.email as string | undefined) ?? "";
      if (!pendingCredential || !email) throw err;
      // 이메일 enumeration protection 이 켜져 있으면 빈 배열이 올 수 있다 — 그래도 needsLink 로 진행.
      const existingMethods = await fetchSignInMethodsForEmail(getAuthInstance(), email).catch(() => [] as string[]);
      return { kind: "needsLink", email, pendingCredential, existingMethods };
    }
    throw err;
  }
}

/**
 * 기존 이메일/비밀번호 계정에 보류된 Google credential 을 연결.
 * 흐름: signInWithEmailAndPassword 로 본인 인증 → linkWithCredential 로 Google provider 추가.
 * 다음번부터는 두 방식 어느 쪽으로도 같은 uid 에 로그인할 수 있다.
 */
export async function linkGoogleCredentialToEmailAccount(
  email: string,
  password: string,
  pendingCredential: AuthCredential,
) {
  const cred = await signInWithEmailAndPassword(getAuthInstance(), email, password);
  await linkWithCredential(cred.user, pendingCredential);
  return cred;
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

/**
 * UI / 매일 카드 언어 저장. 알 수 없는 코드는 무시한다.
 * 변경 즉시 다음 daily-motivation 호출부터 새 언어로 반영된다.
 */
export async function updateUserLanguage(uid: string, language: UserLanguage): Promise<void> {
  if (!SUPPORTED_LANGUAGES.includes(language)) return;
  const db = getDbInstance();
  await setDoc(
    doc(db, "users", uid),
    { language, languageUpdatedAt: serverTimestamp() },
    { merge: true },
  );
}

// ── "성공한 나의 모습" 다짐 ────────────────────────
export const MAX_SUCCESS_AFFIRMATIONS = 10;
export const SUCCESS_AFFIRMATION_MAX_LEN = 60;

/**
 * 다짐 배열 정규화 — 공백 trim, 빈 항목 제거, 길이 제한, 중복 제거, 최대 N개로 컷.
 * 클라/서버 양쪽에서 같은 결과를 내야 매일의 placeholder 와 입력 비교가 일관된다.
 */
export function normalizeAffirmations(raw: ReadonlyArray<unknown>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim().slice(0, SUCCESS_AFFIRMATION_MAX_LEN);
    if (trimmed.length === 0) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= MAX_SUCCESS_AFFIRMATIONS) break;
  }
  return out;
}

export async function updateSuccessAffirmations(uid: string, affirmations: string[]) {
  const cleaned = normalizeAffirmations(affirmations);
  const db = getDbInstance();
  await setDoc(
    doc(db, "users", uid),
    {
      successAffirmations: cleaned,
      successAffirmationsUpdatedAt: serverTimestamp(),
    },
    { merge: true },
  );
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
  // setDoc({merge:true}) 는 중첩 객체를 deep merge 하므로, 핀 해제 의도(빈 author/0 days)는
  // 키를 빠뜨리는 게 아니라 deleteField() 로 명시적으로 지워야 기존 값이 살아남지 않는다.
  const next: Record<string, unknown> = {};
  next.pinnedAuthor = author ? author : deleteField();
  next.pinnedDaysPerWeek = typeof days === "number" ? days : deleteField();
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

// ── 다짐 따라쓰기 오늘 체크인 여부 구독 ───────────
/**
 * users/{uid}/affirmationLogs/{ymd} 의 존재 여부를 콜백으로 흘려보낸다.
 * 서버 트랜잭션이 doc 을 만들면 즉시 true 가 들어와 UI 가 잠긴다.
 */
export function onAffirmationCheckinSnapshot(
  uid: string,
  ymd: string,
  callback: (checkedIn: boolean) => void,
): Unsubscribe {
  const db = getDbInstance();
  return onSnapshot(doc(db, "users", uid, "affirmationLogs", ymd), (snap) => {
    callback(snap.exists());
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
