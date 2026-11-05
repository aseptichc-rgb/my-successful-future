import { authedFetch as originalAuthedFetch } from '../lib/authedFetch';

export const API_ORIGIN = 'https://my-successful-future.vercel.app';
export function authedFetch(path: string, init: RequestInit = {}) {
  if (!path.startsWith('/api/')) throw new Error('잘못된 API 경로예요.');
  return originalAuthedFetch(`${API_ORIGIN}${path}`, { ...init, credentials: 'omit' });
}
