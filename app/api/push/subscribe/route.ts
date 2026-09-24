import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getVapidPublicKey } from '@/lib/push';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ publicKey: getVapidPublicKey() });
}

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ error: 'Invalid push subscription' }, { status: 400 });
  }

  const subscription = await prisma.pushSubscription.upsert({
    where: { endpoint: body.endpoint },
    update: {
      userId: session.id,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: req.headers.get('user-agent'),
    },
    create: {
      userId: session.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: req.headers.get('user-agent'),
    },
  });

  return NextResponse.json({ success: true, id: subscription.id });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { endpoint } = await req.json();
  if (endpoint) await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: session.id } });
  return NextResponse.json({ success: true });
}