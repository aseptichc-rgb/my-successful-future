import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as ask } from '@/app/api/coach/chat/route';
import { POST as weekly } from '@/app/api/coach/weekly/route';
import { QuotaExceededError } from './quota';
const mocks = vi.hoisted(() => ({ requireAccess: vi.fn(), quota: vi.fn(), reply: vi.fn(), weekly: vi.fn(), db: vi.fn() }));
vi.mock('@/lib/authServer', async (importOriginal) => ({ ...await importOriginal<typeof import('./authServer')>(), verifyRequestUser: mocks.requireAccess }));
vi.mock('@/lib/quota', async (importOriginal) => ({ ...await importOriginal<typeof import('./quota')>(), enforceQuota: mocks.quota }));
vi.mock('@/lib/aiCoach', async (importOriginal) => ({
  ...await importOriginal<typeof import('./aiCoach')>(),
  replyToCoachQuestion: mocks.reply,
  generateWeeklyCoaching: mocks.weekly,
}));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: mocks.db }));
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });

const chat = (consent?: boolean) => new NextRequest('https://example.test/api/coach/chat', {
  method: 'POST',
  body: JSON.stringify({ question: '독서를 시작하려면?', consent }),
});

it('allows three submitted questions and does not call AI for a fourth', async () => {
  mocks.requireAccess.mockResolvedValue({ uid: 'user', entitlement: { kind: 'trial', trialEndsAt: Date.now() + 60_000 } });
  mocks.reply.mockResolvedValue({ kind: 'answer', text: '한 페이지부터 읽어보세요.' });
  for (const used of [1, 2, 3]) {
    mocks.quota.mockResolvedValueOnce({ used, ymd: '2026-11-05' });
    const result = await ask(chat(true));
    expect(await result.json()).toMatchObject({ usage: { limit: 3, remaining: 3 - used } });
  }
  mocks.quota.mockRejectedValueOnce(new QuotaExceededError('coachQuestion', 3, 3, '2026-11-05'));
  const exhausted = await ask(chat(true));
  expect(exhausted.status).toBe(429);
  expect(await exhausted.json()).toMatchObject({ usage: { ymd: '2026-11-05', remaining: 0 } });
  expect(mocks.reply).toHaveBeenCalledTimes(3);
  expect(mocks.quota).toHaveBeenCalledWith('user', 'coachQuestion');
});

it('checks access before using either feature', async () => {
  mocks.requireAccess.mockResolvedValue({ uid: 'user', tossApp: true, entitlement: { kind: 'free' } });
  expect((await ask(chat(true))).status).toBe(402);
  expect((await weekly(new NextRequest('https://example.test/api/coach/weekly', { method: 'POST' }))).status).toBe(402);
  expect(mocks.quota).not.toHaveBeenCalled();
  expect(mocks.db).not.toHaveBeenCalled();
});

it('requires permission on the shared web screen before counting or answering a question', async () => {
  mocks.requireAccess.mockResolvedValue({ uid: 'user', entitlement: { kind: 'lifetime', platform: 'ios' } });
  expect((await ask(chat(false))).status).toBe(400);
  expect(mocks.quota).not.toHaveBeenCalled();
  expect(mocks.reply).not.toHaveBeenCalled();
});

it('uses seven KST dates and returns the saved coaching on a second request', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-05T03:00:00Z'));
  mocks.requireAccess.mockResolvedValue({ uid: 'user', tossApp: true, entitlement: { kind: 'trial', trialEndsAt: Date.now() + 60_000 } });
  const report = { from: '2026-10-30', to: '2026-11-05', practice: { text: '산책', ymd: '2026-11-05' }, obstacle: null, action: '점심 후 10분 걸어 보세요.' };
  mocks.weekly.mockResolvedValue(report);

  const user = { collection: (name: string) => ({ doc: (id: string) => `${name}/${id}` }) };
  let stored: Record<string, unknown> | undefined;
  const getAll = vi.fn(async (...refs: string[]) => refs.map((ref) => ({ id: ref.split('/')[1],
    data: () => ref === 'dailyEntries/2026-11-05' ? { wins: ['산책'] } : undefined })));
  const runTransaction = vi.fn(async (run) => run({
    get: async (ref: unknown) => ref === user ? { exists: true } : { data: () => stored, get: (key: string) => stored?.[key] },
    set: (_ref: unknown, value: Record<string, unknown>) => { stored = value; },
  }));
  mocks.db.mockReturnValue({ doc: () => user, getAll, runTransaction });
  const request = () => new NextRequest('https://example.test/api/coach/weekly', { method: 'POST' });
  expect(await (await weekly(request())).json()).toEqual({ kind: 'report', report });
  expect(await (await weekly(request())).json()).toEqual({ kind: 'report', report });
  expect(getAll.mock.calls[0]).toEqual(['10-30', '10-31', '11-01', '11-02', '11-03', '11-04', '11-05'].map((date) => `dailyEntries/2026-${date}`));
  expect(getAll).toHaveBeenCalledTimes(2);
  expect(mocks.weekly).toHaveBeenCalledOnce();
});
