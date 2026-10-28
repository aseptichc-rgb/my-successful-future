export interface MembershipStatus {
  available: boolean;
  memberId: string | null;
  isActive: boolean;
  expiresAt: number | null;
  isLifetime: boolean;
  verifiedUntil: number | null;
}
export interface IdentitySource {
  subject: string;
  getIdToken: () => Promise<string>;
  tokenKind?: 'id' | 'session' | 'toss';
}
const unavailable = (): MembershipStatus => ({ available: false, memberId: null, isActive: false, expiresAt: null, isLifetime: false, verifiedUntil: null });

/** No persistent premium flag. Each cache belongs to one currently signed-in user. */
export function createMembershipClient(options: {
  baseUrl: string;
  appId: string;
  environment?: 'production' | 'sandbox';
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = options.fetchImpl || fetch;
  const environment = options.environment || 'production';
  let generation = 0, subject: string | null = null;
  let session: { accessToken: string; expiresAt: number } | null = null;
  let cache: { value: MembershipStatus; until: number } | null = null;
  let pending: Promise<MembershipStatus> | null = null;
  function reset() { generation++; subject = null; session = null; cache = null; pending = null; }
  async function request(path: string, accessToken: string, data?: unknown) {
    if (!/^https:\/\//.test(options.baseUrl) && !/^http:\/\/127\.0\.0\.1[:/]/.test(options.baseUrl)) {
      throw new Error('Membership URL must use HTTPS');
    }
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetchImpl(`${options.baseUrl.replace(/\/$/, '')}${path}`, {
        method: data === undefined ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }), signal: controller.signal,
      });
      if (!response.ok) throw new Error('Membership lookup failed');
      return await response.json();
    } finally { clearTimeout(timeout); }
  }
  function getStatus(identity: IdentitySource | null, force = false): Promise<MembershipStatus> {
    if (!identity || !options.baseUrl) { reset(); return Promise.resolve(unavailable()); }
    if (identity.subject !== subject) { reset(); subject = identity.subject; }
    if (!force && cache && cache.until > Date.now()) return Promise.resolve(cache.value);
    if (pending) return pending;
    const attempt = generation;
    const task = (async (): Promise<MembershipStatus> => {
      try {
        if (!session || session.expiresAt <= Date.now()) {
          const exchange = await request('/v1/session/exchange', await identity.getIdToken(), {
            appId: options.appId, tokenKind: identity.tokenKind || 'id' });
          if (attempt !== generation) return unavailable();
          if (typeof exchange.accessToken !== 'string' || !Number.isFinite(exchange.expiresIn)) throw new Error('Invalid session');
          session = { accessToken: exchange.accessToken, expiresAt: Date.now() + Math.min(exchange.expiresIn, 300) * 1000 - 30000 };
        }
        const result = await request(`/v1/me/membership?appId=${encodeURIComponent(options.appId)}`, session.accessToken);
        if (attempt !== generation) return unavailable();
        if (result.lookup !== 'ok' || result.appId !== options.appId || result.environment !== environment ||
            typeof result.memberId !== 'string' || typeof result.hasSharedMembership !== 'boolean') {
          throw new Error('Invalid membership response');
        }
        const expiresAt = typeof result.validUntil === 'string' ? Date.parse(result.validUntil) : null;
        const isLifetime = result.accessType === 'lifetime' && result.validUntil === null;
        const checkedAt = Date.parse(result.checkedAt);
        // A lifetime purchase still requires a fresh server decision for refunds/revocation.
        const verifiedUntil = Math.min(Date.now() + 60000, checkedAt + 60000);
        const value = { available: true, memberId: result.memberId,
          isActive: result.hasSharedMembership === true && result.hasAccess === true &&
            (isLifetime ? Number.isFinite(checkedAt) && checkedAt <= Date.now() + 5000 && verifiedUntil > Date.now() :
              expiresAt !== null && Number.isFinite(expiresAt) && expiresAt > Date.now()), expiresAt, isLifetime,
          verifiedUntil: Number.isFinite(verifiedUntil) ? verifiedUntil : Date.now() + 60000 };
        cache = { value, until: Math.min(value.verifiedUntil, expiresAt || Date.now() + 60000) };
        return value;
      } catch {
        if (attempt === generation) { session = null; cache = null; }
        return unavailable();
      }
    })();
    pending = task;
    void task.finally(() => { if (pending === task) pending = null; });
    return task;
  }
  return { getStatus, reset };
}
