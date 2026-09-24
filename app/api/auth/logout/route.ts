import { NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, getSession } from '@/lib/auth';
import { logAudit } from '@/services/audit.service';

export async function POST() {
  const session = await getSession();
  if (session) {
    await logAudit({
      actorId: session.id,
      action: 'LOGOUT',
      entity: 'AUTH',
      entityId: session.id,
    });
  }

  const res = NextResponse.json({ success: true, message: 'Logged out successfully' });
  res.cookies.set(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
  });

  return res;
}
