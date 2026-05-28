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
import { notifyAndroidSignOut } from "@/lib/widgetBridge";
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
 * 발화 방식: intent:// URL 을 두 가지 경로 (hidden iframe + 프로그래매틱 <a>.click) 로 시도해
 * Chrome user-activation 정책의 차단 확률을 줄인다. top-level navigation 이 아니므로 TWA 가
 * 그대로 살아있음.
 *
 * 보안: customToken 은 URL 쿼리에 실리지만, TWA → Android intent 경로는 OS 내부 IPC 로
 * 브라우저 히스토리/Referer 에 남지 않는다. 토큰의 짧은 수명(약 1시간)도 추가 방어선.
 */
async function bridgeToNativeIfNeeded(fbUser: FirebaseUser): Promise<void> {
  if (!isInsideAndroidApp()) return;
  // 마커는 sessionStorage 에 둔다 — 이전엔 localStorage 였고 iframe 발화 *전*에 박혔어서,
  // Chrome 의 user-gesture 정책으로 iframe intent 가 한 번 차단되면 같은 uid 로는 영구히
  // 브릿지 재시도가 안 돼 위젯이 EmptyState 에서 못 빠져나오는 회귀가 있었다. sessionStorage 로
  // 옮기면 이번 세션 안에서만 중복 발화를 막고, 다음 콜드부트 · TWA 재진입에선 자동 재시도된다.
  // (네이티브 signInWithCustomToken 은 동일 uid 면 멱등이라 중복 호출 비용 없음.)
  // 추가: 같은 uid 라도 [NATIVE_BRIDGE_RETRY_AFTER_MS] 가 지나면 한 번 더 쏜다.
  let lastUid: string | null = null;
  let lastAt = 0;
  try {
    lastUid = window.sessionStorage.getItem(NATIVE_BRIDGE_LAST_UID_KEY);
    const rawAt = window.sessionStorage.getItem(NATIVE_BRIDGE_LAST_AT_KEY);
    lastAt = rawAt ? parseInt(rawAt, 10) || 0 : 0;
  } catch {
    // sessionStorage 차단 — 매번 시도하더라도 idempotent 하므로 진행.
  }
  const now = Date.now();
  if (lastUid === fbUser.uid && now - lastAt < NATIVE_BRIDGE_RETRY_AFTER_MS) return;

  try {
    const idToken = await fbUser.getIdToken();
    if (!idToken) return;
    const res = await fetch("/api/auth/native-bridge", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` },
      credentials: "same-origin",
    });
    if (!res.ok) return;
    const data = (await res.json()) as { customToken?: string };
    const customToken = data.customToken;
    if (!customToken) return;

    fireAuthBridgeIntent(customToken);

    // 마커는 발사 *후* 에만 박는다. iframe.appendChild 자체는 Chrome 의 정책으로 silent 차단
    // 돼도 throw 가 없으므로 마커가 박힐 수 있지만, 우리는 [NATIVE_BRIDGE_RETRY_AFTER_MS]
    // 윈도우로 재시도를 한 번 더 보장한다.
    try {
      window.sessionStorage.setItem(NATIVE_BRIDGE_LAST_UID_KEY, fbUser.uid);
      window.sessionStorage.setItem(NATIVE_BRIDGE_LAST_AT_KEY, String(now));
    } catch {
      // 무시 — 다음 라우팅에서 또 한 번 쏘게 되지만 네이티브 쪽이 멱등.
    }
  } catch {
    // 네트워크/JSON 오류 — 다음 로그인 사이클에 다시 시도 (lastUid 기록 안 했으므로).
  }
}

/**
 * anima://auth?token=... 인텐트를 두 경로(iframe + <a>.click) 로 동시에 발사.
 * Chrome user-activation 차단을 우회하기 위한 다중 시도.
 */
function fireAuthBridgeIntent(customToken: string): void {
  const url =
    "intent://auth?token=" +
    encodeURIComponent(customToken) +
    "#Intent;scheme=anima;package=com.michaelkim.anima;end";

  // Path 1: hidden iframe — Chrome 의 정통 intent 라우팅 경로.
  try {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.setAttribute("aria-hidden", "true");
    iframe.src = url;
    document.body.appendChild(iframe);
    window.setTimeout(() => {
      try {
        iframe.remove();
      } catch {
        // 무시
      }
    }, 1000);
  } catch {
    // iframe 경로 실패 — 두 번째 경로로 계속
  }

  // Path 2: 프로그래매틱 <a>.click() — user gesture 컨텍스트에서 호출되면 iframe 보다 강하다.
  try {
    const a = document.createElement("a");
    a.href = url;
    a.rel = "noopener";
    a.target = "_blank";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    window.setTimeout(() => {
      try {
        a.remove();
      } catch {
        // 무시
      }
    }, 1000);
  } catch {
    // 두 경로 모두 실패 — 다음 cycle 에서 자가 봉합 (재시도 윈도우)
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
    // 따라서 bridgeToNativeIfNeeded 를 다시 쏘는 건 100% 멱등 — 그런데도 발화하면
    // anima://auth 인텐트가 액티비티를 띄워 TWA 위에 빈 화면을 잠깐 노출시킨다 (정확히 사용자가
    // 보던 "로그인 후 흰 화면 멈춤"). 미리 lastUid 마커를 박아 bridge 를 no-op 으로 만든다.
    try {
      window.sessionStorage.setItem(NATIVE_BRIDGE_LAST_UID_KEY, cred.user.uid);
    } catch {
      // sessionStorage 차단 — 브릿지가 한 번 더 발화될 수는 있지만 NoDisplay 액티비티가 가려준다.
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
        const profile = await getUserProfile(fbUser.uid);
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
    // 네이티브 브릿지 마커를 비워 다음 로그인 때 새 uid 로 브릿지가 다시 쏘이도록 한다.
    try {
      window.sessionStorage.removeItem(NATIVE_BRIDGE_LAST_UID_KEY);
      window.sessionStorage.removeItem(NATIVE_BRIDGE_LAST_AT_KEY);
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
    // TWA 환경이면 네이티브 FirebaseAuth · 위젯 캐시도 같이 비운다 — 안 하면 홈 화면 위젯이
    // 이전 계정의 명언/체크리스트를 계속 노출한다(다른 계정 재로그인 시 새 데이터가 도착하기
    // 전까지의 짧은 구간 동안에도 stale 데이터가 보이는 회귀 방지).
    notifyAndroidSignOut();
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
