import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import { enforceQuota, QuotaExceededError } from '@/lib/quota';
import { grantTossSubscription, tossIapConfig, validTossOrderId } from '@/lib/tossIap';
import { TOSS_APP_NAME, TOSS_ORIGINS } from '@/lib/tossOrigins';

export const runtime = 'nodejs';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

async function tossSession(request: NextRequest) {
  if (!TOSS_ORIGINS.some((origin) => origin === request.headers.get('origin'))) return null;
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return null;
  try {
    const session = await getAdminAuth().verifyIdToken(token, true);
    return session.tossApp === TOSS_APP_NAME && /^toss_[a-f0-9]{64}$/.test(session.uid) ? session : null;
  } catch { return null; }
}

export async function GET(request: NextRequest) {
  const config = tossIapConfig();
  if (!config) return json({ sku: null, enabled: false });
  if (!await tossSession(request)) return json({ error: 'Toss authentication is required.' }, 401);
  return json({ sku: config.sku, enabled: config.enabled });
}

export async function POST(request: NextRequest) {
  const config = tossIapConfig();
  if (!config) return json({ error: 'Toss subscriptions are unavailable.' }, 503);
  const session = await tossSession(request);
  if (!session) return json({ error: 'Toss authentication is required.' }, 401);
  if (typeof session.trialEndsAt !== 'number' || !Number.isFinite(session.trialEndsAt) ||
      session.trialEndsAt <= 0 || session.trialEndsAt > Date.now()) {
    return json({ error: 'Subscription starts after the free trial.' }, 409);
  }
  const body = await request.json().catch(() => null) as { orderId?: unknown } | null;
  if (!validTossOrderId(body?.orderId)) return json({ error: 'Invalid order.' }, 400);
  try {
    await enforceQuota(session.uid, 'tossOrderVerification');
    if (!await grantTossSubscription(session.uid, body.orderId, config.sku)) {
      return json({ error: 'The order is not eligible for grant.' }, 409);
    }
    return json({ granted: true });
  } catch (error) {
    if (error instanceof QuotaExceededError) return json({ error: 'Too many order checks.' }, 429);
    console.error('[toss-iap] Order verification unavailable');
    return json({ error: 'Order verification is temporarily unavailable.' }, 503);
  }
}
