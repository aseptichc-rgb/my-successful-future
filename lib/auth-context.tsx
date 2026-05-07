"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  getAuth_,
  onIdTokenChanged,
  signInWithEmail,
  signInWithGoogle,
  signInWithCustomTokenClient,
  signUp as firebaseSignUp,
  signOut as firebaseSignOut,
  getUserProfile,
  type FirebaseUser,
} from "@/lib/firebase";
import type { User } from "@/types";

interface AuthContextValue {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
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
    if (claims.paid === true) return false;
    if (typeof claims.trialEndsAt === "number") return false;

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
        setLoading(false);
        return;
      }

      if (!restoreAttemptedRef.current) {
        restoreAttemptedRef.current = true;
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

  const signInGoogle = async () => {
    await signInWithGoogle();
  };

  const signOut = async () => {
    await firebaseSignOut();
    await clearServerSession();
    restoreAttemptedRef.current = false;
    trialAttemptedRef.current.clear();
  };

  const refreshUser = async () => {
    if (firebaseUser) {
      const profile = await getUserProfile(firebaseUser.uid);
      setUser(profile);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, firebaseUser, loading, signIn, signUp, signInGoogle, signOut, refreshUser }}
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
