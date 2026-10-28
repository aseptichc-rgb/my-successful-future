import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestUser, AuthError } from '@/lib/authServer';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await verifyRequestUser(request);
    return NextResponse.json({ entitlement: user.entitlement }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof AuthError ? error.message : 'Membership lookup unavailable.' },
      { status: error instanceof AuthError ? error.status : 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
