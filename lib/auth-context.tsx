"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  getAuth_,
  onAuthStateChanged,
  signInWithEmail,
  signInWithGoogle,
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

// 비활성 상태로 30일 경과 시 자동 로그아웃
const INACTIVITY_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000;
const LAST_ACTIVITY_KEY = "auth:lastActivityAt";

function readLastActivity(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(LAST_ACTIVITY_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function writeLastActivity() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
  } catch {
    // 저장 실패 시 무시 (프라이빗 모드 등)
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getAuth_(), async (fbUser) => {
      if (fbUser) {
        const last = readLastActivity();
        if (last !== null && Date.now() - last > INACTIVITY_TIMEOUT_MS) {
          // 장기 미사용: 자동 로그아웃
          try {
            await removeFCMTokenForUser(fbUser.uid);
          } catch {
            // FCM 토큰 제거 실패해도 로그아웃은 계속 진행
          }
          try {
            await firebaseSignOut();
          } catch {
            // 로그아웃 실패 시에도 상태는 초기화
          }
          if (typeof window !== "undefined") {
            window.localStorage.removeItem(LAST_ACTIVITY_KEY);
          }
          setFirebaseUser(null);
          setUser(null);
          setLoading(false);
          return;
        }

        writeLastActivity();
        setFirebaseUser(fbUser);
        const profile = await getUserProfile(fbUser.uid);
        setUser(profile);
        // FCM 토큰 등록 (알림 권한이 이미 부여된 경우에만 자동 등록)
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          requestNotificationPermission(fbUser.uid).catch(() => {});
        }
      } else {
        setFirebaseUser(null);
        setUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // 사용자 활동 기록: 포커스/가시성/상호작용 시점마다 타임스탬프 갱신
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mark = () => {
      if (document.visibilityState === "visible") writeLastActivity();
    };
    const windowEvents: Array<keyof WindowEventMap> = ["focus", "pointerdown", "keydown"];
    windowEvents.forEach((ev) => window.addEventListener(ev, mark, { passive: true }));
    document.addEventListener("visibilitychange", mark, { passive: true });
    return () => {
      windowEvents.forEach((ev) => window.removeEventListener(ev, mark));
      document.removeEventListener("visibilitychange", mark);
    };
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
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(LAST_ACTIVITY_KEY);
    }
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
