"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  getAuth_,
  onIdTokenChanged,
  signInWithEmail,
  signInWithGoogle,
  linkGoogleCredentialToEmailAccount,
  signInWithCustomTokenClient,
  signUp as firebaseSignUp,
  signOut as firebaseSignOut,
  getUserProfile,
  type FirebaseUser,
  type GoogleSignInResult,
} from "@/lib/firebase";
import type { AuthCredential } from "firebase/auth";
import { shouldStartTrial } from "@/lib/entitlement";
import type { User } from "@/types";

interface AuthContextValue {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signInGoogle: () => Promise<GoogleSignInResult>;
  linkGoogleToEmailPassword: (
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
const FROM_APP_FLAG_KEY = "anima.fromApp";

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
 * 동일 uid 로 이번 세션에 이미 브릿지를 쏜 적 있으면 no-op — 라우팅마다 재발화 방지.
 * 발화 방식: intent:// URL 을 hidden iframe 에 로드 — Chrome 이 Android intent 로 해석해
 * MainActivity 에 customToken 을 전달한다. top-level navigation 이 아니므로 TWA 가 그대로 살아있음.
 *
 * 보안: customToken 은 URL 쿼리에 실리지만, TWA → Android intent 경로는 OS 내부 IPC 로
 * 브라우저 히스토리/Referer 에 남지 않는다. 토큰의 짧은 수명도 추가 방어선.
 */
async function bridgeToNativeIfNeeded(fbUser: FirebaseUser): Promise<void> {
  if (!isInsideAndroidApp()) return;
  let lastUid: string | null = null;
  try {
    lastUid = window.localStorage.getItem(NATIVE_BRIDGE_LAST_UID_KEY);
  } catch {
    // localStorage 차단 — 매번 시도하더라도 idempotent 하므로 진행.
  }
  if (lastUid === fbUser.uid) return;

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

    try {
      window.localStorage.setItem(NATIVE_BRIDGE_LAST_UID_KEY, fbUser.uid);
    } catch {
      // 무시 — 다음 라우팅에서 또 한 번 쏘게 되지만 네이티브 쪽이 멱등.
    }

    // intent:// 형식이면 Chrome 이 자체 핸들러로 처리. 패키지 지정해 우리 앱으로 라우팅 보장.
    const url =
      "intent://auth?token=" +
      encodeURIComponent(customToken) +
      "#Intent;scheme=anima;package=com.michaelkim.anima;end";
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = url;
    document.body.appendChild(iframe);
    // intent 발화 후엔 iframe 제거 — DOM 깨끗하게 유지.
    window.setTimeout(() => {
      try {
        iframe.remove();
      } catch {
        // 무시
      }
    }, 1000);
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
 * Firebase 클라이언트 세션을 시작한다. 토큰은 단발성 + 짧은 수명이라 사용 직후 URL 에서 제거.
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
      window.localStorage.setItem(NATIVE_BRIDGE_LAST_UID_KEY, cred.user.uid);
    } catch {
      // localStorage 차단 — 브릿지가 한 번 더 발화될 수는 있지만 B 픽스(NoDisplay 액티비티)가 가려준다.
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

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(getAuth_(), async (fbUser) => {
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
        // 네이티브 앱에서 막 진입한 케이스 — URL 의 nativeToken 을 먼저 소비해 즉시 로그인.
        // 성공 시 signInWithCustomToken 이 onIdTokenChanged 를 재발화하므로 여기서 종료.
        const consumed = await tryConsumeNativeToken();
        if (consumed) return;
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

  const linkGoogleToEmailPassword = async (
    email: string,
    password: string,
    pendingCredential: AuthCredential,
  ) => {
    await linkGoogleCredentialToEmailAccount(email, password, pendingCredential);
  };

  const signOut = async () => {
    // onIdTokenChanged(null) 리스너가 /api/session/refresh 로 자동 재로그인하는 걸 막아야 한다.
    // 1) 서버 쿠키를 먼저 지운다 — refresh 가 401 을 반환하도록.
    // 2) 복원 시도 플래그를 닫아둔다 — 쿠키 clear 와 firebase signOut 사이의 짧은 윈도우 보호.
    restoreAttemptedRef.current = true;
    trialAttemptedRef.current.clear();
    // 네이티브 브릿지 마커를 비워 다음 로그인 때 새 uid 로 브릿지가 다시 쏘이도록 한다.
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
        linkGoogleToEmailPassword,
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
