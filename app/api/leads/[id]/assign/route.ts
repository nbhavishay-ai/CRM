import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { reassignLead } from '@/services/assignment.service';
import { canReassignLead } from '@/lib/permissions';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canReassignLead(session)) {
    return NextResponse.json({ error: 'Forbidden: You do not have permission to reassign leads' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const { newOwnerId, reason } = await req.json();

    if (!newOwnerId) {
      return NextResponse.json({ error: 'New owner ID is required' }, { status: 400 });
    }

    const updatedLead = await reassignLead({
      leadId: id,
      newOwnerId,
      performer: session,
      reason,
    });

    return NextResponse.json({ success: true, lead: updatedLead });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to reassign lead';
    console.error('Reassignment error:', msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
