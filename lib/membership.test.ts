import { describe, it, expect } from 'vitest';
import { chooseEntitlement, hasProAccess, isPaidPro, readEntitlement, type Entitlement } from './entitlement';
const shared = (): Extract<Entitlement, { kind: 'membership' }> => ({ kind: 'membership', productId: 'aseptic_all_access',
  grantedAt: Date.now(), expiresAt: Date.now() + 60000 });
describe('shared membership alongside existing purchases', () => {
  it('unlocks paid features without replacing an app lifetime purchase', () => {
    const lifetime: Entitlement = { kind: 'lifetime', productId: 'old', grantedAt: 1, platform: 'ios' };
    expect(chooseEntitlement(lifetime, shared())).toBe(lifetime);
    const selected = chooseEntitlement({ kind: 'free' }, shared());
    expect(hasProAccess(selected)).toBe(true); expect(isPaidPro(selected)).toBe(true);
  });
  it('does not trust a membership object embedded in ordinary app claims', () => {
    expect(readEntitlement({ ent: shared() }).kind).toBe('free');
  });
  it('removes expired shared access while preserving app entitlements', () => {
    const expired: Entitlement = { ...shared(), expiresAt: Date.now() - 1 };
    expect(hasProAccess(expired)).toBe(false); expect(isPaidPro(expired)).toBe(false);
    expect(chooseEntitlement({ kind: 'free' }, expired).kind).toBe('free');
    const trial: Entitlement = { kind: 'trial', trialEndsAt: Date.now() + 60000 };
    expect(chooseEntitlement(trial, expired)).toBe(trial);
  });
});
