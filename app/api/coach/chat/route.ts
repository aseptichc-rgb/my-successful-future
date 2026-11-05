import { NextRequest, NextResponse } from 'next/server';
import { requireCoach } from '@/lib/aiCoachAccess';
import { parseCoachQuestion, replyToCoachQuestion } from '@/lib/aiCoach';
import { AuthError } from '@/lib/authServer';
import { DAILY_QUOTA } from '@/lib/constants/quota';
import { getAdminDb } from '@/lib/firebase-admin';
import { todayKstYmd } from '@/lib/kstDate';
import { normalizeLanguage } from '@/lib/llmLang';
import { enforceQuota, QuotaExceededError } from '@/lib/quota';
import type { CoachUsage } from '@/lib/aiCoachTypes';

export const runtime = 'nodejs';
export const maxDuration = 45;
const limit = DAILY_QUOTA.coachQuestion;
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: NextRequest) {
  try {
    const { uid } = await requireCoach(request);
    const ymd = todayKstYmd();
    const snap = await getAdminDb().doc(`users/${uid}/usage/${ymd}`).get();
    const used = Number(snap.get('coachQuestion')) || 0;
    return json({ usage: { ymd, limit, remaining: Math.max(0, limit - used) } });
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, error.status);
    return json({ error: 'Coach usage could not be loaded.' }, 503);
  }
}

export async function POST(request: NextRequest) {
  let usage: CoachUsage | undefined;
  try {
    const { uid } = await requireCoach(request);
    const text = await request.text();
    if (text.length > 8192) return json({ error: 'Question payload is too large.' }, 400);
    let body: { language?: unknown; consent?: unknown } | null;
    try { body = JSON.parse(text); }
    catch { return json({ error: 'Enter a valid question.' }, 400); }
    const input = parseCoachQuestion(body);
    if (!input) return json({ error: 'Enter a valid question.' }, 400);
    if (body?.consent !== true) {
      return json({ error: 'Permission to send questions to the AI provider is required.' }, 400);
    }

    const counted = await enforceQuota(uid, 'coachQuestion');
    usage = { ymd: counted.ymd, limit, remaining: limit - counted.used };
    const reply = await replyToCoachQuestion(uid, input, normalizeLanguage(body?.language));
    return json({ usage, reply });
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, error.status);
    if (error instanceof QuotaExceededError) {
      return json({ error: 'Daily question limit reached.', usage: { ymd: error.ymd ?? todayKstYmd(), limit, remaining: 0 } }, 429);
    }
    // No prompt, conversation or provider payload enters the server logs.
    console.error('[coach/chat] Coaching response unavailable');
    return json({ error: 'Coach reply is temporarily unavailable.', usage }, 503);
  }
}
