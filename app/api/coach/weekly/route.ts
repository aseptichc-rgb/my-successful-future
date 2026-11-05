import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireTossCoach } from '@/lib/aiCoachAccess';
import { coachObservations, generateWeeklyCoaching } from '@/lib/aiCoach';
import type { WeeklyCoaching } from '@/lib/aiCoachTypes';
import { AuthError } from '@/lib/authServer';
import { getAdminDb } from '@/lib/firebase-admin';
import { addKstDays, todayKstYmd } from '@/lib/kstDate';
import { normalizeLanguage } from '@/lib/llmLang';
import { enforceQuota, QuotaExceededError } from '@/lib/quota';
import { weeklyReviewFrom, WEEKLY_REVIEW_DAYS } from '@/lib/weeklyReview';

export const runtime = 'nodejs';
export const maxDuration = 45;
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
const LEASE_MS = 60_000;

export async function POST(request: NextRequest) {
  try {
    const { uid } = await requireTossCoach(request);
    const language = normalizeLanguage(request.nextUrl.searchParams.get('language'));
    const db = getAdminDb();
    const user = db.doc(`users/${uid}`);
    const ref = user.collection('aiWeeklyCoach').doc('current');
    const to = todayKstYmd();
    const from = weeklyReviewFrom(to);
    const requestId = randomUUID();

    const existing = await db.runTransaction(async (tx) => {
      const saved = (await tx.get(ref)).data();
      const report = saved?.report as WeeklyCoaching | undefined;
      if (report?.to === to) return { kind: 'report' as const, report };
      if (typeof saved?.startedAt === 'number' && Date.now() - saved.startedAt < LEASE_MS) return { kind: 'pending' as const };
      tx.set(ref, { requestId, startedAt: Date.now() });
      return null;
    });
    if (existing) return json(existing);

    let report: WeeklyCoaching | null = null;
    try {
      const days = Array.from({ length: WEEKLY_REVIEW_DAYS }, (_, i) => addKstDays(from, i));
      const [entries, motivations] = await Promise.all([
        db.getAll(...days.map((ymd) => user.collection('dailyEntries').doc(ymd))),
        db.getAll(...days.map((ymd) => user.collection('dailyMotivations').doc(ymd))),
      ]);
      const entriesByDay = new Map(entries.map((entry) => [entry.id, entry.data()]));
      const motivationsByDay = new Map(motivations.map((entry) => [entry.id, entry.data()]));
      const observations = days.flatMap((ymd) => coachObservations(ymd, entriesByDay.get(ymd), motivationsByDay.get(ymd)));
      if (observations.length === 0) return json({ kind: 'empty', from, to });

      await enforceQuota(uid, 'coachWeeklyAttempt');
      report = await generateWeeklyCoaching(uid, observations, from, to, language);
      return json(report ? { kind: 'report', report } : { kind: 'blocked', from, to });
    } finally {
      await db.runTransaction(async (tx) => {
        const [current, profile] = await Promise.all([tx.get(ref), tx.get(user)]);
        if (current.get('requestId') !== requestId) return;
        if (report && profile.exists) tx.set(ref, { report });
        else tx.delete(ref);
      });
    }
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, error.status);
    if (error instanceof QuotaExceededError) return json({ error: 'Daily weekly coaching retry limit reached.' }, 429);
    console.error('[coach/weekly] Weekly coaching unavailable');
    return json({ error: 'Weekly coaching is temporarily unavailable.' }, 503);
  }
}
