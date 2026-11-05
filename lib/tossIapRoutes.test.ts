import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as grant } from '@/app/api/entitlement/toss/route';
import { POST as webhook } from '@/app/api/billing/toss-webhook/route';

const mocks = vi.hoisted(() => ({ verifyToken: vi.fn(), grant: vi.fn(), event: vi.fn(), quota: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminAuth: () => ({ verifyIdToken: mocks.verifyToken }) }));
vi.mock('@/lib/quota', () => ({ enforceQuota: mocks.quota, QuotaExceededError: class extends Error {} }));
vi.mock('@/lib/tossIap', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/tossIap')>(),
  grantTossSubscription: mocks.grant,
  storeTossSubscriptionEvent: mocks.event,
  tossIapConfig: () => ({ sku: 'sub.anima.monthly', token: 'test-callback-token', enabled: true }),
}));

afterEach(() => vi.resetAllMocks());
const uid = `toss_${'a'.repeat(64)}`;
const orderId = 'test-paid-order';

function orderRequest(origin = 'https://anima.private-apps.tossmini.com') {
  return new NextRequest('https://example.test/api/entitlement/toss', {
    method: 'POST', headers: { origin, authorization: 'Bearer test-id-token' }, body: JSON.stringify({ orderId }),
  });
}

describe('Toss subscription routes', () => {
  it('never verifies or grants an order from a lookalike origin', async () => {
    expect((await grant(orderRequest('https://anima.private-apps.tossmini.com.example.test'))).status).toBe(401);
    expect(mocks.verifyToken).not.toHaveBeenCalled();
    expect(mocks.grant).not.toHaveBeenCalled();
  });

  it('does not grant a purchase during the existing 14-day trial', async () => {
    mocks.verifyToken.mockResolvedValue({ uid, tossApp: 'anima', trialEndsAt: Date.now() + 1000 });
    expect((await grant(orderRequest())).status).toBe(409);
    expect(mocks.grant).not.toHaveBeenCalled();
  });

  it('returns a grant only after the server confirms a paid order for the authenticated Toss account', async () => {
    mocks.verifyToken.mockResolvedValue({ uid, tossApp: 'anima', trialEndsAt: Date.now() - 1000 });
    mocks.grant.mockResolvedValue(true);
    const response = await grant(orderRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ granted: true });
    expect(mocks.verifyToken).toHaveBeenCalledWith('test-id-token', true);
    expect(mocks.grant).toHaveBeenCalledWith(uid, orderId, 'sub.anima.monthly');
  });

  it('accepts an authenticated renewal and rejects the same event without authorization', async () => {
    const body = JSON.stringify({ eventType: 'subscription.status_changed', eventVersion: '1.0', orderId,
      sku: 'sub.anima.monthly', occurredAt: '2026-12-05T17:00:00+09:00',
      subscription: { current: { status: 'ACTIVE', accessGranted: true, expiresAt: '2027-01-04T17:00:00+09:00' } } });
    const request = (authorization: string) => new NextRequest('https://example.test/api/billing/toss-webhook', {
      method: 'POST', headers: { authorization }, body,
    });
    expect((await webhook(request('Basic invalid'))).status).toBe(401);
    expect(mocks.event).not.toHaveBeenCalled();
    expect((await webhook(request('Basic test-callback-token'))).status).toBe(200);
    expect(mocks.event).toHaveBeenCalledWith(orderId, 'sub.anima.monthly', {
      occurredAt: Date.parse('2026-12-05T17:00:00+09:00'),
      accessGranted: true,
      expiresAt: Date.parse('2027-01-04T17:00:00+09:00'),
    });
  });
});
