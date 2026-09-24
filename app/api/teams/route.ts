import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logAudit } from '@/services/audit.service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (session.role === 'TEAM_LEAD' && session.teamId) {
    where.id = session.teamId;
  }

  const teams = await prisma.team.findMany({
    where,
    include: {
      members: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          active: true,
          _count: {
            select: {
              ownedLeads: { where: { currentCategory: 'ACTIVE' } },
            },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  // Admins can populate company-wide assignment pickers. Team Leads only
  // receive executives from their own team.
  const availableUsersWhere: {
    active: boolean;
    role: { in: string[] };
    teamId?: string;
  } = {
    active: true,
    role: { in: session.role === 'TEAM_LEAD' ? ['EXECUTIVE'] : ['EXECUTIVE', 'TEAM_LEAD'] },
  };
  if (session.role === 'TEAM_LEAD') {
    const currentUser = await prisma.user.findUnique({
      where: { id: session.id },
      select: { teamId: true },
    });
    availableUsersWhere.teamId = currentUser?.teamId || session.teamId || '__no_team__';
  }

  const availableUsers = await prisma.user.findMany({
    where: availableUsersWhere,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      teamId: true,
      team: { select: { id: true, name: true } },
    },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json(
    { teams, availableUsers },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    }
  );
}

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  try {
    const { name, description, teamLeadId, memberIds } = await req.json();
    if (!name) return NextResponse.json({ error: 'Team name is required' }, { status: 400 });

    // Enforce: Each Team Lead can only lead 1 team
    if (teamLeadId) {
      const leadCandidate = await prisma.user.findUnique({
        where: { id: teamLeadId },
        include: { team: true },
      });
      if (!leadCandidate) {
        return NextResponse.json({ error: 'Selected Team Lead user not found' }, { status: 404 });
      }
      if (leadCandidate.role === 'TEAM_LEAD' && leadCandidate.teamId) {
        return NextResponse.json(
          {
            error: `${leadCandidate.name} is already the Team Lead of "${leadCandidate.team?.name || 'another team'}". Each Team Lead can only lead 1 team.`,
          },
          { status: 400 }
        );
      }
    }

    // Enforce: Active Team Leads cannot be poached as executive members of another team
    if (Array.isArray(memberIds) && memberIds.length > 0) {
      const activeLeads = await prisma.user.findMany({
        where: {
          id: { in: memberIds },
          role: 'TEAM_LEAD',
          teamId: { not: null },
        },
        include: { team: true },
      });
      if (activeLeads.length > 0) {
        const conflicted = activeLeads[0];
        return NextResponse.json(
          {
            error: `${conflicted.name} is already the Team Lead of "${conflicted.team?.name || 'another team'}". A Team Lead cannot be assigned to another team while actively leading a team.`,
          },
          { status: 400 }
        );
      }
    }

    const team = await prisma.$transaction(async (tx) => {
      const created = await tx.team.create({
        data: { name, description },
      });

      // 1. Assign Team Lead if provided
      if (teamLeadId) {
        await tx.user.update({
          where: { id: teamLeadId },
          data: {
            teamId: created.id,
            role: 'TEAM_LEAD',
          },
        });
      }

      // 2. Assign executive members if provided
      if (Array.isArray(memberIds) && memberIds.length > 0) {
        const executiveIds = memberIds.filter((id: string) => id !== teamLeadId);
        if (executiveIds.length > 0) {
          await tx.user.updateMany({
            where: { id: { in: executiveIds } },
            data: { teamId: created.id },
          });
        }
      }

      return tx.team.findUnique({
        where: { id: created.id },
        include: {
          members: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              active: true,
              _count: {
                select: {
                  ownedLeads: { where: { currentCategory: 'ACTIVE' } },
                },
              },
            },
          },
        },
      });
    });

    await logAudit({
      actorId: session.id,
      action: 'CREATE_TEAM',
      entity: 'TEAM',
      entityId: team?.id,
      metadata: { name, teamLeadId, membersCount: memberIds?.length || 0 },
    });

    return NextResponse.json({ team }, { status: 201 });
  } catch (error) {
    console.error('Create team error:', error);
    return NextResponse.json({ error: 'Failed to create team' }, { status: 500 });
  }
}
