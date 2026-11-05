import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { TRIAL_DURATION_MS } from '@/lib/constants/quota';
import { exchangeTossCode, tossAuthConfigured, tossFirebaseUid, TOSS_APP_NAME, TOSS_ORIGINS, validTossCode } from '@/lib/tossAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export function GET() {
  return json({ appName: TOSS_APP_NAME, ready: tossAuthConfigured(), protocol: 'anon-code-v1' });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (origin && !TOSS_ORIGINS.some((allowed) => allowed === origin) &&
      !(process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1):(?:5173|4173)$/.test(origin))) {
    return json({ error: '허용되지 않은 앱 주소예요.' }, 403);
  }
  if (!tossAuthConfigured()) return json({ error: '토스 연결을 준비하고 있어요. 잠시 후 다시 이용해 주세요.' }, 503);
  let code: unknown;
  try {
    const text = await req.text();
    if (text.length > 4096) return json({ error: '인증 요청이 너무 커요.' }, 400);
    code = (JSON.parse(text) as { code?: unknown }).code;
  } catch { return json({ error: '올바른 인증 요청이 아니에요.' }, 400); }
  if (!validTossCode(code)) return json({ error: '새 인증 코드가 필요해요. 다시 시작해 주세요.' }, 400);
  let anonKey: string;
  try { anonKey = await exchangeTossCode(code); }
  catch { return json({ error: '토스 사용자 확인에 실패했어요. 다시 시작해 주세요.' }, 401); }

  try {
    const uid = tossFirebaseUid(anonKey);
    const auth = getAdminAuth();
    let record;
    try { record = await auth.getUser(uid); }
    catch (err) {
      if ((err as { code?: string }).code !== 'auth/user-not-found') throw err;
      try { record = await auth.createUser({ uid, displayName: '나' }); }
      catch (createError) {
        if ((createError as { code?: string }).code !== 'auth/uid-already-exists') throw createError;
        record = await auth.getUser(uid);
      }
    }
    if (record.disabled) return json({ error: '이 계정은 이용이 제한되어 있어요.' }, 403);
    const db = getAdminDb();
    const profile = db.doc(`users/${uid}`);
    // A one-way identifier and first trial timestamp prevent trial resets after deletion.
    // Raw anonKey, auth codes and tokens are never persisted.
    const ledger = db.doc(`trialLedger/${uid}`);
    const trialEndsAt = await db.runTransaction(async (tx) => {
      const [existingProfile, existingTrial] = await Promise.all([tx.get(profile), tx.get(ledger)]);
      const firstTrialAt = existingTrial.exists ? existingTrial.get('firstTrialAt') : Timestamp.now();
      if (!(firstTrialAt instanceof Timestamp)) throw new Error('Invalid Toss trial ledger');
      if (!existingTrial.exists) tx.create(ledger, { firstTrialAt });
      if (!existingProfile.exists) tx.create(profile, {
        displayName: '나', email: '', language: 'ko', createdAt: Timestamp.now(),
        trialEndsAt: Timestamp.fromMillis(firstTrialAt.toMillis() + TRIAL_DURATION_MS),
      });
      return firstTrialAt.toMillis() + TRIAL_DURATION_MS;
    });
    await auth.setCustomUserClaims(uid, { ...record.customClaims, tossApp: TOSS_APP_NAME,
      trialEndsAt: typeof record.customClaims?.trialEndsAt === 'number' ? record.customClaims.trialEndsAt : trialEndsAt });
    return json({ customToken: await auth.createCustomToken(uid) });
  } catch {
    // Never log the one-time code, identifier or token, even on provider errors.
    console.error('[auth/toss-session] Firebase session initialization failed');
    return json({ error: '기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' }, 503);
  }
}
