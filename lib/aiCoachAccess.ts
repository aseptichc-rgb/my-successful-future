import type { NextRequest } from 'next/server';
import { AuthError, verifyRequestUser } from './authServer';
import { hasProAccess } from './entitlement';

function checkCoachAccess(user: Awaited<ReturnType<typeof verifyRequestUser>>) {
  if (!hasProAccess(user.entitlement)) throw new AuthError(402, 'The coach requires an active trial or Pro access.');
  if (user.tossApp && process.env.TOSS_AI_COACH_DISABLED === 'true') {
    throw new AuthError(503, 'Coaching is temporarily unavailable.');
  }
  return user;
}

export async function requireCoach(request: NextRequest) {
  return checkCoachAccess(await verifyRequestUser(request));
}

export async function requireTossCoach(request: NextRequest) {
  const user = await verifyRequestUser(request);
  if (!user.tossApp) throw new AuthError(403, 'The coach is available in the Toss mini app.');
  return checkCoachAccess(user);
}
