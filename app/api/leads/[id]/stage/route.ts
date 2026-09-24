import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getLeadById, addLeadUpdate } from '@/services/lead.service';
import { canAccessLead } from '@/lib/permissions';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.role === 'HR') {
    return NextResponse.json({ error: 'Forbidden: HR cannot access leads' }, { status: 403 });
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
    const { stage, remark } = body;

    if (!stage) {
      return NextResponse.json({ error: 'stage is required' }, { status: 400 });
    }

    const updated = await addLeadUpdate({
      leadId: id,
      status: stage,
      remark: remark || `Pipeline stage moved to ${stage.replace('_', ' ')} via Kanban Board`,
      user: session,
    });

    return NextResponse.json({ success: true, lead: updated });
  } catch (error: any) {
    console.error('Kanban stage update error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update stage' }, { status: 500 });
  }
}
