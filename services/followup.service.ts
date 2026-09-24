import { prisma } from '@/lib/db';
import { UserSession } from '@/types';
import { logAudit } from './audit.service';
import { CALLING_SOURCE_PREFIX } from '@/lib/lead-pipeline';
import { getMarkOutRequest, getMyTodayAttendance } from './hr.service';
import { createNotification } from './notification.service';

export async function completeFollowup(params: {
  followupId: string;
  leadId?: string;
  user: UserSession;
  outcome: string;
  nextAction?: string;
  nextActionAt?: Date | string | null;
  newStatus?: string;
}) {
  const followup = await prisma.leadFollowup.findUnique({
    where: { id: params.followupId },
    include: { lead: true },
  });

  if (!followup) throw new Error('Followup not found');
  if (params.leadId && followup.leadId !== params.leadId) {
    throw new Error('Followup does not belong to the requested lead');
  }

  const nextDate = params.nextActionAt ? new Date(params.nextActionAt) : null;
  const statusToSet = params.newStatus || followup.lead.currentStatus;
  const isCallingData = followup.lead.source.startsWith(CALLING_SOURCE_PREFIX);
  const isCallingNonActionable =
    isCallingData &&
    ['NOT_INTERESTED', 'NOT_ANSWERING', 'SWITCH_OFF', 'OTHER'].includes(statusToSet);

  // Determine category based on status
  let category = followup.lead.currentCategory;
  if (statusToSet === 'NOT_ANSWERING') category = 'NOT_ANSWERING';
  else if (statusToSet === 'NOT_INTERESTED') category = 'NOT_INTERESTED';
  else if (statusToSet === 'CHANNEL_PARTNER') category = 'CHANNEL_PARTNER';
  else if (statusToSet === 'OTHER') category = 'OTHER';
  else if (statusToSet === 'CLOSED_WON' || statusToSet === 'CLOSED_LOST') category = 'CLOSED';
  else category = 'ACTIVE';

  const result = await prisma.$transaction(async (tx) => {
    // 1. Complete current followup
    const completed = await tx.leadFollowup.update({
      where: { id: params.followupId },
      data: {
        completedAt: new Date(),
        outcome: params.outcome,
        nextAction: params.nextAction || null,
      },
    });

    // Calling Data retains only actionable outcomes as calling remarks.
    if (!isCallingNonActionable) {
      await tx.leadUpdate.create({
        data: {
          leadId: followup.leadId,
          userId: params.user.id,
          remark: `Follow-up completed: ${params.outcome}`,
          nextAction: params.nextAction || null,
          nextActionAt: nextDate,
          disposition: isCallingData ? 'CALLING_DATA' : 'LEAD',
        },
      });
    }

    // 3. Create next followup if scheduled
    if (nextDate) {
      await tx.leadFollowup.create({
        data: {
          leadId: followup.leadId,
          userId: params.user.id,
          dueAt: nextDate,
          nextAction: params.nextAction || 'Follow-up',
        },
      });
    }

    // 4. Update lead current state
    const updatedLead = await tx.lead.update({
      where: { id: followup.leadId },
      data: {
        currentStatus: statusToSet,
        currentCategory: category,
        nextAction: params.nextAction || null,
        nextActionAt: nextDate,
        isNewToMe: false,
        lastRemarkedAt: new Date(),
        lastUpdatedAt: new Date(),
      },
    });

    return { completed, updatedLead };
  });

  await logAudit({
    actorId: params.user.id,
    action: 'COMPLETE_FOLLOWUP',
    entity: 'FOLLOWUP',
    entityId: params.followupId,
    metadata: {
      leadNumber: followup.lead.leadNumber,
      outcome: params.outcome,
      nextAction: params.nextAction,
      status: statusToSet,
      category,
    },
  });

  try {
    const { recalculateLeadScore } = await import('./scoring.service');
    await recalculateLeadScore(followup.leadId);
  } catch (err) {
    console.error('Failed to recalculate lead score:', err);
  }

  return result;
}

export async function syncUserFollowupAlerts(userId: string) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const dueLeads = await prisma.lead.findMany({
    where: {
      currentOwnerId: userId,
      currentCategory: 'ACTIVE',
      OR: [
        { nextActionAt: { lt: startOfToday } },
        { nextActionAt: { gte: startOfToday, lte: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999) } },
        { isNewToMe: true },
      ],
    },
    select: {
      id: true,
      leadNumber: true,
      clientName: true,
      nextActionAt: true,
      isNewToMe: true,
      currentOwnerId: true,
    },
    orderBy: [{ nextActionAt: 'asc' }, { createdAt: 'desc' }],
  });

  const createdAlerts: string[] = [];

  for (const lead of dueLeads) {
    const isOverdue = lead.nextActionAt && new Date(lead.nextActionAt) < startOfToday;
    const title = isOverdue ? 'Follow-up Overdue' : 'Follow-up Due Today';
    const message = `${lead.leadNumber} • ${lead.clientName} ${isOverdue ? 'is overdue for follow-up' : 'needs a follow-up today'}.`;

    const existing = await prisma.notification.findFirst({
      where: {
        userId,
        link: `/dashboard/leads/${lead.id}`,
        title,
      },
      select: { id: true },
    });

    if (!existing) {
      const notification = await createNotification({
        userId,
        type: 'FOLLOWUP_DUE',
        title,
        message,
        link: `/dashboard/leads/${lead.id}`,
      });

      if (notification) {
        createdAlerts.push(notification.id);
      }
    }
  }

  return createdAlerts.length;
}

export async function getCallingData(
  user: UserSession,
  filters?: { ownerId?: string; teamId?: string; search?: string; includeMatrix?: boolean }
) {
  if (user.role === 'EXECUTIVE') {
    const attendance = await getMyTodayAttendance(user.id);
    const markOutRequest = await getMarkOutRequest(user.id);
    if (!attendance?.clockIn || (attendance.clockOut && markOutRequest?.status !== 'APPROVED')) {
      return {
        overdue: [],
        callToday: [],
        upcoming: [],
        metrics: {
          totalCallingPool: 0,
          overdueCount: 0,
          callTodayCount: 0,
          upcomingCount: 0,
          completedTodayCount: 0,
        },
        executiveMatrix: [],
        unassignedCallingPool: [],
        unassignedCallingPoolCount: 0,
        isClockedIn: false,
        markOutRequest,
      };
    }
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const whereScope: any = {
    currentCategory: 'ACTIVE',
    source: { startsWith: CALLING_SOURCE_PREFIX },
    AND: [
      {
        OR: [
          { lastRemarkedAt: null },
          { isNewToMe: true },
        ],
      },
    ],
  };

  let effectiveTeamId = user.teamId;
  if (user.role === 'TEAM_LEAD' && !effectiveTeamId) {
    const currentUser = await prisma.user.findUnique({ where: { id: user.id }, select: { teamId: true } });
    effectiveTeamId = currentUser?.teamId || null;
  }

  if (user.role === 'EXECUTIVE') {
    whereScope.currentOwnerId = user.id;
  } else if (user.role === 'TEAM_LEAD' && effectiveTeamId) {
    whereScope.currentOwner = filters?.ownerId
      ? { id: filters.ownerId, teamId: effectiveTeamId }
      : { teamId: effectiveTeamId };
  } else if (user.role === 'TEAM_LEAD') {
    whereScope.currentOwnerId = user.id;
  } else if (user.role === 'ADMIN') {
    if (filters?.ownerId) {
      whereScope.currentOwnerId = filters.ownerId;
    }
    if (filters?.teamId) {
      whereScope.currentOwner = { teamId: filters.teamId };
    }
  }

  if (filters?.search && filters.search.trim()) {
    const q = filters.search.trim();
    whereScope.AND = [
      ...(whereScope.AND || []),
      {
        OR: [
          { clientName: { contains: q } },
          { phone: { contains: q } },
          { leadNumber: { contains: q } },
          { company: { contains: q } },
        ],
      },
    ];
  }

  const [overdue, callToday, upcoming, completedTodayCount, totalActiveCallingPool, executives, unassignedCallingPool, unassignedCallingPoolCount] = await Promise.all([
    // Overdue calls (scheduled before today and not newly assigned)
    prisma.lead.findMany({
      where: {
        ...whereScope,
        nextActionAt: { lt: startOfToday },
        isNewToMe: false,
      },
      include: {
        currentOwner: { select: { id: true, name: true, team: { select: { id: true, name: true } } } },
        updates: {
          where: { disposition: 'CALLING_DATA' },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: [{ nextActionAt: 'asc' }, { leadNumber: 'asc' }],
    }),
    // Due today: scheduled for today OR uncontacted/null nextActionAt OR newly assigned to executive
    prisma.lead.findMany({
      where: {
        ...whereScope,
        OR: [
          { nextActionAt: { gte: startOfToday, lte: endOfToday } },
          { nextActionAt: null },
          { isNewToMe: true },
          {
            assignments: {
              some: {
                timestamp: { gte: startOfToday, lte: endOfToday },
              },
            },
          },
        ],
      },
      include: {
        currentOwner: { select: { id: true, name: true, team: { select: { id: true, name: true } } } },
        updates: {
          where: { disposition: 'CALLING_DATA' },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: [
        { isNewToMe: 'desc' },
        { nextActionAt: 'asc' },
        { createdAt: 'desc' },
        { leadNumber: 'asc' },
      ],
    }),
    // Upcoming calls (scheduled for future dates beyond today and not newly assigned)
    prisma.lead.findMany({
      where: {
        ...whereScope,
        nextActionAt: { gt: endOfToday },
        isNewToMe: false,
      },
      include: {
        currentOwner: { select: { id: true, name: true, team: { select: { id: true, name: true } } } },
        updates: {
          where: { disposition: 'CALLING_DATA' },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: [{ nextActionAt: 'asc' }, { leadNumber: 'asc' }],
    }),
    // Completed updates/calls today
    prisma.leadUpdate.count({
      where: {
        createdAt: { gte: startOfToday, lte: endOfToday },
        disposition: 'CALLING_DATA',
        ...(user.role === 'EXECUTIVE' ? { userId: user.id } : {}),
        ...(user.role === 'TEAM_LEAD' && effectiveTeamId
          ? { user: { teamId: effectiveTeamId } }
          : {}),
      },
    }),
    // Total active calling pool
    prisma.lead.count({
      where: whereScope,
    }),
    // Active Executives breakdown (for Admin / Team Lead)
    filters?.includeMatrix !== false && (user.role === 'ADMIN' || user.role === 'TEAM_LEAD')
      ? prisma.user.findMany({
          where: {
            role: 'EXECUTIVE',
            active: true,
            ...(user.role === 'TEAM_LEAD' && effectiveTeamId ? { teamId: effectiveTeamId } : {}),
          },
          select: {
            id: true,
            name: true,
            email: true,
            team: { select: { id: true, name: true } },
            ownedLeads: {
              where: {
                currentCategory: 'ACTIVE',
                source: { startsWith: CALLING_SOURCE_PREFIX },
                OR: [
                  { lastRemarkedAt: null },
                  { isNewToMe: true },
                ],
              },
              select: {
                id: true,
                nextActionAt: true,
                isNewToMe: true,
              },
            },
            leadUpdates: {
              where: { createdAt: { gte: startOfToday, lte: endOfToday }, disposition: 'CALLING_DATA' },
              select: { id: true },
            },
          },
          orderBy: { name: 'asc' },
        })
      : Promise.resolve([]),
    user.role === 'ADMIN'
      ? prisma.lead.findMany({
          where: {
            currentOwnerId: null,
            currentCategory: 'ACTIVE',
            source: { startsWith: CALLING_SOURCE_PREFIX },
            OR: [
              { lastRemarkedAt: null },
              { isNewToMe: true },
            ],
          },
          include: {
            currentOwner: { select: { id: true, name: true, team: { select: { id: true, name: true } } } },
            updates: { where: { disposition: 'CALLING_DATA' }, take: 1, orderBy: { createdAt: 'desc' } },
          },
          orderBy: [{ createdAt: 'asc' }, { leadNumber: 'asc' }],
        })
      : Promise.resolve([]),
    user.role === 'ADMIN'
      ? prisma.lead.count({
          where: {
            currentOwnerId: null,
            currentCategory: 'ACTIVE',
            source: { startsWith: CALLING_SOURCE_PREFIX },
          },
        })
      : Promise.resolve(0),
  ]);

  const recentCallingUpdates = await prisma.leadUpdate.findMany({
    where: {
      disposition: 'CALLING_DATA',
      ...(user.role === 'EXECUTIVE' ? { userId: user.id } : {}),
      ...(user.role === 'TEAM_LEAD' && effectiveTeamId ? { user: { teamId: effectiveTeamId } } : {}),
      ...(filters?.search
        ? {
            lead: {
              OR: [
                { clientName: { contains: filters.search.trim() } },
                { phone: { contains: filters.search.trim() } },
                { leadNumber: { contains: filters.search.trim() } },
              ],
            },
          }
        : {}),
    },
    include: {
      user: { select: { id: true, name: true } },
      lead: {
        select: {
          id: true,
          leadNumber: true,
          clientName: true,
          phone: true,
          currentStatus: true,
          currentOwner: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const markOutRequest = user.role === 'EXECUTIVE' ? await getMarkOutRequest(user.id) : null;
  const executiveMatrix = (executives || []).map((exec) => {
    const active = exec.ownedLeads || [];
    const dueToday = active.filter(
      (l) => !l.nextActionAt || l.isNewToMe || (new Date(l.nextActionAt) >= startOfToday && new Date(l.nextActionAt) <= endOfToday)
    ).length;
    const isOverdueCount = active.filter(
      (l) => l.nextActionAt && new Date(l.nextActionAt) < startOfToday && !l.isNewToMe
    ).length;
    const completed = exec.leadUpdates?.length || 0;

    return {
      id: exec.id,
      name: exec.name,
      email: exec.email,
      teamName: exec.team?.name || 'Unassigned Team',
      totalActiveLeads: active.length,
      dueTodayCount: dueToday,
      overdueCount: isOverdueCount,
      completedTodayCount: completed,
    };
  });

  return {
    overdue,
    callToday,
    upcoming,
    metrics: {
      totalCallingPool: totalActiveCallingPool,
      overdueCount: overdue.length,
      callTodayCount: callToday.length,
      upcomingCount: upcoming.length,
      completedTodayCount,
    },
    executiveMatrix,
    unassignedCallingPool,
    unassignedCallingPoolCount,
    recentCallingUpdates,
    isClockedIn: true,
    markOutRequest,
  };
}
