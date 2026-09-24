import { prisma } from '@/lib/db';
import { logAudit } from './audit.service';
import { createNotification } from './notification.service';
import { UserSession } from '@/types';
import { CALLING_SOURCE_PREFIX } from '@/lib/lead-pipeline';

export interface ReassignParams {
  leadId: string;
  newOwnerId: string;
  performer: UserSession;
  reason?: string;
}

export async function reassignLead({
  leadId,
  newOwnerId,
  performer,
  reason,
}: ReassignParams) {
  // 1. Fetch current lead
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      currentOwner: { select: { id: true, name: true, teamId: true } },
    },
  });

  if (!lead) {
    throw new Error('Lead not found');
  }

  // 2. Fetch new owner
  const newOwner = await prisma.user.findUnique({
    where: { id: newOwnerId },
    select: { id: true, name: true, active: true, role: true, teamId: true },
  });

  if (!newOwner || !newOwner.active) {
    throw new Error('Target assignee is invalid or inactive');
  }

  if (performer.role === 'TEAM_LEAD') {
    const [performerRecord] = await Promise.all([
      prisma.user.findUnique({ where: { id: performer.id }, select: { teamId: true } }),
    ]);
    if (!performerRecord?.teamId || newOwner.role !== 'EXECUTIVE' || newOwner.teamId !== performerRecord.teamId) {
      throw new Error('Team leads can assign leads only to active executives in their own team');
    }
    if (lead.currentOwnerId && lead.currentOwner?.teamId !== performerRecord.teamId) {
      throw new Error('Team leads can manage only leads already in their own team');
    }
  }

  const previousOwnerId = lead.currentOwnerId;
  const previousOwnerName = lead.currentOwner?.name || 'Unassigned';

  // 3. Perform atomic transaction
  const result = await prisma.$transaction(async (tx) => {
    // A. Update the lead's current state
    const updatedLead = await tx.lead.update({
      where: { id: leadId },
      data: {
        currentOwnerId: newOwner.id,
        isNewToMe: true, // Appears as NEW TO ME for the new owner
        lastRemarkedAt: null,
        currentCategory: 'ACTIVE', // Restore to active workflow upon reassignment
        nextAction: lead.nextAction || 'Initial Contact',
        nextActionAt: lead.nextActionAt || new Date(),
        lastUpdatedAt: new Date(),
      },
    });

    // B. Create immutable assignment history
    const assignment = await tx.leadAssignment.create({
      data: {
        leadId,
        previousOwnerId: previousOwnerId || null,
        newOwnerId: newOwner.id,
        performedById: performer.id,
        reason: reason || 'Reassigned by management',
        type: previousOwnerId ? 'REASSIGNMENT' : 'INITIAL',
      },
    });

    // C. Add an update remark noting the reassignment in the timeline
    await tx.leadUpdate.create({
      data: {
        leadId,
        userId: performer.id,
        remark: `Lead reassigned from ${previousOwnerName} to ${newOwner.name}. Reason: ${reason || 'Operational reassignment'}`,
      },
    });

    return { updatedLead, assignment };
  });

  // 4. Create Audit Log
  await logAudit({
    actorId: performer.id,
    action: 'REASSIGN_LEAD',
    entity: 'LEAD',
    entityId: leadId,
    metadata: {
      leadNumber: lead.leadNumber,
      clientName: lead.clientName,
      from: previousOwnerName,
      to: newOwner.name,
      reason,
    },
  });

  // 5. Notify new owner
  await createNotification({
    userId: newOwner.id,
    type: 'LEAD_REASSIGNED',
    title: 'New Lead Reassigned to You',
    message: `Lead ${lead.leadNumber} (${lead.clientName}) has been reassigned to you.`,
    link: `/dashboard/leads/${lead.id}`,
  });

  // 6. Notify previous owner if applicable
  if (previousOwnerId && previousOwnerId !== newOwner.id) {
    await createNotification({
      userId: previousOwnerId,
      type: 'LEAD_REASSIGNED',
      title: 'Lead Handed Over',
      message: `Lead ${lead.leadNumber} (${lead.clientName}) was reassigned to ${newOwner.name}.`,
      link: `/dashboard/leads/${lead.id}`,
    });
  }

  return result.updatedLead;
}

export async function assignCallingPool({
  count,
  newOwnerId,
  performer,
}: {
  count: number;
  newOwnerId: string;
  performer: UserSession;
}) {
  if (!Number.isInteger(count) || count < 1 || count > 10000) {
    throw new Error('Calling assignment count must be between 1 and 10,000');
  }

  const owner = await prisma.user.findFirst({
    where: { id: newOwnerId, role: 'EXECUTIVE', active: true },
    select: { id: true, name: true },
  });
  if (!owner) throw new Error('Target executive is invalid or inactive');

  const result = await prisma.$transaction(async (tx) => {
    const availablePool = await tx.lead.findMany({
      where: {
        currentOwnerId: null,
        currentCategory: 'ACTIVE',
        source: { startsWith: CALLING_SOURCE_PREFIX },
      },
      select: { id: true, leadNumber: true, clientName: true, nextAction: true, nextActionAt: true },
      orderBy: [{ createdAt: 'asc' }, { leadNumber: 'asc' }],
      take: 10000,
    });

    const available = availablePool
      .sort(() => Math.random() - 0.5)
      .slice(0, count);

    if (available.length < count) {
      throw new Error(`Only ${available.length} unassigned calling records are available`);
    }

    const now = new Date();
    const leadIds = available.map((lead) => lead.id);
    await tx.lead.updateMany({
      where: { id: { in: leadIds }, currentOwnerId: null },
      data: {
        currentOwnerId: owner.id,
        isNewToMe: true,
        lastRemarkedAt: null,
        nextAction: 'Initial Contact',
        nextActionAt: now,
        lastUpdatedAt: now,
      },
    });
    await tx.leadAssignment.createMany({
      data: available.map((lead) => ({
        leadId: lead.id,
        previousOwnerId: null,
        newOwnerId: owner.id,
        performedById: performer.id,
        reason: 'Admin calling pool allocation',
        type: 'INITIAL',
      })),
    });
    await tx.leadUpdate.createMany({
      data: available.map((lead) => ({
        leadId: lead.id,
        userId: performer.id,
        remark: `Calling record assigned from admin pool to ${owner.name}`,
        nextAction: 'Initial Contact',
        nextActionAt: now,
      })),
    });
    await tx.leadFollowup.createMany({
      data: available.map((lead) => ({
        leadId: lead.id,
        userId: owner.id,
        dueAt: now,
        nextAction: 'Initial Contact',
      })),
    });

    return { assignedCount: available.length, leadNumbers: available.map((lead) => lead.leadNumber) };
  });

  await logAudit({
    actorId: performer.id,
    action: 'ASSIGN_CALLING_POOL',
    entity: 'LEAD',
    metadata: { assignedCount: result.assignedCount, newOwnerId: owner.id, newOwnerName: owner.name },
  });
  await createNotification({
    userId: owner.id,
    type: 'LEAD_REASSIGNED',
    title: 'Calling Records Assigned',
    message: `${result.assignedCount} calling records were assigned to you from the admin pool.`,
    link: '/dashboard/calling',
  });

  return { ...result, owner };
}

export async function getAssignmentHistory(leadId: string) {
  return prisma.leadAssignment.findMany({
    where: { leadId },
    include: {
      previousOwner: { select: { id: true, name: true } },
      newOwner: { select: { id: true, name: true } },
      performedBy: { select: { id: true, name: true, role: true } },
    },
    orderBy: { timestamp: 'desc' },
  });
}
