import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { assignCallingPool } from '@/services/assignment.service';
import { logAudit } from '@/services/audit.service';

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session || (session.role !== 'ADMIN' && session.role !== 'HR')) {
    return NextResponse.json({ error: 'Forbidden: Admin or HR access required' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const count = Number(body.count);
    const newOwnerId = typeof body.newOwnerId === 'string' ? body.newOwnerId : '';

    if (!newOwnerId) {
      return NextResponse.json({ error: 'Executive is required' }, { status: 400 });
    }

    const result = await assignCallingPool({
      count,
      newOwnerId,
      performer: session,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to assign calling records';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session || (session.role !== 'ADMIN' && session.role !== 'HR')) {
    return NextResponse.json({ error: 'Forbidden: Admin or HR access required' }, { status: 403 });
  }

  const { prisma } = await import('@/lib/db');
  const [poolCount, executives] = await Promise.all([
    prisma.lead.count({
      where: {
        currentOwnerId: null,
        currentCategory: 'ACTIVE',
        source: { startsWith: 'Calling:' },
      },
    }),
    prisma.user.findMany({
      where: { role: { in: ['EXECUTIVE', 'TEAM_LEAD'] }, active: true },
      select: { id: true, name: true, email: true, team: { select: { name: true } } },
      orderBy: { name: 'asc' },
    }),
  ]);

  const executiveCounts = await Promise.all(
    executives.map(async (executive) => ({
      ...executive,
      callingDataCount: await prisma.lead.count({
        where: {
          currentOwnerId: executive.id,
          currentCategory: 'ACTIVE',
          source: { startsWith: 'Calling:' },
          OR: [{ lastRemarkedAt: null }, { isNewToMe: true }],
        },
      }),
    }))
  );

  return NextResponse.json({ poolCount, executives: executiveCounts }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession(req);
  if (!session || (session.role !== 'ADMIN' && session.role !== 'HR')) {
    return NextResponse.json({ error: 'Forbidden: Admin or HR access required' }, { status: 403 });
  }

  const ownerId = new URL(req.url).searchParams.get('ownerId');
  if (!ownerId) {
    return NextResponse.json({ error: 'Executive or Team Lead is required' }, { status: 400 });
  }

  const { prisma } = await import('@/lib/db');
  const owner = await prisma.user.findFirst({
    where: { id: ownerId, role: { in: ['EXECUTIVE', 'TEAM_LEAD'] }, active: true },
    select: { id: true, name: true },
  });
  if (!owner) {
    return NextResponse.json({ error: 'Selected user was not found' }, { status: 404 });
  }

  const leads = await prisma.lead.findMany({
    where: {
      currentOwnerId: owner.id,
      source: { startsWith: 'Calling:' },
      lastRemarkedAt: null,
    },
    select: {
      id: true,
      leadNumber: true,
      clientName: true,
      currentStatus: true,
    },
  });

  await prisma.$transaction(async (tx) => {
    const now = new Date();

    for (const lead of leads) {
      await tx.leadUpdate.create({
        data: {
          leadId: lead.id,
          userId: session.id,
          remark: 'Removed from active Calling Data by administrator.',
          disposition: 'CALLING_QUEUE_REMOVED',
          createdAt: now,
        },
      });

      await tx.leadStatusHistory.create({
        data: {
          leadId: lead.id,
          userId: session.id,
          fromStatus: lead.currentStatus,
          toStatus: lead.currentStatus,
          reason: 'Removed from active Calling Data by administrator.',
          createdAt: now,
        },
      });

      await tx.lead.update({
        where: { id: lead.id },
        data: {
          lastRemarkedAt: now,
          isNewToMe: false,
          lastUpdatedAt: now,
        },
      });
    }
  });

  await logAudit({
    actorId: session.id,
    action: 'REMOVE_CALLING_QUEUE',
    entity: 'LEAD',
    entityId: owner.id,
    metadata: {
      ownerName: owner.name,
      count: leads.length,
      leadNumbers: leads.map((lead) => lead.leadNumber),
    },
  });

  return NextResponse.json({
    success: true,
    removedCount: leads.length,
    ownerName: owner.name,
  });
}
