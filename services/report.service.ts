import { prisma } from '@/lib/db';
import { UserSession } from '@/types';
import { CALLING_SOURCE_PREFIX } from '@/lib/lead-pipeline';

export async function getPerformanceReport(params: {
  user: UserSession;
  timeframe: 'weekly' | 'monthly' | 'custom';
  startDate?: string;
  endDate?: string;
  teamId?: string;
  executiveId?: string;
}) {
  const now = new Date();
  let fromDate = new Date();

  if (params.timeframe === 'weekly') {
    fromDate.setDate(now.getDate() - 7);
  } else if (params.timeframe === 'monthly') {
    fromDate.setDate(now.getDate() - 30);
  } else if (params.startDate) {
    fromDate = new Date(params.startDate);
  } else {
    fromDate.setDate(now.getDate() - 30);
  }

  const toDate = params.endDate ? new Date(params.endDate) : now;

  // Build scoping where clauses
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leadWhere: any = {
    createdAt: { gte: fromDate, lte: toDate },
    NOT: { source: { startsWith: CALLING_SOURCE_PREFIX } },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meetingWhere: any = {
    scheduledAt: { gte: fromDate, lte: toDate },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const followupWhere: any = {
    completedAt: { gte: fromDate, lte: toDate },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assignmentWhere: any = {
    timestamp: { gte: fromDate, lte: toDate },
    type: 'REASSIGNMENT',
  };

  if (params.user.role === 'EXECUTIVE') {
    leadWhere.currentOwnerId = params.user.id;
    meetingWhere.createdById = params.user.id;
    followupWhere.userId = params.user.id;
    assignmentWhere.OR = [
      { previousOwnerId: params.user.id },
      { newOwnerId: params.user.id },
    ];
  } else if (params.user.role === 'TEAM_LEAD' && params.user.teamId) {
    leadWhere.currentOwner = { teamId: params.user.teamId };
    meetingWhere.createdBy = { teamId: params.user.teamId };
    followupWhere.user = { teamId: params.user.teamId };
    assignmentWhere.OR = [
      { previousOwner: { teamId: params.user.teamId } },
      { newOwner: { teamId: params.user.teamId } },
    ];
  } else if (params.user.role === 'ADMIN') {
    if (params.executiveId) {
      leadWhere.currentOwnerId = params.executiveId;
      meetingWhere.createdById = params.executiveId;
      followupWhere.userId = params.executiveId;
      assignmentWhere.OR = [
        { previousOwnerId: params.executiveId },
        { newOwnerId: params.executiveId },
      ];
    } else if (params.teamId) {
      leadWhere.currentOwner = { teamId: params.teamId };
      meetingWhere.createdBy = { teamId: params.teamId };
      followupWhere.user = { teamId: params.teamId };
      assignmentWhere.OR = [
        { previousOwner: { teamId: params.teamId } },
        { newOwner: { teamId: params.teamId } },
      ];
    }
  }

  const [
    totalLeadsReceived,
    closedWon,
    closedLost,
    interested,
    notAnswering,
    notInterested,
    meetingsScheduled,
    meetingsCompleted,
    followupsCompleted,
    reassignedCount,
  ] = await Promise.all([
    prisma.lead.count({ where: leadWhere }),
    prisma.lead.count({ where: { ...leadWhere, currentStatus: 'CLOSED_WON' } }),
    prisma.lead.count({ where: { ...leadWhere, currentStatus: 'CLOSED_LOST' } }),
    prisma.lead.count({ where: { ...leadWhere, currentStatus: 'INTERESTED' } }),
    prisma.lead.count({ where: { ...leadWhere, currentStatus: 'NOT_ANSWERING' } }),
    prisma.lead.count({ where: { ...leadWhere, currentStatus: 'NOT_INTERESTED' } }),
    prisma.meeting.count({ where: meetingWhere }),
    prisma.meeting.count({
      where: { ...meetingWhere, status: 'COMPLETED' },
    }),
    prisma.leadFollowup.count({
      where: followupWhere,
    }),
    prisma.leadAssignment.count({
      where: assignmentWhere,
    }),
  ]);

  // Executive performance breakdown (if Admin or Team Lead)
  let executiveBreakdown: Array<{
    id: string;
    name: string;
    teamName: string;
    activeLeads: number;
    closedWon: number;
    meetings: number;
  }> = [];

  if (params.user.role === 'ADMIN' || params.user.role === 'TEAM_LEAD') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userWhere: any = { role: 'EXECUTIVE', active: true };
    if (params.user.role === 'TEAM_LEAD' && params.user.teamId) {
      userWhere.teamId = params.user.teamId;
    } else if (params.teamId) {
      userWhere.teamId = params.teamId;
    }

    const executives = await prisma.user.findMany({
      where: userWhere,
      include: {
        team: { select: { name: true } },
        ownedLeads: {
          where: { source: { not: { startsWith: CALLING_SOURCE_PREFIX } } },
          select: { id: true, currentStatus: true, currentCategory: true },
        },
        createdMeetings: {
          where: { scheduledAt: { gte: fromDate, lte: toDate } },
          select: { id: true },
        },
      },
    });

    executiveBreakdown = executives.map((exec) => {
      const active = exec.ownedLeads.filter((l) => l.currentCategory === 'ACTIVE').length;
      const won = exec.ownedLeads.filter((l) => l.currentStatus === 'CLOSED_WON').length;
      return {
        id: exec.id,
        name: exec.name,
        teamName: exec.team?.name || 'Unassigned',
        activeLeads: active,
        closedWon: won,
        meetings: exec.createdMeetings.length,
      };
    });
  }

  return {
    timeframe: params.timeframe,
    fromDate,
    toDate,
    metrics: {
      totalLeadsReceived,
      closedWon,
      closedLost,
      interested,
      notAnswering,
      notInterested,
      meetingsScheduled,
      meetingsCompleted,
      followupsCompleted,
      reassignedCount,
      conversionRate:
        totalLeadsReceived > 0 ? ((closedWon / totalLeadsReceived) * 100).toFixed(1) : '0',
    },
    executiveBreakdown,
  };
}
