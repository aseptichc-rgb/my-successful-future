"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  getAuth_,
  onIdTokenChanged,
  signInWithEmail,
  signInWithGoogle,
  signInWithApple,
  linkGoogleCredentialToEmailAccount,
  linkAppleCredentialToEmailAccount,
  signInWithCustomTokenClient,
  signUp as firebaseSignUp,
  signOut as firebaseSignOut,
  getUserProfile,
  type FirebaseUser,
  type GoogleSignInResult,
  type AppleSignInResult,
} from "@/lib/firebase";
import type { AuthCredential } from "firebase/auth";
import { shouldStartTrial } from "@/lib/entitlement";
import {
  fireAndroidAuthBridge,
  installUserGestureTracker,
  notifyAndroidSignOut,
} from "@/lib/widgetBridge";
import type { User } from "@/types";

interface AuthContextValue {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signInGoogle: () => Promise<GoogleSignInResult>;
  signInApple: () => Promise<AppleSignInResult>;
  linkGoogleToEmailPassword: (
    email: string,
    password: string,
    pendingCredential: AuthCredential,
  ) => Promise<void>;
  linkAppleToEmailPassword: (
    email: string,
    password: string,
    pendingCredential: AuthCredential,
  ) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function syncServerSession(idToken: string): Promise<void> {
  try {
    await fetch("/api/session/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
      credentials: "same-origin",
    });
  } catch {
    // 일시 장애는 다음 토큰 갱신 사이클에 재시도
  }
}

async function clearServerSession(): Promise<void> {
  try {
    await fetch("/api/session/logout", { method: "POST", credentials: "same-origin" });
  } catch {
    // 로그아웃은 어떻든 진행
  }
}

/**
 * 처음 로그인한 사용자에게 14일 무료 체험을 켠다.
 * 이미 paid 또는 trialEndsAt 이 박힌 사용자는 서버가 멱등하게 no-op 응답을 준다.
 * customToken 이 돌아오면 즉시 재로그인 → 다음 ID 토큰부터 trialEndsAt claim 이 반영된다.
 */
async function ensureTrialStarted(fbUser: FirebaseUser): Promise<boolean> {
  try {
    const tokenResult = await fbUser.getIdTokenResult();
    const claims = tokenResult.claims as Record<string, unknown>;
    if (!shouldStartTrial(claims)) return false;

    const idToken = await fbUser.getIdToken();
    const res = await fetch("/api/auth/start-trial", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` },
      credentials: "same-origin",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { customToken?: string; alreadyStarted?: boolean };
    if (data.alreadyStarted) return false;
    if (!data.customToken) return false;
    await signInWithCustomTokenClient(data.customToken);
    return true;
  } catch {
    // 일시 오류는 다음 토큰 갱신 사이클에 다시 시도된다.
    return false;
  }
}

/**
 * TWA(안드로이드 네이티브 앱) 안에서 띄워진 세션인지 판정.
 * MainActivity 가 TWA 를 띄울 때 ?fromApp=1 을 쿼리에 붙여주므로 그 값을 sessionStorage 에
 * 저장해두고 이후 라우팅 사이에도 유지한다. document.referrer (android-app://...) 도 보조로 본다.
 */
const NATIVE_BRIDGE_LAST_UID_KEY = "anima.nativeBridge.lastUid";
const NATIVE_BRIDGE_LAST_AT_KEY = "anima.nativeBridge.lastAt";
// "네이티브 앱이 이 uid 로 이미 인증돼 있음이 확인됨" 마커. nativeToken(네이티브→웹 SSO)을
// 소비한 순간 = 네이티브가 그 토큰을 발급했다 = 네이티브 FirebaseAuth 인증 완료가 보장된다.
// 이 uid 로는 세션 내내 브릿지를 발화할 필요가 전혀 없다 — 60초 재시도 윈도우와 무관하게
// 영구 skip 해, 진입·토큰갱신 때마다 intent 가 발화돼 Chrome "계속" 확인창이 뜨던 회귀를 막는다.
const NATIVE_BRIDGE_CONFIRMED_UID_KEY = "anima.nativeBridge.confirmedUid";
const FROM_APP_FLAG_KEY = "anima.fromApp";
// Chrome 의 intent:// iframe 차단 + 네트워크 변동성으로 브릿지가 한 번에 안 닿는 경우가 있다.
// "마지막 발사 후 X ms 가 지나면 같은 uid 라도 한번 더 시도한다" 는 짧은 재시도 윈도우.
// 사용자 입장에선 "위젯이 비어있다 → 새로고침 또는 페이지 이동 → 채워짐" 패턴으로 자가 봉합.
const NATIVE_BRIDGE_RETRY_AFTER_MS = 60_000;

function isInsideAndroidApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("fromApp") === "1") {
      window.sessionStorage.setItem(FROM_APP_FLAG_KEY, "1");
      return true;
    }
    if (window.sessionStorage.getItem(FROM_APP_FLAG_KEY) === "1") return true;
    if (document.referrer.startsWith("android-app://com.michaelkim.anima")) {
      window.sessionStorage.setItem(FROM_APP_FLAG_KEY, "1");
      return true;
    }
  } catch {
    // sessionStorage 차단 환경 — 브릿지 건너뛴다 (실패해도 웹 동작엔 영향 없음).
  }
  return false;
}

/**
 * 웹 세션을 네이티브 FirebaseAuth 로 옮겨주는 단방향 브릿지.
 *
 * 동일 uid 로 이번 세션에 이미 브릿지를 쏜 적이 있고 [NATIVE_BRIDGE_RETRY_AFTER_MS] 가 지나지
 * 않았으면 no-op. 그 윈도우가 지나면 다시 쏜다 — Chrome 이 intent 를 한 번 막더라도 두 번째
 * 라우팅/포커스에서 자가 봉합되도록.
 *
 * 발화 방식: [fireAndroidAuthBridge] (widgetBridge 공용 발화기) — user activation 이 살아
 * 있을 때만 iframe + <a>.click + form 다중 경로로 발화한다. 제스처 없이 발화하면 Chrome 이
 * "앱으로 이동 [계속]" 확인창을 띄우므로 그 경우 발화 자체를 건너뛴다.
 *
 * 보안: customToken 은 URL 쿼리에 실리지만, TWA → Android intent 경로는 OS 내부 IPC 로
 * 브라우저 히스토리/Referer 에 남지 않는다. 토큰의 짧은 수명(약 1시간)도 추가 방어선.
 */
/**
 * 웹 세션(fbUser)의 ID 토큰을 서버(/api/auth/native-bridge)에 제출해, 네이티브 FirebaseAuth 가
 * 같은 uid 로 로그인할 수 있는 Firebase custom token 을 받아온다. 실패(미로그인·네트워크·서버
 * 오류)는 모두 null 로 정규화 — 호출부는 "토큰 있으면 브릿지에 전달, 없으면 생략" 만 판단한다.
 *
 * 재사용처: (1) bridgeToNativeIfNeeded 의 auth 브릿지 발화, (2) 결제 브릿지 — 네이티브가 아직
 * 미로그인이어도 결제 직전 이 토큰으로 로그인해 결제를 진행하게 한다.
 */
export async function fetchNativeBridgeToken(
  fbUser: FirebaseUser | null,
): Promise<string | null> {
  if (!fbUser) return null;
  try {
    const idToken = await fbUser.getIdToken();
    if (!idToken) return null;
    const res = await fetch("/api/auth/native-bridge", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` },
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { customToken?: string };
    return data.customToken ?? null;
  } catch {
    // 네트워크/JSON 오류 — 호출부가 토큰 없이(생략) 진행하도록 null.
    return null;
  }
}

async function bridgeToNativeIfNeeded(fbUser: FirebaseUser): Promise<void> {
  if (!isInsideAndroidApp()) return;
  // 네이티브 인증이 이미 확인된 uid(nativeToken SSO 로 진입) 는 브릿지가 100% 불필요 —
  // 발화하면 Chrome "계속" 확인창/빈 화면 인터럽트만 생긴다. 세션 내내 영구 skip.
  let lastUid: string | null = null;
  let lastAt = 0;
  try {
    if (window.sessionStorage.getItem(NATIVE_BRIDGE_CONFIRMED_UID_KEY) === fbUser.uid) return;
    lastUid = window.sessionStorage.getItem(NATIVE_BRIDGE_LAST_UID_KEY);
    const rawAt = window.sessionStorage.getItem(NATIVE_BRIDGE_LAST_AT_KEY);
    lastAt = rawAt ? parseInt(rawAt, 10) || 0 : 0;
  } catch {
    // sessionStorage 차단 — 매번 시도하더라도 idempotent 하므로 진행.
  }
  const now = Date.now();
  if (lastUid === fbUser.uid && now - lastAt < NATIVE_BRIDGE_RETRY_AFTER_MS) return;

  try {
    const customToken = await fetchNativeBridgeToken(fbUser);
    if (!customToken) return;

    // user activation 이 살아 있을 때만 실제 발화된다 (widgetBridge 가 게이트).
    // 제스처 없이 발화하면 Chrome 이 "앱으로 이동 [계속]" 확인창을 띄우므로,
    // 그 경우 발화를 건너뛰고 다음 제스처 동반 사이클(재시도 윈도우)에 맡긴다.
    const fired = fireAndroidAuthBridge(customToken);

    // 마커는 실제로 발화된 경우에만 박는다 — 게이트에 걸려 건너뛴 경우 마커를 박으면
    // 재시도 윈도우가 헛돌아 위젯이 EmptyState 에 갇힐 수 있다.
    if (fired) {
      try {
        window.sessionStorage.setItem(NATIVE_BRIDGE_LAST_UID_KEY, fbUser.uid);
        window.sessionStorage.setItem(NATIVE_BRIDGE_LAST_AT_KEY, String(now));
      } catch {
        // 무시 — 다음 라우팅에서 또 한 번 쏘게 되지만 네이티브 쪽이 멱등.
      }
    }
  } catch {
    // 네트워크/JSON 오류 — 다음 로그인 사이클에 다시 시도 (lastUid 기록 안 했으므로).
  }
}

async function tryRestoreFromServerCookie(): Promise<boolean> {
  try {
    const res = await fetch("/api/session/refresh", { method: "GET", credentials: "same-origin" });
    if (!res.ok) return false;
    const { customToken } = (await res.json()) as { customToken?: string };
    if (!customToken) return false;
    await signInWithCustomTokenClient(customToken);
    return true;
  } catch {
    return false;
  }
}

/**
 * 네이티브 → 웹 SSO: TWA URL 에 ?nativeToken=<customToken> 가 실려 들어오면 한 번만 소비해
 * Firebase 클라이언트 세션을 시작/교체한다. 토큰은 단발성 + 짧은 수명이라 사용 직후 URL 에서 제거.
 *
 * 중요: 웹에 이미 다른(오래된) 계정 세션이 남아 있어도 nativeToken 이 있으면 그쪽으로 전환한다.
 * nativeToken 은 이 웹뷰를 띄운 네이티브 앱의 현재 계정 = 위젯이 보는 계정이므로,
 * "이 화면이 어느 계정이어야 하는지"의 권위 소스다. 무시하면 위젯과 홈이 영구히 어긋난다.
 *
 * 만료/위변조 토큰은 signInWithCustomToken 이 거절 → 사용자는 평소처럼 수동 로그인.
 */
async function tryConsumeNativeToken(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  let token: string | null = null;
  try {
    const url = new URL(window.location.href);
    token = url.searchParams.get("nativeToken");
    if (!token) return false;
    url.searchParams.delete("nativeToken");
    window.history.replaceState({}, "", url.toString());
  } catch {
    return false;
  }
  try {
    const cred = await signInWithCustomTokenClient(token);
    // 네이티브가 이 토큰을 발급했다 = 이미 동일 uid 로 네이티브 FirebaseAuth 가 인증돼 있다.
    // 따라서 이 uid 로는 세션 내내 브릿지 발화가 전혀 필요 없다 — CONFIRMED 마커로 영구 skip.
    // (과거엔 lastUid 만 박고 lastAt 을 안 박아, 60초 재시도 윈도우 계산이 0 으로 평가되며
    //  진입 때마다 intent://auth 가 재발화 → Chrome "계속" 확인창이 매번 뜨던 회귀가 있었다.)
    try {
      window.sessionStorage.setItem(NATIVE_BRIDGE_CONFIRMED_UID_KEY, cred.user.uid);
      window.sessionStorage.setItem(NATIVE_BRIDGE_LAST_UID_KEY, cred.user.uid);
      window.sessionStorage.setItem(NATIVE_BRIDGE_LAST_AT_KEY, String(Date.now()));
    } catch {
      // sessionStorage 차단 — 브릿지가 발화될 수 있지만 user-activation 게이트가 확인창을 막는다.
    }
    return true;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const restoreAttemptedRef = useRef(false);
  // uid 별로 트라이얼 시작 시도 여부 — customToken 재로그인이 onIdTokenChanged 를
  // 다시 발동시키므로 무한 호출 방지용. 로그아웃 시 비운다.
  const trialAttemptedRef = useRef<Set<string>>(new Set());
  // 이번 마운트에서 nativeToken(네이티브→웹 SSO)을 이미 처리했는지.
  // signInWithCustomToken 이 onIdTokenChanged 를 재발화하므로 1회만 시도하도록 가드한다.
  const nativeTokenHandledRef = useRef(false);

  useEffect(() => {
    // 제스처 추적기를 가장 이른 시점에 설치 — 첫 저장/로그인 클릭의 제스처를 놓치면
    // intent 발화가 user-activation 게이트에 걸려 위젯 즉시 갱신이 한 사이클 늦어진다.
    installUserGestureTracker();
    const unsubscribe = onIdTokenChanged(getAuth_(), async (fbUser) => {
      // 네이티브 앱(TWA 호스트)이 URL 에 실어 보낸 nativeToken 은 "이 웹뷰가 어느 계정이어야
      // 하는지"의 권위 소스다. 웹 IndexedDB 에 다른(오래된) 계정 세션이 남아 있으면
      // onIdTokenChanged 가 그 세션으로 먼저 발화하는데, 그 경우에도 nativeToken 을 소비해
      // 네이티브 계정으로 전환해야 한다 — 안 그러면 위젯(네이티브 계정)과 홈(웹 세션)이
      // 영구히 다른 dailyMotivations 문서를 보게 된다(위젯-홈 명언 불일치의 근본 원인).
      // signInWithCustomToken 이 이 리스너를 재발화하므로 마운트당 1회만 시도.
      if (!nativeTokenHandledRef.current) {
        nativeTokenHandledRef.current = true;
        const switchedToNativeAccount = await tryConsumeNativeToken();
        if (switchedToNativeAccount) return; // 네이티브 계정으로 리스너 재발화 → 거기서 이어감
      }

      if (fbUser) {
        setFirebaseUser(fbUser);
        // Firestore 읽기 실패(오프라인 콜드부트·규칙 거부)에도 앱이 무한 스피너에 고착되지
        // 않도록 프로필 없이 진행한다(아래 setLoading(false) 도달 보장). 다음 토큰 갱신에 재시도.
        let profile: User | null = null;
        try {
          profile = await getUserProfile(fbUser.uid);
        } catch (err) {
          console.warn("[auth] getUserProfile 실패:", err);
        }
        setUser(profile);

        if (!trialAttemptedRef.current.has(fbUser.uid)) {
          trialAttemptedRef.current.add(fbUser.uid);
          const restartedSession = await ensureTrialStarted(fbUser);
          if (restartedSession) {
            // signInWithCustomToken 이 onIdTokenChanged 를 다시 트리거 →
            // 새 claim 이 박힌 토큰으로 syncServerSession 이 일어나도록 즉시 종료.
            return;
          }
        }

        try {
          const idToken = await fbUser.getIdToken();
          if (idToken) await syncServerSession(idToken);
        } catch {
          // 다음 갱신 사이클에서 다시 시도
        }
        // TWA 안에서 띄워진 세션이면 동일 uid 로 네이티브 FirebaseAuth 에도 로그인 시킨다.
        // 실패해도 웹 동작에는 영향 없음 — 위젯/알림이 미인증 상태로 머무를 뿐.
        await bridgeToNativeIfNeeded(fbUser);
        setLoading(false);
        return;
      }

      if (!restoreAttemptedRef.current) {
        restoreAttemptedRef.current = true;
        // nativeToken 은 위에서 (기존 세션 유무와 무관하게) 이미 처리됐다.
        // 여기서는 서버 세션 쿠키로부터의 복원만 시도한다.
        const restored = await tryRestoreFromServerCookie();
        if (restored) return;
      }

      setFirebaseUser(null);
      setUser(null);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmail(email, password);
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    await firebaseSignUp(email, password, displayName);
  };

  const signInGoogle = async (): Promise<GoogleSignInResult> => {
    return signInWithGoogle();
  };

  const signInApple = async (): Promise<AppleSignInResult> => {
    return signInWithApple();
  };

  const linkGoogleToEmailPassword = async (
    email: string,
    password: string,
    pendingCredential: AuthCredential,
  ) => {
    await linkGoogleCredentialToEmailAccount(email, password, pendingCredential);
  };

  const linkAppleToEmailPassword = async (
    email: string,
    password: string,
    pendingCredential: AuthCredential,
  ) => {
    await linkAppleCredentialToEmailAccount(email, password, pendingCredential);
  };

  const signOut = async () => {
    // onIdTokenChanged(null) 리스너가 /api/session/refresh 로 자동 재로그인하는 걸 막아야 한다.
    // 1) 서버 쿠키를 먼저 지운다 — refresh 가 401 을 반환하도록.
    // 2) 복원 시도 플래그를 닫아둔다 — 쿠키 clear 와 firebase signOut 사이의 짧은 윈도우 보호.
    restoreAttemptedRef.current = true;
    trialAttemptedRef.current.clear();
    // TWA 환경이면 네이티브 FirebaseAuth · 위젯 캐시도 같이 비운다 — 안 하면 홈 화면 위젯이
    // 이전 계정의 명언/체크리스트를 계속 노출한다.
    // 클릭 직후(user-activation 이 살아 있을 때) 먼저 발화한다 — 아래 await 들이 느리면
    // 게이트 윈도우(약 5초)를 넘겨 발화가 조용히 스킵되던 회귀를 막는다. 네이티브 signout 은 멱등.
    notifyAndroidSignOut();
    // 네이티브 브릿지 마커를 비워 다음 로그인 때 새 uid 로 브릿지가 다시 쏘이도록 한다.
    try {
      window.sessionStorage.removeItem(NATIVE_BRIDGE_LAST_UID_KEY);
      window.sessionStorage.removeItem(NATIVE_BRIDGE_LAST_AT_KEY);
      window.sessionStorage.removeItem(NATIVE_BRIDGE_CONFIRMED_UID_KEY);
    } catch {
      // 무시
    }
    // 이전 버전에서 localStorage 에 박혀 있던 마커도 함께 정리 — 마이그레이션 잔재 제거.
    try {
      window.localStorage.removeItem(NATIVE_BRIDGE_LAST_UID_KEY);
    } catch {
      // 무시
    }
    await clearServerSession();
    await firebaseSignOut();
  };

  const refreshUser = async () => {
    if (firebaseUser) {
      const profile = await getUserProfile(firebaseUser.uid);
      setUser(profile);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        loading,
        signIn,
        signUp,
        signInGoogle,
        signInApple,
        linkGoogleToEmailPassword,
        linkAppleToEmailPassword,
        signOut,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
