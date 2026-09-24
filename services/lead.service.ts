import { prisma } from '@/lib/db';
import { generateNextLeadNumber } from '@/lib/lead-number';
import { logAudit } from './audit.service';
import { createNotification } from './notification.service';
import { UserSession } from '@/types';
import { CALLING_SOURCE_PREFIX } from '@/lib/lead-pipeline';
import { canAccessLead } from '@/lib/permissions';

export interface CreateLeadInput {
  clientName: string;
  phone: string;
  alternatePhone?: string;
  email?: string;
  company?: string;
  location?: string;
  source?: string;
  notes?: string;
  assignToId?: string;
  currentOwnerId?: string;
  ownerId?: string;
  status?: string;
  currentStatus?: string;
  nextAction?: string;
  nextActionAt?: Date | string;
}

export async function createLead(input: CreateLeadInput, creator: UserSession) {
  // Check for duplicate phone number
  const existing = await prisma.lead.findFirst({
    where: { phone: input.phone },
  });

  if (existing) {
    throw new Error(`Lead with phone ${input.phone} already exists (${existing.leadNumber}: ${existing.clientName})`);
  }

  const leadNumber = await generateNextLeadNumber();
  const ownerId = input.assignToId || input.currentOwnerId || input.ownerId || (creator.role === 'EXECUTIVE' ? creator.id : null);

  const nextActionDate = input.nextActionAt ? new Date(input.nextActionAt) : (ownerId ? new Date() : null);
  const nextAction = input.nextAction || (ownerId ? 'Initial Contact' : null);

  const lead = await prisma.$transaction(async (tx) => {
    const created = await tx.lead.create({
      data: {
        leadNumber,
        clientName: input.clientName,
        phone: input.phone,
        alternatePhone: input.alternatePhone || null,
        email: input.email || null,
        company: input.company || null,
        location: input.location || null,
        source: input.source || 'Direct',
        notes: input.notes || null,
        currentOwnerId: ownerId,
        currentStatus: input.status || input.currentStatus || 'NEW',
        currentCategory: 'ACTIVE',
        nextAction,
        nextActionAt: nextActionDate,
        isNewToMe: Boolean(ownerId),
        lastUpdatedAt: new Date(),
      },
    });

    if (ownerId) {
      await tx.leadAssignment.create({
        data: {
          leadId: created.id,
          previousOwnerId: null,
          newOwnerId: ownerId,
          performedById: creator.id,
          reason: 'Initial assignment upon lead creation',
          type: 'INITIAL',
        },
      });
    }

    if (input.notes) {
      await tx.leadUpdate.create({
        data: {
          leadId: created.id,
          userId: creator.id,
          remark: `Lead created. Notes: ${input.notes}`,
          nextAction,
          nextActionAt: nextActionDate,
        },
      });
    } else {
      await tx.leadUpdate.create({
        data: {
          leadId: created.id,
          userId: creator.id,
          remark: 'Lead created in system',
          nextAction,
          nextActionAt: nextActionDate,
        },
      });
    }

    if (nextActionDate) {
      await tx.leadFollowup.create({
        data: {
          leadId: created.id,
          userId: ownerId || creator.id,
          dueAt: nextActionDate,
          nextAction: nextAction || 'Initial Follow-up',
        },
      });
    }

    return created;
  });

  await logAudit({
    actorId: creator.id,
    action: 'CREATE_LEAD',
    entity: 'LEAD',
    entityId: lead.id,
    metadata: { leadNumber: lead.leadNumber, clientName: lead.clientName, assignedTo: ownerId },
  });

  if (ownerId && ownerId !== creator.id) {
    await createNotification({
      userId: ownerId,
      type: 'LEAD_ASSIGNED',
      title: 'New Lead Assigned',
      message: `Lead ${lead.leadNumber} (${lead.clientName}) has been assigned to you.`,
      link: `/dashboard/leads/${lead.id}`,
    });
  }

  return lead;
}

export interface GetLeadsParams {
  session: UserSession;
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  category?: string;
  ownerId?: string | null;
  teamId?: string;
  source?: string;
  isNewToMe?: boolean;
  overdueOnly?: boolean;
  dueTodayOnly?: boolean;
  todayLeads?: boolean;
  withoutNextAction?: boolean;
  workspace?: boolean;
  excludeCallingData?: boolean;
}

export async function getLeads(params: GetLeadsParams) {
  const {
    session,
    page = 1,
    pageSize = 25,
    search,
    status,
    category,
    ownerId,
    teamId,
    source,
    isNewToMe,
    overdueOnly,
    dueTodayOnly,
    todayLeads,
    withoutNextAction,
    workspace,
    excludeCallingData,
  } = params;

  // Lead Management queries are isolated from Calling Data by default.
  // Calling operations use getCallingData instead of this service.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    NOT: { source: { startsWith: CALLING_SOURCE_PREFIX } },
  };

  let effectiveTeamId = session.teamId;
  if (session.role === 'TEAM_LEAD' && !effectiveTeamId) {
    const currentUser = await prisma.user.findUnique({ where: { id: session.id }, select: { teamId: true } });
    effectiveTeamId = currentUser?.teamId || null;
  }

  if (session.role === 'EXECUTIVE') {
    // Executive sees ONLY their own leads
    where.currentOwnerId = session.id;
  } else if (session.role === 'TEAM_LEAD') {
    // Team Lead sees their team's leads
    if (effectiveTeamId && ownerId !== session.id) {
      where.AND = [
        {
          OR: [
            { currentOwner: { teamId: effectiveTeamId } },
            { currentOwnerId: session.id },
          ],
        },
      ];
    } else if (ownerId !== session.id) {
      where.currentOwnerId = session.id;
    }
  }

  // Explicit filters
  if (category) {
    where.currentCategory = category;
  }

  if (status) {
    where.currentStatus = status;
  }

  if (
    ownerId !== undefined &&
    (session.role === 'ADMIN' || session.role === 'TEAM_LEAD' || session.role === 'EXECUTIVE')
  ) {
    where.currentOwnerId = ownerId;
  }

  if (teamId && session.role === 'ADMIN') {
    where.currentOwner = { teamId };
  }

  if (source) {
    where.source = source;
  }

  if (isNewToMe !== undefined) {
    where.isNewToMe = isNewToMe;
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (todayLeads) {
    // Today's Leads is the master-intake feed; telecalling batches belong only in Calling Data.
    where.NOT = { source: { startsWith: CALLING_SOURCE_PREFIX } };
    // Use direct ownership as the source of truth for both Executives and
    // Team Leads so admin uploads appear immediately even if timestamps cross
    // a timezone boundary.
    where.currentOwnerId = session.id;
    where.currentCategory = 'ACTIVE';
    where.AND = [
      ...(where.AND || []),
      {
        OR: [
          { isNewToMe: true },
          { createdAt: { gte: startOfToday } },
          { lastUpdatedAt: { gte: startOfToday } },
          { nextActionAt: { gte: startOfToday, lte: endOfToday } },
          { nextActionAt: null },
          {
            assignments: {
              some: {
                timestamp: { gte: startOfToday, lte: endOfToday },
              },
            },
          },
        ],
      },
      {
        OR: [
          { lastRemarkedAt: null },
          { isNewToMe: true },
        ],
      },
    ];
  }

  if (overdueOnly) {
    where.nextActionAt = { lt: startOfToday };
    where.isNewToMe = false;
    where.currentCategory = 'ACTIVE';
  }

  if (dueTodayOnly) {
    where.AND = [
      ...(where.AND || []),
      {
        OR: [
          { nextActionAt: { gte: startOfToday, lte: endOfToday } },
          { nextActionAt: null },
          { isNewToMe: true },
        ],
      },
      {
        OR: [
          { lastRemarkedAt: null },
          { isNewToMe: true },
        ],
      },
    ];
    where.currentCategory = 'ACTIVE';
  }

  if (withoutNextAction) {
    where.nextActionAt = null;
    where.currentCategory = 'ACTIVE';
  }

  if (workspace) {
    // Workspace is the Lead Upload destination only. Calling Data has its own
    // operational history and must never appear in the Lead workspace.
    where.currentCategory = { not: 'CLOSED' };
    where.AND = [
      ...(where.AND || []),
      { NOT: { source: { startsWith: CALLING_SOURCE_PREFIX } } },
    ];
  }

  if (excludeCallingData) {
    where.NOT = {
      ...(where.NOT || {}),
      source: { startsWith: CALLING_SOURCE_PREFIX },
    };
  }

  if (search && search.trim()) {
    const q = search.trim();
    where.OR = [
      { leadNumber: { contains: q } },
      { clientName: { contains: q } },
      { phone: { contains: q } },
      { company: { contains: q } },
    ];
  }

  const skip = (page - 1) * pageSize;

  const [total, leads] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: [{ lastUpdatedAt: 'desc' }, { leadNumber: 'asc' }],
      include: {
        currentOwner: {
          select: {
            id: true,
            name: true,
            email: true,
            teamId: true,
            team: { select: { id: true, name: true } },
          },
        },
        updates: {
          where: { disposition: 'LEAD' },
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            remark: true,
            createdAt: true,
            user: { select: { id: true, name: true, role: true } },
          },
        },
      },
    }),
  ]);

  return {
    leads,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getLeadById(leadId: string) {
  return prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      currentOwner: {
        select: {
          id: true,
          name: true,
          email: true,
          teamId: true,
          team: { select: { id: true, name: true } },
        },
      },
      assignments: {
        include: {
          previousOwner: { select: { id: true, name: true } },
          newOwner: { select: { id: true, name: true } },
          performedBy: { select: { id: true, name: true, role: true } },
        },
        orderBy: { timestamp: 'desc' },
      },
      updates: {
        include: {
          user: { select: { id: true, name: true, role: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
      statusHistory: {
        include: {
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
      followups: {
        include: {
          user: { select: { id: true, name: true } },
        },
        orderBy: { dueAt: 'desc' },
      },
      meetings: {
        include: {
          createdBy: { select: { id: true, name: true } },
        },
        orderBy: { scheduledAt: 'desc' },
      },
    },
  });
}

export interface AddUpdateInput {
  leadId: string;
  remark: string;
  status?: string;
  nextAction?: string;
  nextActionAt?: Date | string | null;
  clientName?: string;
  discardOnNegativeStatus?: boolean;
  user: UserSession;
}

export async function addLeadUpdate(input: AddUpdateInput) {
  const currentLead = await prisma.lead.findUnique({
    where: { id: input.leadId },
  });

  if (!currentLead) {
    throw new Error('Lead not found');
  }

  const rawClientName = input.clientName?.trim();
  const nameChanged = Boolean(rawClientName && rawClientName !== currentLead.clientName);
  if (
    nameChanged &&
    !['ADMIN', 'TEAM_LEAD', 'EXECUTIVE'].includes(input.user.role)
  ) {
    throw new Error('Only authorized lead users can edit the client name');
  }
  const effectiveClientName = rawClientName || currentLead.clientName;

  const newStatus = input.status || currentLead.currentStatus;
  const statusChanged = newStatus !== currentLead.currentStatus;
  const nextDate = input.nextActionAt ? new Date(input.nextActionAt) : null;
  const isCallingData = currentLead.source.startsWith(CALLING_SOURCE_PREFIX);
  const isCallingNonActionable =
    isCallingData &&
    ['NOT_INTERESTED', 'NOT_ANSWERING', 'SWITCH_OFF', 'OTHER'].includes(newStatus);
  // Determine category based on status
  let category = currentLead.currentCategory;
  if (newStatus === 'NOT_ANSWERING') category = 'NOT_ANSWERING';
  else if (newStatus === 'NOT_INTERESTED') category = 'NOT_INTERESTED';
  else if (newStatus === 'CHANNEL_PARTNER') category = 'CHANNEL_PARTNER';
  else if (newStatus === 'OTHER') category = 'OTHER';
  else if (newStatus === 'CLOSED_WON' || newStatus === 'CLOSED_LOST') category = 'CLOSED';
  else category = 'ACTIVE';

  const updatedLead = await prisma.$transaction(async (tx) => {
    // Calling Data keeps only actionable outcomes as calling remarks.
    if (!isCallingNonActionable) {
      await tx.leadUpdate.create({
        data: {
          leadId: input.leadId,
          userId: input.user.id,
          remark: nameChanged
            ? `[Name Updated to: ${effectiveClientName}] ${input.remark}`
            : input.remark,
          nextAction: input.nextAction || null,
          nextActionAt: nextDate,
          disposition: isCallingData ? 'CALLING_DATA' : 'LEAD',
        },
      });
    }

    // 2. Status history if changed
    if (statusChanged) {
      await tx.leadStatusHistory.create({
        data: {
          leadId: input.leadId,
          userId: input.user.id,
          fromStatus: currentLead.currentStatus,
          toStatus: newStatus,
          reason: isCallingNonActionable
            ? `Calling Data outcome: ${newStatus}`
            : input.remark,
        },
      });
    }

    // 3. Followup record if scheduled
    if (nextDate) {
      await tx.leadFollowup.create({
        data: {
          leadId: input.leadId,
          userId: input.user.id,
          dueAt: nextDate,
          nextAction: input.nextAction || 'Follow-up',
        },
      });
    }

    // 4. Update Current State on Lead (including clientName if updated)
    return await tx.lead.update({
      where: { id: input.leadId },
      data: {
          ...(nameChanged ? { clientName: effectiveClientName } : {}),
        currentStatus: newStatus,
        currentCategory: category,
        nextAction: input.nextAction || null,
        nextActionAt: nextDate,
        isNewToMe: false, // Clear 'New To Me' status once executive adds an update
        lastRemarkedAt: new Date(),
        lastUpdatedAt: new Date(),
      },
    });
  });

  await logAudit({
    actorId: input.user.id,
    action: nameChanged ? 'EDIT_LEAD_INFO' : 'UPDATE_LEAD',
    entity: 'LEAD',
    entityId: input.leadId,
    metadata: {
      leadNumber: currentLead.leadNumber,
      clientName: effectiveClientName,
      ...(nameChanged ? { previousName: currentLead.clientName } : {}),
      status: newStatus,
      remark: input.remark,
      nextAction: input.nextAction,
    },
  });

  try {
    const { recalculateLeadScore } = await import('./scoring.service');
    await recalculateLeadScore(input.leadId);
  } catch (err) {
    console.error('Failed to recalculate lead score:', err);
  }

  return updatedLead;
}

export async function getAdminAttentionMetrics() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const leadOnly = { NOT: { source: { startsWith: CALLING_SOURCE_PREFIX } } };

  const [
    unassigned,
    overdueFollowups,
    withoutNextAction,
    notAnswering,
    notInterested,
    interested,
    totalActive,
    newToday,
    totalAll,
    channelPartners,
    otherCategory,
  ] = await Promise.all([
    prisma.lead.count({ where: { ...leadOnly, currentOwnerId: null } }),
    prisma.lead.count({
      where: {
        ...leadOnly,
        currentCategory: 'ACTIVE',
        nextActionAt: { lt: startOfToday },
      },
    }),
    prisma.lead.count({
      where: {
        ...leadOnly,
        currentCategory: 'ACTIVE',
        nextActionAt: null,
      },
    }),
    prisma.lead.count({ where: { ...leadOnly, currentCategory: 'NOT_ANSWERING' } }),
    prisma.lead.count({ where: { ...leadOnly, currentCategory: 'NOT_INTERESTED' } }),
    prisma.lead.count({ where: { ...leadOnly, currentStatus: 'INTERESTED' } }),
    prisma.lead.count({ where: { ...leadOnly, currentCategory: 'ACTIVE' } }),
    prisma.lead.count({ where: { ...leadOnly, createdAt: { gte: startOfToday, lte: endOfToday } } }),
    prisma.lead.count({ where: leadOnly }),
    prisma.lead.count({ where: { ...leadOnly, currentCategory: 'CHANNEL_PARTNER' } }),
    prisma.lead.count({ where: { ...leadOnly, currentCategory: 'OTHER' } }),
  ]);

  return {
    unassigned,
    overdueFollowups,
    withoutNextAction,
    notAnswering,
    notInterested,
    interested,
    totalActive,
    newToday,
    totalAll,
    channelPartners,
    otherCategory,
  };
}

export function getCategoryForStatus(status: string): string {
  if (status === 'NOT_ANSWERING') return 'NOT_ANSWERING';
  if (status === 'NOT_INTERESTED') return 'NOT_INTERESTED';
  if (status === 'CHANNEL_PARTNER') return 'CHANNEL_PARTNER';
  if (status === 'OTHER') return 'OTHER';
  if (status === 'CLOSED_WON' || status === 'CLOSED_LOST') return 'CLOSED';
  return 'ACTIVE';
}

export async function deleteLead(leadId: string, user: UserSession) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { currentOwner: { select: { teamId: true } } },
  });

  if (!lead) throw new Error('Lead not found');
  if (user.role !== 'ADMIN' && !canAccessLead(user, lead)) {
    throw new Error('Forbidden: you cannot delete this lead');
  }

  await prisma.$transaction(async (tx) => {
    // Delete all dependent child records
    await tx.leadAssignment.deleteMany({ where: { leadId } });
    await tx.leadUpdate.deleteMany({ where: { leadId } });
    await tx.leadFollowup.deleteMany({ where: { leadId } });
    await tx.leadStatusHistory.deleteMany({ where: { leadId } });
    await tx.meeting.deleteMany({ where: { leadId } });
    await tx.callLog.deleteMany({ where: { leadId } });
    // Delete lead
    await tx.lead.delete({ where: { id: leadId } });
  });

  await logAudit({
    actorId: user.id,
    action: 'DELETE_LEAD',
    entity: 'LEAD',
    entityId: leadId,
    metadata: { leadNumber: lead.leadNumber, clientName: lead.clientName },
  });

  return { success: true, id: leadId };
}

export async function bulkDeleteLeads(leadIds: string[], user: UserSession) {
  if (!leadIds || leadIds.length === 0) return { count: 0, ids: [] };

  const leads = await prisma.lead.findMany({
    where: { id: { in: leadIds } },
    include: { currentOwner: { select: { teamId: true } } },
  });

  const idsToDelete = leads.map((l) => l.id);
  if (idsToDelete.length === 0) return { count: 0, ids: [] };
  if (user.role !== 'ADMIN' && leads.some((lead) => !canAccessLead(user, lead))) {
    throw new Error('Forbidden: you can delete only leads in your authorized scope');
  }

  await prisma.$transaction(async (tx) => {
    await tx.leadAssignment.deleteMany({ where: { leadId: { in: idsToDelete } } });
    await tx.leadUpdate.deleteMany({ where: { leadId: { in: idsToDelete } } });
    await tx.leadFollowup.deleteMany({ where: { leadId: { in: idsToDelete } } });
    await tx.leadStatusHistory.deleteMany({ where: { leadId: { in: idsToDelete } } });
    await tx.meeting.deleteMany({ where: { leadId: { in: idsToDelete } } });
    await tx.callLog.deleteMany({ where: { leadId: { in: idsToDelete } } });
    await tx.lead.deleteMany({ where: { id: { in: idsToDelete } } });
  });

  await logAudit({
    actorId: user.id,
    action: 'BULK_DELETE_LEADS',
    entity: 'LEAD',
    entityId: idsToDelete.join(','),
    metadata: {
      count: idsToDelete.length,
      leadNumbers: leads.map((l) => l.leadNumber),
    },
  });

  return { count: idsToDelete.length, ids: idsToDelete };
}

export async function bulkReassignLeads(params: {
  leadIds: string[];
  newOwnerId: string | null;
  user: UserSession;
  reason?: string;
}) {
  const { leadIds, newOwnerId, user, reason = 'Bulk Reassignment' } = params;
  if (!leadIds || leadIds.length === 0) return { count: 0 };

  const leads = await prisma.lead.findMany({
    where: { id: { in: leadIds } },
    select: { id: true, leadNumber: true, currentOwnerId: true },
  });

  if (user.role === 'TEAM_LEAD') {
    const [performer, newOwner] = await Promise.all([
      prisma.user.findUnique({ where: { id: user.id }, select: { teamId: true } }),
      newOwnerId
        ? prisma.user.findUnique({
            where: { id: newOwnerId },
            select: { role: true, active: true, teamId: true },
          })
        : null,
    ]);

    if (
      !performer?.teamId ||
      !newOwner ||
      !newOwner.active ||
      newOwner.role !== 'EXECUTIVE' ||
      newOwner.teamId !== performer.teamId
    ) {
      throw new Error('Team leads can assign leads only to active executives in their own team');
    }

    const ownedLeadIds = await prisma.lead.findMany({
      where: {
        id: { in: leadIds },
        currentOwner: { teamId: performer.teamId },
      },
      select: { id: true },
    });
    if (ownedLeadIds.length !== leads.length) {
      throw new Error('Team leads can manage only leads already in their own team');
    }
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    for (const lead of leads) {
      await tx.leadAssignment.create({
        data: {
          leadId: lead.id,
          previousOwnerId: lead.currentOwnerId,
          newOwnerId,
          performedById: user.id,
          reason,
          type: newOwnerId ? 'REASSIGNMENT' : 'UNASSIGNED',
        },
      });

      await tx.leadUpdate.create({
        data: {
          leadId: lead.id,
          userId: user.id,
          remark: `Bulk Reassigned${newOwnerId ? ` to user ID ${newOwnerId}` : ' (Unassigned)'}. Reason: ${reason}`,
        },
      });

      await tx.lead.update({
        where: { id: lead.id },
        data: {
          currentOwnerId: newOwnerId,
          isNewToMe: Boolean(newOwnerId),
          currentCategory: 'ACTIVE',
          nextAction: newOwnerId ? 'Initial Contact' : null,
          nextActionAt: newOwnerId ? now : null,
          lastUpdatedAt: now,
        },
      });
    }
  });

  if (newOwnerId) {
    await createNotification({
      userId: newOwnerId,
      type: 'LEAD_ASSIGNED',
      title: `${leads.length} Leads Assigned`,
      message: `You were bulk assigned ${leads.length} leads by ${user.name}.`,
      link: '/dashboard/executive/workspace',
    });
  }

  await logAudit({
    actorId: user.id,
    action: 'BULK_REASSIGN_LEADS',
    entity: 'LEAD',
    entityId: leadIds.join(','),
    metadata: { count: leads.length, newOwnerId, reason },
  });

  return { count: leads.length };
}

export async function bulkUpdateStatusLeads(params: {
  leadIds: string[];
  status: string;
  category?: string;
  remark?: string;
  user: UserSession;
}) {
  const { leadIds, status, category, remark = 'Bulk status updated', user } = params;
  if (!leadIds || leadIds.length === 0) return { count: 0 };

  const finalCategory = category || getCategoryForStatus(status);
  const now = new Date();
  // Fetch current status of leads to record history
  const currentLeads = await prisma.lead.findMany({
    where: { id: { in: leadIds } },
    include: { currentOwner: { select: { teamId: true } } },
  });
  if (user.role !== 'ADMIN' && currentLeads.some((lead) => !canAccessLead(user, lead))) {
    throw new Error('Forbidden: you can update only leads in your authorized scope');
  }

  await prisma.$transaction(async (tx) => {
    for (const l of currentLeads) {
      if (l.currentStatus !== status) {
        await tx.leadStatusHistory.create({
          data: {
            leadId: l.id,
            fromStatus: l.currentStatus,
            toStatus: status,
            userId: user.id,
            reason: remark,
          },
        });
      }

      await tx.leadUpdate.create({
        data: {
          leadId: l.id,
          userId: user.id,
          remark: `[Bulk Status Update] ${remark}`,
        },
      });

      await tx.lead.update({
        where: { id: l.id },
        data: {
          currentStatus: status,
          currentCategory: finalCategory,
          lastRemarkedAt: now,
          lastUpdatedAt: now,
        },
      });
    }
  });

  // Recalculate lead scores
  try {
    const { recalculateLeadScore } = await import('./scoring.service');
    await Promise.all(leadIds.map((id) => recalculateLeadScore(id)));
  } catch (err) {
    console.error('Failed to recalculate lead scores after bulk status update:', err);
  }

  await logAudit({
    actorId: user.id,
    action: 'BULK_UPDATE_LEAD_STATUS',
    entity: 'LEAD',
    entityId: leadIds.join(','),
    metadata: { count: leadIds.length, status, category: finalCategory, remark },
  });

  return { count: leadIds.length };
}
