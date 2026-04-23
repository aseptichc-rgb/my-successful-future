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
import { requestNotificationPermission, removeFCMTokenForUser } from "@/lib/fcm";

interface AuthContextValue {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  enableNotifications: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * 서버에 ID 토큰을 보내 httpOnly 세션 쿠키를 발급/갱신한다.
 * iOS/Android PWA의 ITP/스토리지 축출로 IndexedDB가 날아가도
 * 다음 진입 시 이 쿠키로 세션을 복원할 수 있게 한다.
 */
async function syncServerSession(idToken: string): Promise<void> {
  try {
    await fetch("/api/session/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
      // 쿠키 set 을 받으려면 same-origin 이어야 함 (기본값)
      credentials: "same-origin",
    });
  } catch {
    // 네트워크 일시 장애는 무시 — 다음 토큰 갱신 시 재시도된다.
  }
}

async function clearServerSession(): Promise<void> {
  try {
    await fetch("/api/session/logout", {
      method: "POST",
      credentials: "same-origin",
    });
  } catch {
    // 로그아웃은 어떻든 진행
  }
}

/**
 * Firebase 클라이언트 SDK가 콜드부트 시 currentUser=null 을 줄 때,
 * 서버 세션 쿠키가 살아있으면 커스텀 토큰을 받아 SDK 를 복원한다.
 * 성공 시 onAuthStateChanged 가 다시 호출되어 정상 흐름을 탄다.
 */
async function tryRestoreFromServerCookie(): Promise<boolean> {
  try {
    const res = await fetch("/api/session/refresh", {
      method: "GET",
      credentials: "same-origin",
    });
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
  // 동시에 두 번 복원 시도하지 않도록 가드
  const restoreAttemptedRef = useRef(false);

  useEffect(() => {
    // onIdTokenChanged 는 로그인/토큰 갱신/로그아웃 모두에서 발동.
    // ID 토큰이 갱신될 때마다 서버 쿠키도 함께 14일짜리로 재발급되어
    // 활성 사용자는 사실상 만료되지 않는다.
    const unsubscribe = onIdTokenChanged(getAuth_(), async (fbUser) => {
      if (fbUser) {
        setFirebaseUser(fbUser);
        const profile = await getUserProfile(fbUser.uid);
        setUser(profile);

        try {
          const idToken = await fbUser.getIdToken();
          if (idToken) await syncServerSession(idToken);
        } catch {
          // 토큰 못 받으면 다음 갱신 사이클에서 다시 시도
        }

        // 알림 권한이 이미 부여된 경우에만 자동 등록
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          requestNotificationPermission(fbUser.uid).catch(() => {});
        }

        setLoading(false);
        return;
      }

      // 클라이언트 SDK 가 비어있다 → 서버 쿠키로 1회 복원 시도
      if (!restoreAttemptedRef.current) {
        restoreAttemptedRef.current = true;
        const restored = await tryRestoreFromServerCookie();
        if (restored) {
          // signInWithCustomTokenClient 가 onIdTokenChanged 를 다시 트리거하므로
          // 여기서 setLoading 을 풀지 않고 다음 사이클에 위임한다.
          return;
        }
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
    if (firebaseUser) {
      await removeFCMTokenForUser(firebaseUser.uid).catch(() => {});
    }
    await firebaseSignOut();
    await clearServerSession();
    // 다음 콜드부트에서 다시 복원 시도할 수 있도록 가드 리셋
    restoreAttemptedRef.current = false;
  };

  const refreshUser = async () => {
    if (firebaseUser) {
      const profile = await getUserProfile(firebaseUser.uid);
      setUser(profile);
    }
  };

  const enableNotifications = async (): Promise<string | null> => {
    if (!firebaseUser) return null;
    return requestNotificationPermission(firebaseUser.uid);
  };

  return (
    <AuthContext.Provider
      value={{ user, firebaseUser, loading, signIn, signUp, signInGoogle, signOut, refreshUser, enableNotifications }}
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
