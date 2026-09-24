import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logAudit } from '@/services/audit.service';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(req);
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden: Admin access required to delete teams' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const team = await prisma.team.findUnique({
      where: { id },
      include: { members: { select: { id: true, name: true, role: true } } },
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Unlink all team members
      await tx.user.updateMany({
        where: { teamId: id },
        data: { teamId: null },
      });

      // 2. Delete team
      await tx.team.delete({
        where: { id },
      });
    });

    await logAudit({
      actorId: session.id,
      action: 'DELETE_TEAM',
      entity: 'TEAM',
      entityId: id,
      metadata: {
        teamName: team.name,
        unlinkedMembersCount: team.members.length,
      },
    });

    return NextResponse.json({ success: true, id, teamName: team.name });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to delete team';
    console.error('Delete team error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
