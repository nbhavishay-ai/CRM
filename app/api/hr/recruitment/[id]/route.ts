import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { updateCandidateStage } from '@/services/hr.service';

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
    const { stage, rating, notes } = await req.json();

    if (!stage) {
      return NextResponse.json({ error: 'Stage is required' }, { status: 400 });
    }

    const updated = await updateCandidateStage(id, stage, rating ? parseInt(rating, 10) : undefined, notes);
    return NextResponse.json({ success: true, candidate: updated });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to update candidate';
    console.error('Candidate stage error:', msg);
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
    await prisma.candidate.delete({ where: { id } });
    return NextResponse.json({ success: true, id });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to delete candidate';
    console.error('Candidate delete error:', msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

