import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getLeadById } from '@/services/lead.service';
import { canAccessLead } from '@/lib/permissions';
import { prisma } from '@/lib/db';
import { logAudit } from '@/services/audit.service';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const lead = await getLeadById(id);

  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  if (!canAccessLead(session, lead)) {
    return NextResponse.json({ error: 'Forbidden: Access to this lead is restricted' }, { status: 403 });
  }

  return NextResponse.json({ lead });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const lead = await getLeadById(id);

  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  if (!canAccessLead(session, lead)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();

    if (body.phone !== undefined && session.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only administrators can edit the phone number' },
        { status: 403 }
      );
    }

    if (body.clientName !== undefined && !String(body.clientName).trim()) {
      return NextResponse.json({ error: 'Client name cannot be empty' }, { status: 400 });
    }

    if (body.phone !== undefined && !String(body.phone).trim()) {
      return NextResponse.json({ error: 'Phone number cannot be empty' }, { status: 400 });
    }

    const updated = await prisma.lead.update({
      where: { id },
      data: {
        ...(body.clientName && { clientName: body.clientName }),
        ...(body.phone && { phone: body.phone }),
        ...(body.alternatePhone !== undefined && { alternatePhone: body.alternatePhone }),
        ...(body.email !== undefined && { email: body.email }),
        ...(body.company !== undefined && { company: body.company }),
        ...(body.location !== undefined && { location: body.location }),
        ...(body.source !== undefined && { source: body.source }),
        ...(body.notes !== undefined && { notes: body.notes }),
        lastUpdatedAt: new Date(),
      },
    });

    await logAudit({
      actorId: session.id,
      action: 'EDIT_LEAD_INFO',
      entity: 'LEAD',
      entityId: id,
      metadata: body,
    });

    return NextResponse.json({ lead: updated });
  } catch (error) {
    console.error('Lead patch error:', error);
    return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Admin or authorized lead management
  if (session.role !== 'ADMIN' && session.role !== 'TEAM_LEAD') {
    return NextResponse.json({ error: 'Forbidden: Admin access required to delete leads' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const { deleteLead } = await import('@/services/lead.service');
    const result = await deleteLead(id, session);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to delete lead';
    console.error('Lead delete error:', msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
