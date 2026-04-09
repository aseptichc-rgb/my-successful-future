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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getAuth_(), async (fbUser) => {
      if (fbUser) {
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
