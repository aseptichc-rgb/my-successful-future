import { NextRequest, NextResponse } from 'next/server';
import { authorizedTossWebhook, parseTossSubscriptionEvent, storeTossSubscriptionEvent, tossIapConfig } from '@/lib/tossIap';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const config = tossIapConfig();
  if (!config) return NextResponse.json({ error: 'Toss billing is unavailable.' }, { status: 503 });
  if (!authorizedTossWebhook(request.headers.get('authorization'), config.token)) {
    return NextResponse.json({ error: 'Invalid webhook authorization.' }, { status: 401 });
  }
  const event = parseTossSubscriptionEvent(await request.json().catch(() => null), config.sku);
  if (!event) return NextResponse.json({ error: 'Invalid webhook payload.' }, { status: 400 });
  try {
    if (event.kind === 'subscription') await storeTossSubscriptionEvent(event.orderId, config.sku, event.event);
    return NextResponse.json({ ok: true });
  } catch {
    console.error('[toss-iap] Subscription webhook could not be recorded');
    return NextResponse.json({ error: 'Webhook processing unavailable.' }, { status: 503 });
  }
}
