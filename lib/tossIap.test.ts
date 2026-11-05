import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyTossSubscriptionEvent, authorizedTossWebhook, grantTossSubscription, parsePaidTossOrder,
  parseTossSubscriptionEvent, tossOrderExpiry,
} from './tossIap';
import { getAdminDb } from './firebase-admin';
import { postTossPartnerApi } from './tossAuth';
import { isTossProPrice, TOSS_PRO_CYCLE_MS } from './tossSubscription';
import { hasProAccess, unlocksEverything } from './entitlement';

vi.mock('./firebase-admin', () => ({ getAdminDb: vi.fn() }));
vi.mock('./tossAuth', () => ({ postTossPartnerApi: vi.fn() }));
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });

const SKU = 'sub.anima.monthly';
const ORDER = 'first-order';
const PAID_AT = Date.parse('2026-11-05T17:00:00+09:00');
const success = { orderId: ORDER, sku: SKU, status: 'PAYMENT_COMPLETED', statusDeterminedAt: '2026-11-05T17:00:00' };
const payment = { resultType: 'SUCCESS', success };

describe('Toss monthly Pro', () => {
  it('accepts exactly 990 won from the Toss catalog', () => {
    for (const price of ['₩990', '990원', 'KRW 990', '￦ 990']) expect(isTossProPrice(price)).toBe(true);
    for (const price of ['₩9900', '₩9,900', 'US$990', '₩990~', '990']) expect(isTossProPrice(price)).toBe(false);
  });

  it('requires a paid Toss order, the configured SKU, and the exact order ID', () => {
    expect(parsePaidTossOrder(payment, ORDER, SKU, PAID_AT)).toBe(PAID_AT);
    expect(parsePaidTossOrder({ ...payment, resultType: 'FAIL' }, ORDER, SKU, PAID_AT)).toBeNull();
    expect(parsePaidTossOrder(payment, 'other-order', SKU, PAID_AT)).toBeNull();
    expect(parsePaidTossOrder(payment, ORDER, 'other-sku', PAID_AT)).toBeNull();
    expect(parsePaidTossOrder({ ...payment, success: { ...success, status: 'REFUNDED' } }, ORDER, SKU, PAID_AT)).toBeNull();
    expect(parsePaidTossOrder(payment, ORDER, SKU, PAID_AT - 120_000)).toBeNull();
  });

  it('requires the configured authorization on webhook requests', () => {
    expect(authorizedTossWebhook('Basic example-token', 'example-token')).toBe(true);
    expect(authorizedTossWebhook('Bearer example-token', 'example-token')).toBe(false);
    expect(authorizedTossWebhook(null, 'example-token')).toBe(false);
  });

  it('retains the paid period after auto-renew is disabled and rejects stale events after revocation', () => {
    const initial = { sku: SKU, paidAt: PAID_AT };
    const renewedAt = PAID_AT + TOSS_PRO_CYCLE_MS;
    const renewed = applyTossSubscriptionEvent(initial, { occurredAt: renewedAt, accessGranted: true, expiresAt: renewedAt + TOSS_PRO_CYCLE_MS });
    const canceled = applyTossSubscriptionEvent(renewed, { occurredAt: renewedAt + 1000, accessGranted: true, expiresAt: null });
    expect(tossOrderExpiry(canceled)).toBe(renewedAt + TOSS_PRO_CYCLE_MS);
    const revoked = applyTossSubscriptionEvent(canceled, { occurredAt: renewedAt + 2000, accessGranted: false, expiresAt: null });
    expect(tossOrderExpiry(revoked)).toBe(0);
    expect(applyTossSubscriptionEvent(revoked, renewed.event!)).toBe(revoked);
  });

  it('accepts a registration test and a creation notification without an expiry', () => {
    expect(parseTossSubscriptionEvent({ eventType: 'callback.registration_verification', occurredAt: '2026-11-05T17:00:00' }, SKU))
      .toEqual({ kind: 'registration' });
    const event = parseTossSubscriptionEvent({ eventType: 'subscription.status_changed', eventVersion: '1.0',
      occurredAt: '2026-11-05T17:00:00', orderId: ORDER, sku: SKU,
      subscription: { current: { status: 'ACTIVE', accessGranted: true, expiresAt: null } } }, SKU);
    expect(event?.kind).toBe('subscription');
    if (event?.kind !== 'subscription') throw new Error('Expected a subscription event');
    const order = applyTossSubscriptionEvent({ sku: SKU, paidAt: PAID_AT }, event.event);
    expect(tossOrderExpiry(order)).toBe(PAID_AT + TOSS_PRO_CYCLE_MS);
  });

  it('binds a verified order once and never extends it by retrying or claiming it from another account', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(PAID_AT);
    const records = new Map();
    const db = { doc: (path: string) => path, runTransaction: vi.fn(async (run) => run({
      get: async (path: string) => ({ data: () => records.get(path) }),
      set: (path: string, value: unknown) => records.set(path, value),
    })) };
    vi.mocked(getAdminDb).mockReturnValue(db as unknown as ReturnType<typeof getAdminDb>);
    vi.mocked(postTossPartnerApi).mockResolvedValue(payment);
    expect(await grantTossSubscription('buyer-a', ORDER, SKU)).toBe(true);
    expect(await grantTossSubscription('buyer-b', ORDER, SKU)).toBe(false);
    vi.setSystemTime(PAID_AT + 60_000);
    vi.mocked(postTossPartnerApi).mockResolvedValue({ ...payment,
      success: { ...success, status: 'PURCHASED', statusDeterminedAt: '2026-11-05T17:01:00' } });
    expect(await grantTossSubscription('buyer-a', ORDER, SKU)).toBe(true);
    expect([...records.values()]).toEqual([{ sku: SKU, uid: 'buyer-a', paidAt: PAID_AT }]);
  });

  it('gives an active Toss subscription AI access without the manual-feature shortcut', () => {
    vi.useFakeTimers();
    vi.setSystemTime(PAID_AT);
    const ent = { kind: 'subscription', platform: 'toss', productId: SKU, grantedAt: PAID_AT, expiresAt: PAID_AT + 1000 } as const;
    expect(hasProAccess(ent)).toBe(true);
    expect(unlocksEverything(ent)).toBe(false);
    vi.setSystemTime(ent.expiresAt);
    expect(hasProAccess(ent)).toBe(false);
  });
});
