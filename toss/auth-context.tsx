import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { User as TossUser } from '@apps-in-toss/web-framework';
import { getAuth_, getUserProfile, onIdTokenChanged, signInWithCustomTokenClient, signOut as firebaseSignOut, type FirebaseUser } from '../lib/firebase';
import { chooseEntitlement, hasProAccess, readEntitlement, type Entitlement } from '../lib/entitlement';
import type { User } from '../types';
import { API_ORIGIN } from './authedFetch';

type ContextValue = {
  user: User | null; firebaseUser: FirebaseUser | null; loading: boolean; error: string;
  entitlement: Entitlement; trialEndsAt: number | null; isGuest: boolean;
  start: () => Promise<void>; signOut: () => Promise<void>; refreshUser: () => Promise<void>;
  refreshEntitlement: () => Promise<void>;
};
const Context = createContext<ContextValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [claims, setClaims] = useState<Record<string, unknown> | null>(null);
  const [shared, setShared] = useState<Entitlement>({ kind: 'free' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const entitlementRequest = useRef(0);
  const pending = useRef(false);
  const refreshUser = useCallback(async () => {
    const current = getAuth_().currentUser;
    const attempt = generation.current;
    if (!current || current.uid !== firebaseUser?.uid) return;
    const [profile, token] = await Promise.all([getUserProfile(current.uid), current.getIdTokenResult()]);
    if (attempt !== generation.current || getAuth_().currentUser?.uid !== current.uid) return;
    setUser(profile); setClaims(token.claims as Record<string, unknown>);
  }, [firebaseUser?.uid]);
  const start = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    const attempt = ++generation.current;
    setLoading(true); setError(''); setUser(null); setFirebaseUser(null); setClaims(null); setShared({ kind: 'free' });
    let serviceMessage: string | null = null;
    try {
      const { code } = await TossUser.createAnonymousKeyAuthCode();
      const response = await fetch(`${API_ORIGIN}/api/auth/toss-session`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
        body: JSON.stringify({ code }), signal: AbortSignal.timeout(15000),
      });
      const data = await response.json() as { customToken?: string; error?: string };
      if (!response.ok || !data.customToken) {
        serviceMessage = data.error || '토스 연결을 완료하지 못했어요.';
        throw new Error('Session exchange failed');
      }
      const credential = await signInWithCustomTokenClient(data.customToken);
      const [profile, token] = await Promise.all([getUserProfile(credential.user.uid), credential.user.getIdTokenResult()]);
      if (attempt !== generation.current) return;
      if (!profile) throw new Error('프로필을 불러오지 못했어요. 다시 시도해 주세요.');
      setFirebaseUser(credential.user); setUser(profile); setClaims(token.claims as Record<string, unknown>);
    } catch {
      if (attempt === generation.current) setError(serviceMessage || '토스 앱에서 다시 열어 주세요. 연결 상태도 확인해 주세요.');
    } finally {
      if (attempt === generation.current) setLoading(false);
      pending.current = false;
    }
  }, []);
  const signOut = useCallback(async () => {
    generation.current++; setFirebaseUser(null); setUser(null); setClaims(null); setShared({ kind: 'free' }); setError('');
    await firebaseSignOut();
  }, []);
  useEffect(() => {
    if (!firebaseUser) return;
    return onIdTokenChanged(getAuth_(), (current) => {
      if (!current || current.uid !== firebaseUser.uid) {
        generation.current++; setFirebaseUser(null); setUser(null); setClaims(null); setShared({ kind: 'free' });
      } else void refreshUser().catch(() => {});
    });
  }, [firebaseUser, refreshUser]);
  const refreshEntitlement = useCallback(async () => {
    if (!firebaseUser || getAuth_().currentUser?.uid !== firebaseUser.uid) return;
    const attempt = generation.current;
    const request = ++entitlementRequest.current;
    try {
      const token = await firebaseUser.getIdToken();
      const response = await fetch(`${API_ORIGIN}/api/membership`, { headers: { Authorization: `Bearer ${token}` }, credentials: 'omit', signal: AbortSignal.timeout(10000) });
      if (!response.ok) return;
      const { entitlement } = await response.json() as { entitlement?: Entitlement };
      if (attempt !== generation.current || request !== entitlementRequest.current || getAuth_().currentUser?.uid !== firebaseUser.uid) return;
      const recognized = entitlement?.kind === 'membership' && entitlement.productId === 'aseptic_all_access' ||
        entitlement?.kind === 'subscription' && entitlement.platform === 'toss';
      setShared(recognized && Number.isFinite(entitlement.expiresAt) && hasProAccess(entitlement) ? entitlement : { kind: 'free' });
    } catch { /* Keep the last verified entitlement until it expires. */ }
  }, [firebaseUser]);
  useEffect(() => {
    if (!firebaseUser) return;
    void refreshEntitlement();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refreshEntitlement(); }, 30000);
    const foreground = () => { if (document.visibilityState === 'visible') { void refreshEntitlement(); void refreshUser().catch(() => {}); } };
    document.addEventListener('visibilitychange', foreground);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', foreground); };
  }, [firebaseUser, refreshEntitlement, refreshUser]);
  const value = useMemo(() => {
    const local = readEntitlement(claims);
    const entitlement = shared.kind === 'subscription' && hasProAccess(shared) ? shared : chooseEntitlement(local, shared);
    return { user, firebaseUser, loading, error, entitlement,
      trialEndsAt: typeof claims?.trialEndsAt === 'number' ? claims.trialEndsAt : null,
      isGuest: false, start, signOut, refreshUser, refreshEntitlement,
    };
  }, [user, firebaseUser, loading, error, claims, shared, start, signOut, refreshUser, refreshEntitlement]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error('AuthProvider가 필요해요.');
  return value;
}
