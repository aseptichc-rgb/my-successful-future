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

interface AuthContextValue {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
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
    await firebaseSignOut();
  };

  return (
    <AuthContext.Provider
      value={{ user, firebaseUser, loading, signIn, signUp, signInGoogle, signOut }}
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
