import { createHash, timingSafeEqual } from 'node:crypto';
import { getAdminDb } from './firebase-admin';
import { postTossPartnerApi, tossAuthConfigured } from './tossAuth';
import { TOSS_PRO_CYCLE_MS } from './tossSubscription';
import type { Entitlement } from './entitlement';

type TossEntitlement = Extract<Entitlement, { kind: 'subscription' }>;
type SubscriptionEvent = { occurredAt: number; accessGranted: boolean; expiresAt: number | null };
type Order = { uid?: string; sku: string; paidAt?: number; event?: SubscriptionEvent };
const COLLECTION = 'tossSubscriptionOrders';

export function tossIapConfig() {
  const sku = process.env.TOSS_IAP_MONTHLY_SKU?.trim();
  const token = process.env.TOSS_IAP_WEBHOOK_TOKEN?.trim();
  if (!sku || !token || token.length < 32 || !tossAuthConfigured()) return null;
  return { sku, token, enabled: process.env.TOSS_IAP_ENABLED === 'true' };
}

export function validTossOrderId(orderId: unknown): orderId is string {
  return typeof orderId === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(orderId);
}

// Toss sends timezone-less ISO timestamps. Keep the Korean billing zone explicit.
function tossTime(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/.test(value)) return NaN;
  return Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}+09:00`);
}

export function parsePaidTossOrder(body: unknown, orderId: string, sku: string, now: number): number | null {
  const result = body as { resultType?: unknown; success?: { orderId?: unknown; sku?: unknown; status?: unknown; statusDeterminedAt?: unknown } } | null;
  const order = result?.success;
  if (result?.resultType !== 'SUCCESS' || order?.orderId !== orderId || order.sku !== sku ||
      (order.status !== 'PAYMENT_COMPLETED' && order.status !== 'PURCHASED')) return null;
  const paidAt = tossTime(order.statusDeterminedAt);
  return Number.isFinite(paidAt) && paidAt > 0 && paidAt <= now + 60_000 ? Math.min(paidAt, now) : null;
}

export function authorizedTossWebhook(header: string | null, token: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(header ?? ''), digest(`Basic ${token}`));
}

export function parseTossSubscriptionEvent(body: unknown, sku: string) {
  const payload = body as { eventType?: unknown; eventVersion?: unknown; occurredAt?: unknown; orderId?: unknown; sku?: unknown;
    subscription?: { current?: { status?: unknown; accessGranted?: unknown; expiresAt?: unknown } } } | null;
  const occurredAt = tossTime(payload?.occurredAt);
  if (!Number.isFinite(occurredAt)) return null;
  if (payload?.eventType === 'callback.registration_verification') return { kind: 'registration' as const };
  if (payload?.eventType !== 'subscription.status_changed' || payload.eventVersion !== '1.0' || !validTossOrderId(payload.orderId)) return null;
  if (typeof payload.sku !== 'string') return null;
  if (payload.sku !== sku) return { kind: 'other-product' as const };
  const current = payload.subscription?.current;
  if (typeof current?.accessGranted !== 'boolean' || typeof current.status !== 'string') return null;
  const expiresAt = current.expiresAt === null ? null : tossTime(current.expiresAt);
  if (expiresAt !== null && !Number.isFinite(expiresAt)) return null;
  const accessGranted = current.accessGranted && (current.status === 'ACTIVE' || current.status === 'IN_GRACE_PERIOD');
  return { kind: 'subscription' as const, orderId: payload.orderId, event: { occurredAt, accessGranted, expiresAt } };
}

export function tossOrderExpiry(order: Order): number {
  if (order.event && !order.event.accessGranted) return 0;
  return order.event?.expiresAt ?? (order.paidAt ? order.paidAt + TOSS_PRO_CYCLE_MS : 0);
}

export function applyTossSubscriptionEvent(order: Order, event: SubscriptionEvent): Order {
  const previous = order.event;
  if (previous && (event.occurredAt < previous.occurredAt ||
      (event.occurredAt === previous.occurredAt && !previous.accessGranted))) return order;
  if (event.accessGranted && event.expiresAt === null && previous) {
    // A metadata-only change must not erase the last known expiry or undo a revocation.
    return { ...order, event: { ...event, accessGranted: previous.accessGranted, expiresAt: previous.expiresAt } };
  }
  return { ...order, event };
}

function orderPath(orderId: string) {
  return `${COLLECTION}/${createHash('sha256').update(orderId).digest('hex')}`;
}

export async function storeTossSubscriptionEvent(orderId: string, sku: string, event: SubscriptionEvent) {
  const db = getAdminDb();
  const ref = db.doc(orderPath(orderId));
  await db.runTransaction(async (tx) => {
    const order = (await tx.get(ref)).data() as Order | undefined;
    if (order && order.sku !== sku) return;
    const updated = applyTossSubscriptionEvent(order ?? { sku }, event);
    if (updated !== order) tx.set(ref, updated);
  });
}

export async function grantTossSubscription(uid: string, orderId: string, sku: string): Promise<boolean> {
  const result = await postTossPartnerApi('/order/get-order-status', { orderId });
  const now = Date.now();
  const paidAt = parsePaidTossOrder(result, orderId, sku, now);
  if (paidAt === null) return false;
  const db = getAdminDb();
  const ref = db.doc(orderPath(orderId));
  return db.runTransaction(async (tx) => {
    const order = (await tx.get(ref)).data() as Order | undefined;
    if (order && (order.sku !== sku || (order.uid && order.uid !== uid))) return false;
    const grant = { ...order, uid, sku, paidAt: order?.paidAt ?? paidAt };
    if (tossOrderExpiry(grant) <= now) return false;
    // The first verified session owns this order. Replays do not extend the first paid period.
    if (!order?.uid) tx.set(ref, grant);
    return true;
  });
}

export async function readTossEntitlement(uid: string): Promise<TossEntitlement | null> {
  const sku = process.env.TOSS_IAP_MONTHLY_SKU?.trim();
  if (!sku) return null;
  const orders = await getAdminDb().collection(COLLECTION).where('uid', '==', uid).get();
  let active: TossEntitlement | null = null;
  const now = Date.now();
  for (const doc of orders.docs) {
    const order = doc.data() as Order;
    if (order.sku !== sku || !order.paidAt) continue;
    const expiresAt = tossOrderExpiry(order);
    if (expiresAt > (active?.expiresAt ?? now)) {
      active = { kind: 'subscription', productId: sku, platform: 'toss', expiresAt, grantedAt: order.paidAt };
    }
  }
  return active;
}
