import { NextResponse } from 'next/server';
import { getSession, signToken, AUTH_COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { UserRole } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { id: session.id },
        ...(session.email ? [{ email: session.email.toLowerCase().trim() }] : []),
        ...(session.email ? [{ email: session.email.trim() }] : []),
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      teamId: true,
      team: { select: { id: true, name: true } },
    },
  });

  if (!user || !user.active) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const userPayload = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    teamId: user.teamId,
    teamName: user.team?.name || null,
  };

  const res = NextResponse.json({ user: userPayload });

  // Refresh the session on every heartbeat so installed PWAs do not expire
  // while the user is actively working.
  const token = signToken({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as UserRole,
    teamId: user.teamId,
    teamName: user.team?.name || null,
  });
  res.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  return res;
}
