import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { comparePassword, signToken, AUTH_COOKIE_NAME } from '@/lib/auth';
import { logAudit } from '@/services/audit.service';
import { UserRole } from '@/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const identifier = email.trim();
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier.toLowerCase() },
          { name: identifier },
          { name: identifier.toLowerCase() },
          ...(identifier.toLowerCase() === 'admin@orvion.com' ? [{ email: 'nehra@orvion.com' }] : []),
        ],
      },
      include: { team: { select: { id: true, name: true } } },
    });

    if (!user) {
      return NextResponse.json({ error: 'Incorrect username' }, { status: 401 });
    }

    if (!user.active) {
      return NextResponse.json({ error: 'Account is deactivated' }, { status: 401 });
    }

    const isValid = await comparePassword(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
    }

    // Update lastLoginAt
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const sessionPayload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as UserRole,
      teamId: user.teamId,
      teamName: user.team?.name || null,
    };

    const token = signToken(sessionPayload);

    await logAudit({
      actorId: user.id,
      action: 'LOGIN',
      entity: 'AUTH',
      entityId: user.id,
      metadata: { role: user.role, email: user.email },
    });

    const res = NextResponse.json({ success: true, user: sessionPayload, token });
    res.cookies.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return res;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
