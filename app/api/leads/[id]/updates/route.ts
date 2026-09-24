import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { addLeadUpdate, getLeadById } from '@/services/lead.service';
import { canAccessLead } from '@/lib/permissions';

export async function POST(
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
    const { remark, status, nextAction, nextActionAt, clientName, discardOnNegativeStatus } = await req.json();

    if (!remark || !remark.trim()) {
      return NextResponse.json({ error: 'Remark is required' }, { status: 400 });
    }

    if (
      clientName !== undefined &&
      !['ADMIN', 'TEAM_LEAD', 'EXECUTIVE'].includes(session.role)
    ) {
      return NextResponse.json(
        { error: 'Only authorized lead users can edit the client name' },
        { status: 403 }
      );
    }

    const updated = await addLeadUpdate({
      leadId: id,
      remark: remark.trim(),
      status,
      nextAction,
      nextActionAt,
      clientName: clientName?.trim(),
      discardOnNegativeStatus: discardOnNegativeStatus === true,
      user: session,
    });

    return NextResponse.json({ success: true, lead: updated }, { status: 201 });
  } catch (error) {
    console.error('Add lead update error:', error);
    return NextResponse.json({ error: 'Failed to record update' }, { status: 500 });
  }
}
