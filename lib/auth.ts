import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { UserSession } from '@/types';

const JWT_SECRET = process.env.JWT_SECRET;
if (process.env.NODE_ENV === 'production' && !JWT_SECRET) {
  throw new Error('JWT_SECRET must be configured in production');
}
const signingSecret = JWT_SECRET || 'orvion-development-only-secret';
const COOKIE_NAME = 'orvion_session';

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: UserSession): string {
  return jwt.sign(payload, signingSecret, { expiresIn: '30d' });
}

export function verifyToken(token: string): UserSession | null {
  try {
    return jwt.verify(token, signingSecret) as UserSession;
  } catch {
    return null;
  }
}

/**
 * Universal session resolver for Server Components, Route Handlers, and Mobile APIs.
 * Checks Authorization header (Bearer <token>), request cookies, and server cookie store.
 */
export async function getSession(req?: NextRequest): Promise<UserSession | null> {
  // 1. Check Authorization header (essential for future mobile apps)
  if (req) {
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      const session = verifyToken(token);
      if (session) return resolveCurrentSession(session);
    }

    // 2. Check NextRequest cookies
    const reqToken = req.cookies.get(COOKIE_NAME)?.value;
    if (reqToken) {
      const session = verifyToken(reqToken);
      if (session) return resolveCurrentSession(session);
    }
  }

  // 3. Fallback to next/headers cookies() for Server Components
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    const session = verifyToken(token);
    return session ? resolveCurrentSession(session) : null;
  } catch {
    return null;
  }
}

export async function getSessionFromRequest(req: NextRequest): Promise<UserSession | null> {
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    const session = verifyToken(token);
    if (session) return resolveCurrentSession(session);
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = verifyToken(token);
  return session ? resolveCurrentSession(session) : null;
}

async function resolveCurrentSession(session: UserSession): Promise<UserSession | null> {
  const { prisma } = await import('@/lib/db');
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, name: true, email: true, role: true, active: true, teamId: true, team: { select: { name: true } } },
  });

  if (!user || !user.active) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as UserSession['role'],
    teamId: user.teamId,
    teamName: user.team?.name || null,
  };
}

export const AUTH_COOKIE_NAME = COOKIE_NAME;
