import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { reviewLeaveRequest } from '@/services/hr.service';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(req);
  if (!session || (session.role !== 'HR' && session.role !== 'ADMIN')) {
    return NextResponse.json({ error: 'Forbidden: HR or Admin access required' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const { status, reviewComment } = await req.json();

    if (status !== 'APPROVED' && status !== 'REJECTED') {
      return NextResponse.json({ error: 'Status must be APPROVED or REJECTED' }, { status: 400 });
    }

    const updated = await reviewLeaveRequest(id, session.id, status, reviewComment);
    return NextResponse.json({ success: true, leave: updated });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to review leave request';
    console.error('Leave review error:', msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(req);
  if (!session || (session.role !== 'HR' && session.role !== 'ADMIN')) {
    return NextResponse.json({ error: 'Forbidden: HR or Admin access required' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const { prisma } = await import('@/lib/db');
    await prisma.leaveRequest.delete({ where: { id } });
    return NextResponse.json({ success: true, id });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to delete leave request';
    console.error('Leave delete error:', msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

