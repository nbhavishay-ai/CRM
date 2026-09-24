import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { completeFollowup } from '@/services/followup.service';
import { getLeadById } from '@/services/lead.service';
import { canAccessLead } from '@/lib/permissions';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const lead = await getLeadById(id);
  if (!lead || !canAccessLead(session, lead)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const followups = await prisma.leadFollowup.findMany({
    where: { leadId: id },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { dueAt: 'desc' },
  });

  return NextResponse.json({ followups });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const lead = await getLeadById(id);
  if (!lead || !canAccessLead(session, lead)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();

    // If completing an existing followup
    if (body.followupId && body.outcome) {
      const result = await completeFollowup({
        followupId: body.followupId,
        leadId: id,
        user: session,
        outcome: body.outcome,
        nextAction: body.nextAction,
        nextActionAt: body.nextActionAt,
        newStatus: body.newStatus,
      });
      return NextResponse.json({ success: true, result });
    }

    // Scheduling a new followup
    if (!body.dueAt) {
      return NextResponse.json({ error: 'Due date is required' }, { status: 400 });
    }

    const dueAt = new Date(body.dueAt);
    const followup = await prisma.leadFollowup.create({
      data: {
        leadId: id,
        userId: session.id,
        dueAt,
        nextAction: body.nextAction || 'Follow-up Call',
      },
    });

    await prisma.lead.update({
      where: { id },
      data: {
        nextAction: body.nextAction || 'Follow-up Call',
        nextActionAt: dueAt,
        lastUpdatedAt: new Date(),
      },
    });

    return NextResponse.json({ followup }, { status: 201 });
  } catch (error) {
    console.error('Followup error:', error);
    return NextResponse.json({ error: 'Failed to process followup' }, { status: 500 });
  }
}
