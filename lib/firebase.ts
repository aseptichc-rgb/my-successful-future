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
  OAuthProvider,
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
  addDoc,
  deleteDoc,
  serverTimestamp,
  onSnapshot,
  orderBy,
  limit as fsLimit,
  query,
  deleteField,
  documentId,
  startAt,
  endAt,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import { isIosNative, isAppleSignInCancelled, signInWithAppleNative } from "@/lib/nativeAuth";
import type {
  User,
  DailyEntry,
  DailyTodo,
  DailyMotivation,
  ExecutionPlan,
  FutureSelfAnswers,
  FutureVision,
  IdentityEvidenceDay,
  IdentityProgress,
  QuotePreference,
  UserLanguage,
} from "@/types";
import { composeFuturePersona, normalizeFutureSelfAnswers } from "@/lib/futureSelf";
import { SUCCESS_AFFIRMATION_MAX_LEN } from "@/lib/constants/goal";

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

/**
 * Sign in with Apple — Apple App Store Guideline 5.1.1(v) 의무 대응.
 *
 * 정책: 앱이 제3자 로그인(Google, Facebook 등) 을 제공하면 동등하게 Apple 로그인도
 * 제공해야 한다. iOS 빌드(Capacitor WebView) 에서는 반드시 노출되어야 하고, 안드로이드/
 * 일반 웹에서는 선택사항이지만 일관된 UX 를 위해 동일 진입점을 둔다.
 *
 * Firebase Console > Authentication > Sign-in method > Apple 활성화 + Apple Developer
 * 의 Service ID / Key ID / Team ID 를 등록해야 동작한다. 자세한 설정은
 * [README-IOS.md](../README-IOS.md) 의 "Firebase Apple Provider" 절 참고.
 */
const appleProvider = new OAuthProvider("apple.com");
appleProvider.addScope("email");
appleProvider.addScope("name");

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

/**
 * Apple OAuth 결과. Google 과 동일한 needsLink 디스패치 — 같은 이메일이 이미
 * 이메일/비밀번호 계정에 묶여 있으면 호출자가 비밀번호로 본인 인증 후
 * [linkAppleCredentialToEmailAccount] 로 두 provider 를 한 uid 에 합친다.
 */
export type AppleSignInResult =
  | { kind: "ok" }
  // 네이티브 Apple 시트를 사용자가 닫음 — 실패 아님. 호출부는 에러 없이 화면을 유지한다.
  | { kind: "cancelled" }
  | {
      kind: "needsLink";
      email: string;
      pendingCredential: AuthCredential;
      existingMethods: string[];
    };

/**
 * Apple 로그인 — 플랫폼에 따라 경로가 갈린다.
 *  · iOS 네이티브(Capacitor WKWebView): [signInWithAppleNative] 가 네이티브 ASAuthorizationController
 *    를 띄워 idToken/nonce 를 받고 JS SDK 의 signInWithCredential 로 세션을 만든다. 웹 popup 의
 *    크로스오리진 sessionStorage("missing initial state") 문제를 원천 차단한다.
 *  · 웹/안드로이드: 기존 `signInWithPopup` 경로. (WebView 가 아니라 popup 이 정상 동작.)
 *
 * needsLink 분기: 동일 이메일이 이미 이메일/비밀번호로 가입돼 있으면 Firebase 가
 * account-exists-with-different-credential 을 던진다(popup·credential 경로 공통). pending Apple
 * credential 을 보존해 호출자가 비밀번호 입력 → [linkAppleCredentialToEmailAccount] 로 합치게 한다.
 *
 * cancelled 분기: 네이티브 시트를 사용자가 닫으면 [isAppleSignInCancelled] 가 true → 실패가 아닌
 * 취소로 보고한다(호출부가 에러 토스트 없이 로그인 화면 유지).
 */
export async function signInWithApple(): Promise<AppleSignInResult> {
  try {
    if (isIosNative()) {
      await signInWithAppleNative(getAuthInstance());
    } else {
      await signInWithPopup(getAuthInstance(), appleProvider);
    }
    return { kind: "ok" };
  } catch (err) {
    if (isAppleSignInCancelled(err)) return { kind: "cancelled" };
    if (err instanceof FirebaseError && err.code === "auth/account-exists-with-different-credential") {
      const pendingCredential = OAuthProvider.credentialFromError(err);
      const email = (err.customData?.email as string | undefined) ?? "";
      if (!pendingCredential || !email) throw err;
      const existingMethods = await fetchSignInMethodsForEmail(getAuthInstance(), email).catch(
        () => [] as string[],
      );
      return { kind: "needsLink", email, pendingCredential, existingMethods };
    }
    throw err;
  }
}

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

/**
 * 기존 이메일/비밀번호 계정에 보류된 Apple credential 을 연결.
 * Google 흐름과 동일 — provider 만 다르다.
 */
export async function linkAppleCredentialToEmailAccount(
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
  // 프로필 문서 생성 실패를 가입 실패로 승격시키면 안 된다 — Auth 계정은 이미 만들어져
  // 사용자에게는 "실패" 로 보이지만 재시도는 email-already-in-use 로 영영 막힌다.
  // 문서는 이후 온보딩의 merge:true 쓰기들로 채워지므로 1회 재시도 후 가입은 성공 처리.
  try {
    await createUserProfile(credential.user.uid, displayName, email);
  } catch {
    try {
      await createUserProfile(credential.user.uid, displayName, email);
    } catch (err) {
      console.error("[signUp] 프로필 문서 생성 실패 — 가입은 계속 진행:", err);
    }
  }
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

/**
 * "10년 후 나의 모습" 구조화 답변 저장.
 * futureSelfAnswers(구조화) 와 함께, 합성한 futurePersona(레거시 문자열)도
 * 같은 쓰기로 갱신해 기존 AI 소비처(카드/비전/정체성/작가추천)가 그대로 동작하게 한다.
 */
export async function updateFutureSelf(uid: string, answers: FutureSelfAnswers) {
  const cleaned = normalizeFutureSelfAnswers(answers);
  const db = getDbInstance();
  await setDoc(
    doc(db, "users", uid),
    {
      futureSelfAnswers: cleaned,
      futureSelfAnswersUpdatedAt: serverTimestamp(),
      futurePersona: composeFuturePersona(cleaned),
      futurePersonaUpdatedAt: serverTimestamp(),
    },
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
// 길이 상한은 lib/constants/goal.ts 가 단일 정의 — 순수 모듈(lib/goalText 등)이
// Firebase SDK 를 끌어오지 않고도 같은 값을 봐야 하기 때문이다. 기존 import 경로 호환을 위해 재수출한다.
export { SUCCESS_AFFIRMATION_MAX_LEN };

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
  onError?: (err: Error) => void,
): Unsubscribe {
  const db = getDbInstance();
  return onSnapshot(
    doc(db, "users", uid, "dailyEntries", ymd),
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      callback({ ymd, ...snap.data() } as DailyEntry);
    },
    (err) => {
      console.error("[onDailyEntrySnapshot] 구독 실패:", err);
      onError?.(err);
    },
  );
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
  onError?: (err: Error) => void,
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
    (err) => {
      console.error("[onDailyMotivationSnapshot] 구독 실패:", err);
      onError?.(err);
    },
  );
}

// ── 미래 일상 비전 구독 ───────────────────────────
/**
 * users/{uid}/futureVisions/{ymd} 문서를 구독한다.
 * 서버(Admin SDK, /api/future-vision)가 문서를 만들거나 갱신하면 즉시 콜백으로 흘려보낸다.
 * 동기부여 카드(onDailyMotivationSnapshot)와 동일한 패턴.
 */
export function onFutureVisionSnapshot(
  uid: string,
  ymd: string,
  callback: (v: FutureVision | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const db = getDbInstance();
  return onSnapshot(
    doc(db, "users", uid, "futureVisions", ymd),
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      callback(snap.data() as FutureVision);
    },
    // 권한/네트워크 오류 시 onSnapshot 은 성공 콜백을 영영 호출하지 않는다.
    // 핸들러가 없으면 구독자가 로딩 상태에 갇혀 카드가 스켈레톤으로 멈춘다 → 반드시 신호한다.
    (err) => {
      console.error("[onFutureVisionSnapshot] 구독 실패:", err);
      onError?.(err);
    },
  );
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
  onError?: (err: Error) => void,
): Unsubscribe {
  const db = getDbInstance();
  return onSnapshot(
    doc(db, "users", uid, "affirmationLogs", ymd),
    (snap) => {
      callback(snap.exists());
    },
    (err) => {
      console.error("[onAffirmationCheckinSnapshot] 구독 실패:", err);
      onError?.(err);
    },
  );
}

// ── 정체성 진행도 구독 ──────────────────────────────
/**
 * 사용자의 모든 정체성 라벨별 진행도를 실시간으로 받는다.
 * 라벨이 새로 생기거나 카운터가 올라갈 때마다 콜백이 호출된다.
 */
export function onIdentityProgressSnapshot(
  uid: string,
  callback: (entries: IdentityProgress[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const db = getDbInstance();
  return onSnapshot(
    collection(db, "users", uid, "identityProgress"),
    (snap) => {
      const list: IdentityProgress[] = snap.docs.map((d) => d.data() as IdentityProgress);
      callback(list);
    },
    (err) => {
      console.error("[onIdentityProgressSnapshot] 구독 실패:", err);
      onError?.(err);
    },
  );
}

// ── WOOP 실행설계 (if-then) ─────────────────────────
export const MAX_EXECUTION_PLANS = 10;
export const EXECUTION_PLAN_FIELD_MAX = 120;

/** ExecutionPlan + 문서 ID — 목록/수정/삭제 UI 가 함께 쓴다. */
export interface ExecutionPlanWithId extends ExecutionPlan {
  id: string;
}

/** 저장 전 필드 정리 — trim + 길이 클램프 (서버 규칙이 아닌 클라 컨벤션 계층). */
function normalizePlanField(s: string): string {
  return s.trim().slice(0, EXECUTION_PLAN_FIELD_MAX);
}

/**
 * 실행설계 목록 구독 — createdAt asc 고정 정렬.
 * pickTodayPlan(lib/planRotation.ts) 의 회전 인덱스가 클라/서버에서 같으려면
 * 순서가 안정적이어야 한다(위젯 라우트도 동일 정렬 사용).
 */
export function onExecutionPlansSnapshot(
  uid: string,
  callback: (plans: ExecutionPlanWithId[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const db = getDbInstance();
  const q = query(collection(db, "users", uid, "executionPlans"), orderBy("createdAt", "asc"));
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() as ExecutionPlan) })));
    },
    (err) => {
      console.error("[onExecutionPlansSnapshot] 구독 실패:", err);
      onError?.(err);
    },
  );
}

/**
 * 실행설계 저장. planId 를 주면 수정(merge), null 이면 신규 생성.
 * identityTag 는 값이 없으면 키 자체를 넣지 않는다(Firestore undefined 거부).
 */
export async function saveExecutionPlan(
  uid: string,
  planId: string | null,
  plan: {
    goal: string;
    outcome: string;
    obstacle: string;
    ifText: string;
    thenText: string;
    identityTag?: string;
    active?: boolean;
  },
): Promise<void> {
  const db = getDbInstance();
  const identityTag = plan.identityTag?.trim();
  const data = {
    goal: normalizePlanField(plan.goal),
    outcome: normalizePlanField(plan.outcome),
    obstacle: normalizePlanField(plan.obstacle),
    ifText: normalizePlanField(plan.ifText),
    thenText: normalizePlanField(plan.thenText),
    ...(identityTag ? { identityTag } : {}),
    active: plan.active ?? true,
    updatedAt: serverTimestamp(),
  };
  if (planId) {
    await setDoc(doc(db, "users", uid, "executionPlans", planId), data, { merge: true });
  } else {
    await addDoc(collection(db, "users", uid, "executionPlans"), {
      ...data,
      createdAt: serverTimestamp(),
    });
  }
}

export async function deleteExecutionPlan(uid: string, planId: string): Promise<void> {
  const db = getDbInstance();
  await deleteDoc(doc(db, "users", uid, "executionPlans", planId));
}

// ── "내일 첫 행동 1개" (저녁 모드) ───────────────────
export const TOMORROW_FIRST_ACTION_MAX = 140;

/**
 * 저녁 모드에서 적는 "내일 첫 행동 1개" 저장 — 오늘 dailyEntries 문서에 merge.
 * 다음 날 아침 카드가 "어제의 내가 정한 첫 행동"으로 어제 문서에서 읽어간다.
 */
export async function saveTomorrowFirstAction(
  uid: string,
  ymd: string,
  text: string,
): Promise<void> {
  const db = getDbInstance();
  await setDoc(
    doc(db, "users", uid, "dailyEntries", ymd),
    { ymd, tomorrowFirstAction: text.slice(0, TOMORROW_FIRST_ACTION_MAX), updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/** 특정 날짜의 dailyEntry 단건 조회 — 아침 카드가 "어제 문서"를 읽을 때 사용. */
export async function getDailyEntryOnce(uid: string, ymd: string): Promise<DailyEntry | null> {
  const db = getDbInstance();
  const snap = await getDoc(doc(db, "users", uid, "dailyEntries", ymd));
  if (!snap.exists()) return null;
  return { ymd, ...snap.data() } as DailyEntry;
}

// ── 진행 화면(/progress) 조회 ───────────────────────
/**
 * 기간 내 체크인한 날짜(ymd) 목록 — 30일 히트맵/일관성 % 데이터 소스.
 * affirmationLogs 문서 ID 가 KST YYYY-MM-DD 라 documentId() 레인지 쿼리로 충분하다
 * (별도 인덱스 불필요).
 */
export async function getAffirmationLogYmds(
  uid: string,
  fromYmd: string,
  toYmd: string,
): Promise<string[]> {
  const db = getDbInstance();
  const q = query(
    collection(db, "users", uid, "affirmationLogs"),
    orderBy(documentId()),
    startAt(fromYmd),
    endAt(toYmd),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.id);
}

/**
 * 기간 내 정체성 증거 장부 조회(최신 날짜 먼저 반환) — /progress 최근 증거 피드용.
 */
export async function getIdentityEvidenceRange(
  uid: string,
  fromYmd: string,
  toYmd: string,
): Promise<IdentityEvidenceDay[]> {
  const db = getDbInstance();
  const q = query(
    collection(db, "users", uid, "identityEvidence"),
    orderBy(documentId()),
    startAt(fromYmd),
    endAt(toYmd),
  );
  const snap = await getDocs(q);
  const days = snap.docs.map((d) => ({ ...(d.data() as IdentityEvidenceDay), ymd: d.id }));
  return days.reverse();
}
