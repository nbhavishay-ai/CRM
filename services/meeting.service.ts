import { prisma } from '@/lib/db';
import { UserSession } from '@/types';
import { logAudit } from './audit.service';
import { createNotification } from './notification.service';
import { canAccessLead } from '@/lib/permissions';

export interface CreateMeetingInput {
  leadId: string;
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:MM"
  meetingType: string;
  location?: string;
  notes?: string;
  reminder?: string;
  user: UserSession;
}

export async function createMeeting(input: CreateMeetingInput) {
  const lead = await prisma.lead.findUnique({
    where: { id: input.leadId },
    include: { currentOwner: { select: { teamId: true } } },
  });
  if (!lead) throw new Error('Lead not found');
  if (!canAccessLead(input.user, lead)) throw new Error('Forbidden: you cannot manage this lead');

  const scheduledAt = new Date(`${input.date}T${input.time}:00`);

  const meeting = await prisma.$transaction(async (tx) => {
    const created = await tx.meeting.create({
      data: {
        leadId: input.leadId,
        createdById: input.user.id,
        scheduledAt,
        date: input.date,
        time: input.time,
        meetingType: input.meetingType,
        location: input.location || null,
        notes: input.notes || null,
        reminder: input.reminder || null,
        status: 'UPCOMING',
      },
      include: {
        lead: { select: { id: true, leadNumber: true, clientName: true, currentOwnerId: true } },
      },
    });

    // Add remark in lead timeline
    await tx.leadUpdate.create({
      data: {
        leadId: input.leadId,
        userId: input.user.id,
        remark: `Meeting scheduled: ${input.meetingType} on ${input.date} at ${input.time}. Location: ${input.location || 'N/A'}`,
        nextAction: `Meeting: ${input.meetingType}`,
        nextActionAt: scheduledAt,
      },
    });

    // Update lead current status to MEETING if in early stages
    await tx.lead.update({
      where: { id: input.leadId },
      data: {
        currentStatus: ['NEW', 'INTERESTED', 'FOLLOW_UP', 'CALL_BACK', 'SITE_VISIT', 'QUOTATION', 'NEGOTIATION'].includes(lead.currentStatus)
          ? 'MEETING'
          : lead.currentStatus,
        nextAction: `Meeting: ${input.meetingType}`,
        nextActionAt: scheduledAt,
        lastUpdatedAt: new Date(),
      },
    });

    return created;
  });

  await logAudit({
    actorId: input.user.id,
    action: 'CREATE_MEETING',
    entity: 'MEETING',
    entityId: meeting.id,
    metadata: {
      leadNumber: meeting.lead.leadNumber,
      date: input.date,
      time: input.time,
      type: input.meetingType,
    },
  });

  if (meeting.lead.currentOwnerId && meeting.lead.currentOwnerId !== input.user.id) {
    await createNotification({
      userId: meeting.lead.currentOwnerId,
      type: 'MEETING_REMINDER',
      title: 'Meeting Scheduled',
      message: `Meeting scheduled with ${meeting.lead.clientName} on ${input.date} at ${input.time}`,
      link: `/dashboard/leads/${meeting.lead.id}`,
    });
  }

  return meeting;
}

export async function completeMeeting(params: {
  meetingId: string;
  outcome: string;
  user: UserSession;
  nextAction?: string;
  nextActionAt?: Date | string | null;
}) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: params.meetingId },
    include: { lead: true },
  });

  if (!meeting) throw new Error('Meeting not found');
  if (!canAccessLead(params.user, meeting.lead)) {
    throw new Error('Forbidden: you cannot manage this lead');
  }

  const nextDate = params.nextActionAt ? new Date(params.nextActionAt) : null;

  const result = await prisma.$transaction(async (tx) => {
    const updatedMeeting = await tx.meeting.update({
      where: { id: params.meetingId },
      data: {
        status: 'COMPLETED',
        outcome: params.outcome,
      },
    });

    await tx.leadUpdate.create({
      data: {
        leadId: meeting.leadId,
        userId: params.user.id,
        remark: `Meeting Completed (${meeting.meetingType}). Outcome: ${params.outcome}`,
        nextAction: params.nextAction || null,
        nextActionAt: nextDate,
      },
    });

    if (nextDate) {
      await tx.leadFollowup.create({
        data: {
          leadId: meeting.leadId,
          userId: params.user.id,
          dueAt: nextDate,
          nextAction: params.nextAction || 'Post-Meeting Followup',
        },
      });
    }

    await tx.lead.update({
      where: { id: meeting.leadId },
      data: {
        nextAction: params.nextAction || null,
        nextActionAt: nextDate,
        lastUpdatedAt: new Date(),
      },
    });

    return updatedMeeting;
  });

  await logAudit({
    actorId: params.user.id,
    action: 'COMPLETE_MEETING',
    entity: 'MEETING',
    entityId: params.meetingId,
    metadata: {
      leadNumber: meeting.lead.leadNumber,
      outcome: params.outcome,
    },
  });

  return result;
}

export async function getMeetings(params: {
  user: UserSession;
  timeframe?: 'today' | 'week' | 'upcoming' | 'completed';
  executiveId?: string;
  teamId?: string;
}) {
  const { user, timeframe = 'week', executiveId, teamId } = params;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};

  if (user.role === 'EXECUTIVE') {
    where.createdById = user.id;
  } else if (user.role === 'TEAM_LEAD') {
    where.createdBy = user.teamId ? { teamId: user.teamId } : { id: '__no_team__' };
  }

  if (executiveId && (user.role === 'ADMIN' || user.role === 'TEAM_LEAD')) {
    where.createdById = executiveId;
  }

  if (teamId && user.role === 'ADMIN') {
    where.createdBy = { teamId };
  }

  if (timeframe === 'today') {
    where.scheduledAt = { gte: startOfToday, lte: endOfToday };
  } else if (timeframe === 'week') {
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 8);
    endOfWeek.setMilliseconds(-1);
    where.scheduledAt = { gte: startOfWeek, lte: endOfWeek };
  } else if (timeframe === 'upcoming') {
    where.scheduledAt = { gte: now };
    where.status = 'UPCOMING';
  } else if (timeframe === 'completed') {
    where.status = 'COMPLETED';
  }

  return prisma.meeting.findMany({
    where,
    include: {
      lead: {
        select: {
          id: true,
          leadNumber: true,
          clientName: true,
          phone: true,
          currentStatus: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
          team: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { scheduledAt: 'asc' },
  });
}
