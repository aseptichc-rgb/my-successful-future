import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { request } from 'node:https';
import { exchangeTossCode, parseTossExchange, tossFirebaseUid, validTossCode } from './tossAuth';
vi.mock('node:https', () => ({ request: vi.fn() }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe('Toss identity verification', () => {
  it('rejects HTTP 200 business failures even when a success-shaped payload is present', () => {
    expect(() => parseTossExchange({ resultType: 'FAIL', success: { anonKey: 'somebody-elses-key' } })).toThrow();
    expect(() => parseTossExchange({ resultType: 'SUCCESS', success: { hash: 'unverified-client-hash' } })).toThrow();
    expect(parseTossExchange({ resultType: 'SUCCESS', success: { anonKey: 'server-verified-key' } })).toBe('server-verified-key');
  });
  it('does not use raw identity values as Firebase user IDs', () => {
    const first = tossFirebaseUid('server-verified-key');
    expect(first).toMatch(/^toss_[a-f0-9]{64}$/);
    expect(first).not.toContain('server-verified-key');
    expect(tossFirebaseUid('server-verified-key')).toBe(first);
    expect(tossFirebaseUid('another-server-key')).not.toBe(first);
  });
  it('rejects invalid code types, whitespace and oversized codes', () => {
    for (const code of [null, undefined, 123, {}, '', 'token\r\ninjection', 'x'.repeat(2049)]) expect(validTossCode(code)).toBe(false);
    expect(validTossCode('one-time-code')).toBe(true);
  });
  it('fails closed without server credentials', async () => {
    vi.stubEnv('TOSS_MTLS_CERT', ''); vi.stubEnv('TOSS_MTLS_KEY', '');
    expect(() => exchangeTossCode('code')).toThrow('not configured');
    expect(request).not.toHaveBeenCalled();
  });
  it('uses the official mTLS endpoint and validates the business result', async () => {
    vi.stubEnv('TOSS_MTLS_CERT', 'test-cert'); vi.stubEnv('TOSS_MTLS_KEY', 'test-key');
    const fakeRequest = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void };
    vi.mocked(request).mockImplementation(((_url: unknown, _options: unknown, callback: (res: EventEmitter) => void) => {
      fakeRequest.end = () => {
        const response = Object.assign(new EventEmitter(), { statusCode: 200 });
        callback(response);
        response.emit('data', Buffer.from(JSON.stringify({ resultType: 'FAIL', error: { errorCode: '4011' } })));
        response.emit('end'); fakeRequest.emit('close');
      };
      return fakeRequest;
    }) as typeof request);
    await expect(exchangeTossCode('used-code')).rejects.toThrow('rejected');
    expect(request).toHaveBeenCalledWith('https://apps-in-toss-api.toss.im/api-partner/v1/apps-in-toss/users/anon-key/exchange',
      expect.objectContaining({ method: 'POST', cert: 'test-cert', key: 'test-key' }), expect.any(Function));
    const options = vi.mocked(request).mock.calls[0][1] as Record<string, unknown>;
    expect(options.rejectUnauthorized).not.toBe(false);
  });
});
