import { createHash } from 'node:crypto';
import { request } from 'node:https';
import { TOSS_APP_NAME, TOSS_ORIGINS } from './tossOrigins';

export { TOSS_APP_NAME, TOSS_ORIGINS };

export function validTossCode(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= 2048 && !/\s/.test(value);
}

/** Never use a client-supplied hash as proof of identity. Only the mTLS exchange returns this. */
export function parseTossExchange(body: unknown): string {
  const data = body as { resultType?: unknown; success?: { anonKey?: unknown } } | null;
  const key = data?.success?.anonKey;
  if (data?.resultType !== 'SUCCESS' || typeof key !== 'string' || key.length < 8 || key.length > 2048) {
    throw new Error('Toss rejected the one-time authentication code');
  }
  return key;
}

export function tossFirebaseUid(verifiedAnonKey: string): string {
  return `toss_${createHash('sha256').update(`${TOSS_APP_NAME}:${verifiedAnonKey}`).digest('hex')}`;
}

export function tossAuthConfigured() {
  return Boolean(process.env.TOSS_MTLS_CERT?.trim() && process.env.TOSS_MTLS_KEY?.trim());
}

export function exchangeTossCode(code: string): Promise<string> {
  return postTossPartnerApi('/users/anon-key/exchange', { code }).then(parseTossExchange);
}

export function postTossPartnerApi(path: '/users/anon-key/exchange' | '/order/get-order-status', payload: object): Promise<unknown> {
  if (!tossAuthConfigured()) throw new Error('Toss mTLS is not configured');
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = request(`https://apps-in-toss-api.toss.im/api-partner/v1/apps-in-toss${path}`, {
      method: 'POST',
      cert: process.env.TOSS_MTLS_CERT!.replace(/\\n/g, '\n'),
      key: process.env.TOSS_MTLS_KEY!.replace(/\\n/g, '\n'),
      // TLS certificate validation remains enabled; credentials never reach the browser.
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      const chunks: Buffer[] = [];
      let length = 0;
      res.on('data', (chunk: Buffer) => {
        length += chunk.length;
        if (length > 65536) { req.destroy(new Error('Toss response is too large')); return; }
        chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) throw new Error('Toss partner API request failed');
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (err) { reject(err); }
      });
    });
    const timeout = setTimeout(() => req.destroy(new Error('Toss partner API request timed out')), 10000);
    req.on('close', () => clearTimeout(timeout));
    req.on('error', reject);
    req.end(body);
  });
}
