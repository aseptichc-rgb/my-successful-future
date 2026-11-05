import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { IAP, type SubscriptionProductListItem } from '@apps-in-toss/web-framework';
import type { FirebaseUser } from '../lib/firebase';
import { hasProAccess } from '../lib/entitlement';
import { isTossProPrice } from '../lib/tossSubscription';
import { useAuth } from './auth-context';
import { API_ORIGIN } from './authedFetch';
import { isTossHost } from './environment';

type Plan = { uid: string; sku: string | null; enabled: boolean; product?: SubscriptionProductListItem };

async function requestBilling(user: FirebaseUser, orderId?: string) {
  const token = await user.getIdToken();
  return fetch(`${API_ORIGIN}/api/entitlement/toss`, {
    method: orderId ? 'POST' : 'GET', credentials: 'omit', signal: AbortSignal.timeout(22000),
    headers: { Authorization: `Bearer ${token}`, ...(orderId && { 'Content-Type': 'application/json' }) },
    body: orderId ? JSON.stringify({ orderId }) : undefined,
  });
}

async function grant(user: FirebaseUser, orderId: string): Promise<boolean> {
  try {
    const response = await requestBilling(user, orderId);
    return response.ok && (await response.json() as { granted?: unknown }).granted === true;
  } catch { return false; }
}

type Billing = {
  available: boolean; supported: boolean; price?: string; busy: boolean; message: string;
  canSubscribe: boolean; canRestore: boolean; subscribe: () => void; restore: () => Promise<void>;
};
const BillingContext = createContext<Billing | null>(null);

export function TossSubscriptionProvider({ children }: { children: ReactNode }) {
  const { firebaseUser, entitlement, trialEndsAt, refreshEntitlement } = useAuth();
  const [catalog, setCatalog] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [recoveredUid, setRecoveredUid] = useState<string | null>(null);
  const operation = useRef(false);
  const cancelCheckout = useRef<(() => void) | null>(null);
  const supported = isTossHost() && IAP.createSubscriptionPurchaseOrder.isSupported() && IAP.getSubscriptionInfo.isSupported();
  const plan = catalog?.uid === firebaseUser?.uid ? catalog : null;
  const trialEnded = trialEndsAt !== null && trialEndsAt > 0 && trialEndsAt <= Date.now();

  useEffect(() => {
    if (!firebaseUser || !isTossHost()) return;
    let disposed = false;
    void (async () => {
      try {
        const response = await requestBilling(firebaseUser);
        if (!response.ok) return;
        const config = await response.json() as { sku?: string; enabled?: boolean };
        const sku = typeof config.sku === 'string' && config.sku ? config.sku : null;
        if (!disposed) setCatalog({ uid: firebaseUser.uid, sku, enabled: config.enabled === true });
        if (!sku || config.enabled !== true || !supported || disposed) return;
        const list = await IAP.getProductItemList();
        const product = list?.products.find((item): item is SubscriptionProductListItem =>
          item.sku === sku && item.type === 'SUBSCRIPTION' && item.renewalCycle === 'MONTHLY' && isTossProPrice(item.displayAmount));
        if (!disposed) setCatalog({ uid: firebaseUser.uid, sku, enabled: true, product });
      } catch { /* A catalog that cannot be verified cannot be purchased. */ }
    })();
    return () => { disposed = true; cancelCheckout.current?.(); };
  }, [firebaseUser, supported]);

  const restore = useCallback(async () => {
    if (!firebaseUser || !plan?.sku || !supported || !trialEnded || operation.current) return;
    operation.current = true;
    setBusy(true);
    setMessage('');
    setRecoveredUid(null);
    try {
      const pending = await IAP.getPendingOrders();
      if (!pending) throw new Error('Pending orders unavailable');
      for (const order of pending.orders) {
        if (order.sku !== plan.sku) continue;
        if (!await grant(firebaseUser, order.orderId) || !await IAP.completeProductGrant({ params: { orderId: order.orderId } })) {
          throw new Error('Pending order not completed');
        }
      }
      setRecoveredUid(firebaseUser.uid);
    } catch {
      setMessage('구매 내역을 확인하지 못했어요. 결제한 내역이 있다면 구매 복원으로 다시 확인해 주세요.');
    } finally {
      await refreshEntitlement();
      operation.current = false;
      setBusy(false);
    }
  }, [firebaseUser, plan?.sku, supported, trialEnded, refreshEntitlement]);

  useEffect(() => { void restore(); }, [restore]);

  const canSubscribe = Boolean(firebaseUser && plan?.enabled && plan.product && supported && trialEnded &&
    !hasProAccess(entitlement) && !busy && recoveredUid === firebaseUser.uid);

  const subscribe = () => {
    if (!canSubscribe || !plan?.product || !firebaseUser || operation.current) return;
    operation.current = true;
    setBusy(true);
    setMessage('');
    let cleanup: (() => void) | undefined;
    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      cleanup?.();
      cancelCheckout.current = null;
      operation.current = false;
      setBusy(false);
    };
    cancelCheckout.current = finish;
    try {
      cleanup = IAP.createSubscriptionPurchaseOrder({
        options: { sku: plan.product.sku, offerId: null, processProductGrant: ({ orderId }) => grant(firebaseUser, orderId) },
        onEvent: async () => {
          if (ended) return;
          await refreshEntitlement();
          if (ended) return;
          setMessage('구독이 완료됐어요. AI 맞춤 기능을 이용할 수 있어요.');
          finish();
        },
        onError: async () => {
          if (ended) return;
          setRecoveredUid(null);
          finish();
          await restore();
        },
      });
      if (ended) cleanup();
    } catch {
      finish();
      setMessage('결제 화면을 열지 못했어요. 토스 앱에서 다시 시도해 주세요.');
    }
  };

  return <BillingContext.Provider value={{ available: plan?.enabled === true, supported, price: plan?.product?.displayAmount,
    busy, message, canSubscribe, canRestore: Boolean(plan?.sku && supported && trialEnded), subscribe, restore }}>{children}</BillingContext.Provider>;
}

export function useTossSubscription() {
  const billing = useContext(BillingContext);
  if (!billing) throw new Error('TossSubscriptionProvider is required');
  return billing;
}
