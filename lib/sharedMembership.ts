import { createMembershipClient } from './membershipClient';
import type { Entitlement } from './entitlement';

/** Server-only caller: token has already passed the app's existing verifier. */
export async function readSharedEntitlement(token: string, tokenKind: 'id' | 'session'): Promise<Entitlement> {
  const client = createMembershipClient({
    baseUrl: process.env.MEMBERSHIP_URL || 'https://aseptic-membership.vercel.app', appId: 'anima',
    environment: process.env.NODE_ENV !== 'production' && process.env.MEMBERSHIP_SANDBOX === 'true' ? 'sandbox' : 'production',
  });
  const status = await client.getStatus({ subject: 'request-local', getIdToken: async () => token, tokenKind });
  return status.isActive && status.verifiedUntil ? { kind: 'membership', productId: 'aseptic_all_access',
    grantedAt: Date.now(), expiresAt: Math.min(status.verifiedUntil, status.expiresAt || Infinity) } : { kind: 'free' };
}
