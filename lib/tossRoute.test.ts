import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getAdminAuth } from './firebase-admin';
import { exchangeTossCode } from './tossAuth';
import { GET, POST } from '../app/api/auth/toss-session/route';
vi.mock('./firebase-admin', () => ({ getAdminAuth: vi.fn(), getAdminDb: vi.fn() }));
vi.mock('./tossAuth', async (original) => ({ ...await original<typeof import('./tossAuth')>(), exchangeTossCode: vi.fn() }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
const configured = () => { vi.stubEnv('TOSS_MTLS_CERT', 'test-cert'); vi.stubEnv('TOSS_MTLS_KEY', 'test-key'); };
const request = (body: unknown, origin = 'https://anima.private-apps.tossmini.com') => new NextRequest('https://example.com/api/auth/toss-session', {
  method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
describe('Toss authentication route', () => {
  it('reports missing credentials and never mints a Firebase token', async () => {
    vi.stubEnv('TOSS_MTLS_CERT', ''); vi.stubEnv('TOSS_MTLS_KEY', '');
    expect((await GET().json()).ready).toBe(false);
    expect((await POST(request({ code: 'valid-code' }))).status).toBe(503);
    expect(getAdminAuth).not.toHaveBeenCalled();
  });
  it('rejects lookalike origins before contacting the identity provider', async () => {
    configured();
    expect((await POST(request({ code: 'valid-code' }, 'https://anima.private-apps.tossmini.com.evil.example'))).status).toBe(403);
    expect(exchangeTossCode).not.toHaveBeenCalled();
  });
  it('does not accept a raw user key in place of an authentication code', async () => {
    configured();
    expect((await POST(request({ anonKey: 'a-stolen-key', uid: 'victim' }))).status).toBe(400);
    expect(getAdminAuth).not.toHaveBeenCalled();
  });
  it.each(['https://anima.apps.tossmini.com', 'https://anima.private-apps.tossmini.com'])(
    'accepts the actual SDK 3.9 origin %s before validating the request', async (origin) => {
      configured();
      expect((await POST(request({ anonKey: 'unverified-key' }, origin))).status).toBe(400);
      expect(exchangeTossCode).not.toHaveBeenCalled();
    },
  );
  it.each(['https://anima.web.tossmini.com', 'https://anima.private-web.tossmini.com'])(
    'does not treat the retired SDK 3.0 origin %s as a current client', async (origin) => {
      configured();
      expect((await POST(request({ code: 'fresh-code' }, origin))).status).toBe(403);
      expect(exchangeTossCode).not.toHaveBeenCalled();
    },
  );
  it('rejects expired and replayed codes without accessing Firebase', async () => {
    configured(); vi.mocked(exchangeTossCode).mockRejectedValue(new Error('code already used'));
    expect((await POST(request({ code: 'used-code' }))).status).toBe(401);
    expect(getAdminAuth).not.toHaveBeenCalled();
  });
  it('does not allow a disabled account to obtain a token', async () => {
    configured(); vi.mocked(exchangeTossCode).mockResolvedValue('verified-server-key');
    const createCustomToken = vi.fn();
    vi.mocked(getAdminAuth).mockReturnValue({ getUser: vi.fn().mockResolvedValue({ disabled: true }), createCustomToken } as never);
    expect((await POST(request({ code: 'fresh-code' }))).status).toBe(403);
    expect(createCustomToken).not.toHaveBeenCalled();
  });
});
