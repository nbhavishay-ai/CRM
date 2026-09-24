import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logAudit } from '@/services/audit.service';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(req);
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  const { id: teamId } = await params;

  try {
    const { userId, role } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 });

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { team: true },
    });
    if (!targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Enforce: Each Team Lead can only lead 1 team
    if (targetUser.role === 'TEAM_LEAD' && targetUser.teamId && targetUser.teamId !== teamId) {
      return NextResponse.json(
        {
          error: `${targetUser.name} is already the Team Lead of "${targetUser.team?.name || 'another team'}". Each Team Lead can only lead 1 team.`,
        },
        { status: 400 }
      );
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        teamId,
        ...(role && { role }),
      },
    });

    await logAudit({
      actorId: session.id,
      action: 'ADD_TEAM_MEMBER',
      entity: 'TEAM',
      entityId: teamId,
      metadata: { userId, userName: updatedUser.name, role: updatedUser.role, teamName: team.name },
    });

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error('Add team member error:', error);
    return NextResponse.json({ error: 'Failed to add team member' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(req);
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  const { id: teamId } = await params;

  try {
    const { userId } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        teamId: null,
      },
    });

    await logAudit({
      actorId: session.id,
      action: 'REMOVE_TEAM_MEMBER',
      entity: 'TEAM',
      entityId: teamId,
      metadata: { userId, userName: user.name },
    });

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error('Remove team member error:', error);
    return NextResponse.json({ error: 'Failed to remove team member' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(req);
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  const { id: teamId } = await params;

  try {
    const { teamLeadId, demotePreviousLead = true } = await req.json();
    if (!teamLeadId) {
      return NextResponse.json({ error: 'Team Lead ID is required' }, { status: 400 });
    }

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 });

    const candidate = await prisma.user.findUnique({
      where: { id: teamLeadId },
      include: { team: true },
    });
    if (!candidate) return NextResponse.json({ error: 'Selected user not found' }, { status: 404 });

    // Enforce: Each Team Lead can only lead 1 team
    if (candidate.role === 'TEAM_LEAD' && candidate.teamId && candidate.teamId !== teamId) {
      return NextResponse.json(
        {
          error: `${candidate.name} is already the Team Lead of "${candidate.team?.name || 'another team'}". Each Team Lead can only lead 1 team.`,
        },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      // 1. Optionally demote previous team lead(s) of this team to EXECUTIVE
      if (demotePreviousLead) {
        await tx.user.updateMany({
          where: {
            teamId,
            role: 'TEAM_LEAD',
            id: { not: teamLeadId },
          },
          data: { role: 'EXECUTIVE' },
        });
      }

      // 2. Promote new team lead and assign to this team
      await tx.user.update({
        where: { id: teamLeadId },
        data: {
          teamId,
          role: 'TEAM_LEAD',
        },
      });
    });

    await logAudit({
      actorId: session.id,
      action: 'ASSIGN_TEAM_LEAD',
      entity: 'TEAM',
      entityId: teamId,
      metadata: { teamLeadId, teamName: team.name },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Assign team lead error:', error);
    return NextResponse.json({ error: 'Failed to assign team lead' }, { status: 500 });
  }
}
