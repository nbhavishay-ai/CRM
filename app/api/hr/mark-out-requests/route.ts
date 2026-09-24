import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createNotification } from '@/services/notification.service';

function todayInIndia() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const date = new URL(req.url).searchParams.get('date') || todayInIndia();
  if (session.role === 'ADMIN') {
    const requests = await prisma.markOutRequest.findMany({
      where: { date, status: 'PENDING' },
      include: { user: { select: { id: true, name: true, email: true, role: true, team: { select: { name: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({ requests });
  }

  const request = await prisma.markOutRequest.findUnique({
    where: { userId_date: { userId: session.id, date } },
  });
  return NextResponse.json({ request });
}

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const date = body.date || todayInIndia();

  if (body.action === 'REQUEST') {
    if (session.role !== 'EXECUTIVE') return NextResponse.json({ error: 'Only executives can request mark-out correction' }, { status: 403 });
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < 5) return NextResponse.json({ error: 'Please provide a reason of at least 5 characters' }, { status: 400 });

    const request = await prisma.markOutRequest.upsert({
      where: { userId_date: { userId: session.id, date } },
      create: { userId: session.id, date, reason, status: 'PENDING' },
      update: { reason, status: 'PENDING', reviewedById: null, reviewedAt: null },
      include: { user: { select: { name: true } } },
    });
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN', active: true }, select: { id: true } });
    await Promise.all(admins.map((admin) => createNotification({
      userId: admin.id,
      type: 'ATTENDANCE_MARK_OUT_REQUEST',
      title: 'Calling access request',
      message: `${request.user.name} marked out by mistake and is requesting calling access.`,
      link: '/dashboard/admin/calling',
    })));
    return NextResponse.json({ request });
  }

  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Only admins can review requests' }, { status: 403 });
  if (!body.requestId || !['APPROVED', 'REJECTED'].includes(body.status)) {
    return NextResponse.json({ error: 'requestId and a valid status are required' }, { status: 400 });
  }

  const request = await prisma.markOutRequest.update({
    where: { id: body.requestId },
    data: { status: body.status, reviewedById: session.id, reviewedAt: new Date() },
    include: { user: { select: { name: true } } },
  });
  await createNotification({
    userId: request.userId,
    type: 'ATTENDANCE_MARK_OUT_REVIEW',
    title: body.status === 'APPROVED' ? 'Calling access approved' : 'Calling access request declined',
    message: body.status === 'APPROVED'
      ? 'Admin approved your correction request. Your calling numbers are now available.'
      : 'Admin declined your calling access correction request.',
    link: '/dashboard/executive/calling',
  });
  return NextResponse.json({ request });
}
