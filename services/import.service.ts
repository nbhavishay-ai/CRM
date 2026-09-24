import { prisma } from '@/lib/db';
import { getMaxLeadSequence } from '@/lib/lead-number';
import { logAudit } from '@/services/audit.service';
import { UserRole } from '@/types';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { CALLING_SOURCE_PREFIX } from '@/lib/lead-pipeline';
import { createNotification } from '@/services/notification.service';

export interface BulkLeadRow {
  clientName?: string;
  phone: string;
  alternatePhone?: string;
  email?: string;
  company?: string;
  location?: string;
  source?: string;
  notes?: string;
  status?: string;
  nextAction?: string;
  nextActionAt?: string;
}

const normalizePhone = (value: unknown) => {
  return value?.toString().trim().replace(/[\s()-]/g, '') || '';
};
const normalizeEmail = (value: unknown) => value?.toString().trim().toLowerCase() || '';

export interface BulkLeadsImportOptions {
  rows: BulkLeadRow[];
  assignmentMode: 'UNASSIGNED' | 'SPECIFIC_USER' | 'ROUND_ROBIN_TEAM';
  targetUserId?: string;
  targetTeamId?: string;
  duplicateStrategy: 'SKIP' | 'UPDATE';
  user: { id: string; name: string; role: UserRole };
}

export async function processBulkLeadsImport(options: BulkLeadsImportOptions) {
  const { rows, assignmentMode, targetUserId, targetTeamId, duplicateStrategy, user } = options;
  const assignedLeadCounts = new Map<string, number>();

  let teamExecutives: Array<{ id: string; name: string }> = [];
  if (assignmentMode === 'ROUND_ROBIN_TEAM') {
    teamExecutives = await prisma.user.findMany({
      where: {
        ...(targetTeamId ? { teamId: targetTeamId } : {}),
        role: 'EXECUTIVE',
        active: true,
        routingAvailable: true,
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    if (teamExecutives.length === 0) {
      teamExecutives = await prisma.user.findMany({
        where: { role: 'EXECUTIVE', active: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
    }
  }

  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let assignedCount = 0;
  const errors: Array<{ row: number; error: string; data?: Partial<BulkLeadRow> }> = [];

  let roundRobinIndex = 0;
  let currentSeq = await getMaxLeadSequence();

  // Prefetch both deduplication keys in one query.
  const phoneSet = new Set<string>();
  const emailSet = new Set<string>();
  for (const r of rows) {
    const rawP = normalizePhone(r.phone);
    if (rawP) {
      phoneSet.add(rawP);
    }
    const email = normalizeEmail(r.email);
    if (email) emailSet.add(email);
  }

  const existingLeads = await prisma.lead.findMany({
    where: {
      OR: [
        ...(phoneSet.size ? [{ phone: { in: Array.from(phoneSet) } }] : []),
        ...(emailSet.size ? [{ email: { in: Array.from(emailSet) } }] : []),
      ],
    },
    select: {
      id: true,
      phone: true,
      leadNumber: true,
      clientName: true,
      alternatePhone: true,
      email: true,
      company: true,
      location: true,
      currentOwnerId: true,
      nextAction: true,
      nextActionAt: true,
    },
  });

  const existingMap = new Map<string, typeof existingLeads[0]>();
  for (const l of existingLeads) {
    existingMap.set(normalizePhone(l.phone), l);
    const email = normalizeEmail(l.email);
    if (email) existingMap.set(`email:${email}`, l);
  }

  // Serialize bounded batches so duplicate rows in one upload cannot race,
  // while using set-based inserts for the high-volume create path.
  const CHUNK_SIZE = 500;
  for (let chunkStart = 0; chunkStart < rows.length; chunkStart += CHUNK_SIZE) {
    const chunk = rows.slice(chunkStart, chunkStart + CHUNK_SIZE);
    const pendingLeads: Prisma.LeadCreateManyInput[] = [];
    const pendingAssignments: Prisma.LeadAssignmentCreateManyInput[] = [];
    const pendingUpdates: Prisma.LeadUpdateCreateManyInput[] = [];
    const pendingMeta: Array<{ rowNum: number; raw: BulkLeadRow; assignedOwnerId: string | null }> = [];
    const pendingDuplicateUpdates: Array<{
      id: string;
      clientName: string;
      alternatePhone: string | null;
      email: string | null;
      company: string | null;
      location: string | null;
      remark: string;
      nextAction: string | null;
      nextActionAt: Date | null;
      assignedOwnerId: string | null;
      previousOwnerId: string | null;
    }> = [];
    const batchKeys = new Set<string>();

    for (let idxInChunk = 0; idxInChunk < chunk.length; idxInChunk++) {
      const raw = chunk[idxInChunk];
      const rowNum = chunkStart + idxInChunk + 1;

      const rawName = raw.clientName?.trim();
      const phone = raw.phone?.toString().trim();

      if (!phone) {
        errors.push({ row: rowNum, error: 'phone is required', data: raw });
        continue;
      }

      const clientName = rawName || 'Unnamed Lead';
      const cleanPhone = normalizePhone(phone);
      const normalizedEmail = normalizeEmail(raw.email);
      const phoneKey = `phone:${cleanPhone}`;
      const emailKey = normalizedEmail ? `email:${normalizedEmail}` : '';

      try {
        let assignedOwnerId: string | null = null;
        if (assignmentMode === 'SPECIFIC_USER' && targetUserId) {
          assignedOwnerId = targetUserId;
        } else if (assignmentMode === 'ROUND_ROBIN_TEAM' && teamExecutives.length > 0) {
          assignedOwnerId = teamExecutives[roundRobinIndex % teamExecutives.length].id;
          roundRobinIndex++;
        }

        const existing =
          existingMap.get(cleanPhone) ||
          (normalizedEmail ? existingMap.get(`email:${normalizedEmail}`) : undefined);

        if (existing || batchKeys.has(phoneKey) || (emailKey && batchKeys.has(emailKey))) {
          if (duplicateStrategy === 'SKIP') {
            skippedCount++;
            continue;
          }

          if (!existing) {
            skippedCount++;
            continue;
          }

          pendingDuplicateUpdates.push({
            id: existing.id,
            clientName,
            alternatePhone: raw.alternatePhone?.trim() || existing.alternatePhone,
            email: raw.email?.trim() || existing.email,
            company: raw.company?.trim() || existing.company,
            location: raw.location?.trim() || existing.location,
            remark: `Lead updated via bulk import (${raw.notes || 'Spreadsheet reconciled'})`,
            nextAction: raw.nextAction?.trim() || (assignedOwnerId ? 'Initial Contact' : existing.nextAction),
            nextActionAt: raw.nextActionAt
              ? new Date(raw.nextActionAt)
              : (assignedOwnerId ? new Date() : existing.nextActionAt),
            assignedOwnerId,
            previousOwnerId: existing.currentOwnerId,
          });
          if (assignedOwnerId) {
            assignedLeadCounts.set(assignedOwnerId, (assignedLeadCounts.get(assignedOwnerId) || 0) + 1);
          }

          continue;
        }

        if (assignedOwnerId) {
          assignedLeadCounts.set(assignedOwnerId, (assignedLeadCounts.get(assignedOwnerId) || 0) + 1);
        }

        currentSeq++;
        const leadNumber = `ORV-${currentSeq.toString().padStart(6, '0')}`;
        const leadId = randomUUID();
        const createdAt = new Date();

        let nextActionDate: Date | null = null;
        if (raw.nextActionAt) {
          const parsed = new Date(raw.nextActionAt);
          if (!isNaN(parsed.getTime())) nextActionDate = parsed;
        }

        const status = raw.status?.trim()?.toUpperCase() || 'NEW';
        const currentCategory =
          status === 'NOT_ANSWERING'
            ? 'NOT_ANSWERING'
            : status === 'NOT_INTERESTED'
            ? 'NOT_INTERESTED'
            : status === 'CHANNEL_PARTNER'
            ? 'CHANNEL_PARTNER'
            : status === 'OTHER'
            ? 'OTHER'
            : status === 'CLOSED_WON' || status === 'CLOSED_LOST'
            ? 'CLOSED'
            : 'ACTIVE';
        const nextAction = raw.nextAction?.trim() || (assignedOwnerId ? 'Initial Contact' : null);
        const effectiveNextActionAt =
          nextActionDate || (assignedOwnerId ? new Date() : null);

        pendingLeads.push({
          id: leadId,
          leadNumber,
          clientName,
          phone: cleanPhone,
          alternatePhone: raw.alternatePhone?.trim() || null,
          email: raw.email?.trim() || null,
          company: raw.company?.trim() || null,
          location: raw.location?.trim() || null,
          source: raw.source?.trim() || 'Bulk CSV Import',
          notes: raw.notes?.trim() || null,
          currentOwnerId: assignedOwnerId,
          currentStatus: status,
          currentCategory,
          nextAction,
          nextActionAt: effectiveNextActionAt,
          isNewToMe: Boolean(assignedOwnerId),
          lastUpdatedAt: createdAt,
          createdAt,
          updatedAt: createdAt,
        });
        if (assignedOwnerId) {
          pendingAssignments.push({
            leadId,
            previousOwnerId: null,
            newOwnerId: assignedOwnerId,
            performedById: user.id,
            reason: 'Bulk CSV lead onboarding assignment',
            type: 'INITIAL',
          });
        }
        pendingUpdates.push({
          leadId,
          userId: user.id,
          remark: raw.notes ? `Bulk imported. Notes: ${raw.notes}` : 'Bulk imported via spreadsheet',
          nextAction,
          nextActionAt: effectiveNextActionAt,
        });
        pendingMeta.push({ rowNum, raw, assignedOwnerId });
        batchKeys.add(phoneKey);
        if (emailKey) batchKeys.add(emailKey);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Row creation failed';
        errors.push({ row: rowNum, error: msg, data: raw });
      }
    }

    // Process duplicate updates in a single atomic batch transaction
    if (pendingDuplicateUpdates.length > 0) {
      try {
        await prisma.$transaction(async (tx) => {
          for (const item of pendingDuplicateUpdates) {
            await tx.lead.update({
              where: { id: item.id },
              data: {
                clientName: item.clientName,
                alternatePhone: item.alternatePhone,
                email: item.email,
                company: item.company,
                location: item.location,
                ...(item.assignedOwnerId
                  ? {
                      currentOwnerId: item.assignedOwnerId,
                      currentCategory: 'ACTIVE',
                      isNewToMe: true,
                      nextAction: item.nextAction,
                      nextActionAt: item.nextActionAt,
                    }
                  : {}),
                lastUpdatedAt: new Date(),
              },
            });
          }
          const assignments = pendingDuplicateUpdates
            .filter((item) => item.assignedOwnerId && item.assignedOwnerId !== item.previousOwnerId)
            .map((item) => ({
              leadId: item.id,
              previousOwnerId: item.previousOwnerId,
              newOwnerId: item.assignedOwnerId,
              performedById: user.id,
              reason: 'Bulk CSV lead onboarding assignment',
              type: 'REASSIGNMENT' as const,
            }));
          if (assignments.length > 0) {
            await tx.leadAssignment.createMany({ data: assignments });
          }
          await tx.leadUpdate.createMany({
            data: pendingDuplicateUpdates.map((item) => ({
              leadId: item.id,
              userId: user.id,
              remark: item.remark,
              nextAction: item.nextAction,
              nextActionAt: item.nextActionAt,
            })),
          });
        });
        updatedCount += pendingDuplicateUpdates.length;
        assignedCount += pendingDuplicateUpdates.filter((item) => item.assignedOwnerId).length;
      } catch (err) {
        console.error('Batch duplicate lead updates failed:', err);
        const msg = err instanceof Error ? err.message : 'Batch update failed';
        errors.push({ row: chunkStart + 1, error: msg });
      }
    }

    if (pendingLeads.length > 0) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.lead.createMany({ data: pendingLeads });
          await tx.leadAssignment.createMany({ data: pendingAssignments });
          if (pendingUpdates.length > 0) {
            await tx.leadUpdate.createMany({ data: pendingUpdates });
          }
        });

        createdCount += pendingLeads.length;
        assignedCount += pendingMeta.filter((item) => item.assignedOwnerId).length;
        for (const lead of pendingLeads) {
          existingMap.set(normalizePhone(lead.phone), {
            id: lead.id!,
            phone: lead.phone,
            leadNumber: lead.leadNumber,
            clientName: lead.clientName,
            alternatePhone: lead.alternatePhone ?? null,
            email: lead.email ?? null,
            company: lead.company ?? null,
            location: lead.location ?? null,
            currentOwnerId: lead.currentOwnerId ?? null,
            nextAction: lead.nextAction ?? null,
            nextActionAt:
              lead.nextActionAt instanceof Date
                ? lead.nextActionAt
                : lead.nextActionAt
                ? new Date(lead.nextActionAt)
                : null,
          });
          if (lead.email) existingMap.set(`email:${normalizeEmail(lead.email)}`, existingMap.get(normalizePhone(lead.phone))!);
        }
      } catch (err: unknown) {
        console.error('Batch creation failed:', err);
        const msg = err instanceof Error ? err.message : 'Batch creation failed';
        for (const item of pendingMeta) errors.push({ row: item.rowNum, error: msg, data: item.raw });
      }
    }
  }

  await logAudit({
    actorId: user.id,
    action: 'BULK_IMPORT_LEADS',
    entity: 'LEAD',
    metadata: {
      totalRows: rows.length,
      createdCount,
      updatedCount,
      skippedCount,
      errorsCount: errors.length,
      assignmentMode,
    },
  });

  if (assignedLeadCounts.size > 0) {
    const recipients = await prisma.user.findMany({
      where: { id: { in: Array.from(assignedLeadCounts.keys()) }, active: true },
      select: { id: true, role: true },
    });
    await Promise.all(
      recipients.map((recipient) => createNotification({
        userId: recipient.id,
        type: 'LEAD_ASSIGNED',
        title: 'New Leads Added',
        message: `${assignedLeadCounts.get(recipient.id)} new lead${assignedLeadCounts.get(recipient.id) === 1 ? '' : 's'} were added to your queue by ${user.name}.`,
        link: recipient.role === 'TEAM_LEAD'
          ? '/dashboard/team-lead/today'
          : '/dashboard/executive/today',
      }))
    );
  }

  return {
    totalRows: rows.length,
    createdCount,
    updatedCount,
    skippedCount,
    assignedCount,
    errors,
  };
}

export interface BulkCallingRow {
  clientName?: string;
  phone: string;
  email?: string;
  campaign?: string;
  callDate?: string;
  callTime?: string;
  priority?: string;
  scriptNotes?: string;
}

export interface BulkCallingImportOptions {
  rows: BulkCallingRow[];
  assignmentMode: 'UNASSIGNED' | 'SPECIFIC_USER' | 'ROUND_ROBIN_TEAM' | 'KEEP_OWNER';
  targetUserId?: string;
  targetTeamId?: string;
  defaultCallDate?: string;
  defaultCallTime?: string;
  campaignName?: string;
  user: { id: string; name: string; role: UserRole };
}

export async function processBulkCallingImport(options: BulkCallingImportOptions) {
  const {
    rows,
    assignmentMode,
    targetUserId,
    targetTeamId,
    defaultCallDate,
    defaultCallTime,
    campaignName,
    user,
  } = options;
  const assignedCallingCounts = new Map<string, number>();

  if (assignmentMode === 'UNASSIGNED') {
    const unassignedCount = await prisma.lead.count({
      where: {
        currentOwnerId: null,
        currentCategory: 'ACTIVE',
        source: { startsWith: CALLING_SOURCE_PREFIX },
      },
    });
    if (unassignedCount + rows.length > 10000) {
      throw new Error(`Calling pool capacity is 10,000 records. ${unassignedCount} are already waiting.`);
    }
  }

  let teamExecutives: Array<{ id: string; name: string }> = [];
  if (assignmentMode === 'ROUND_ROBIN_TEAM') {
    teamExecutives = await prisma.user.findMany({
      where: {
        ...(targetTeamId ? { teamId: targetTeamId } : {}),
        role: 'EXECUTIVE',
        active: true,
        routingAvailable: true,
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    if (teamExecutives.length === 0) {
      teamExecutives = await prisma.user.findMany({
        where: { role: 'EXECUTIVE', active: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
    }
  }

  let scheduledCount = 0;
  let createdCount = 0;
  let updatedCount = 0;
  let assignedCount = 0;
  const errors: Array<{ row: number; error: string; data?: Partial<BulkCallingRow> }> = [];

  let roundRobinIndex = 0;
  let currentSeq = await getMaxLeadSequence();

  // Prefetch phone and email keys together to avoid per-row duplicate queries.
  const phoneSet = new Set<string>();
  const emailSet = new Set<string>();
  for (const r of rows) {
    const rawP = normalizePhone(r.phone);
    if (rawP) phoneSet.add(rawP);
    const email = normalizeEmail(r.email);
    if (email) emailSet.add(email);
  }

  const existingLeads = await prisma.lead.findMany({
    where: {
      OR: [
        ...(phoneSet.size ? [{ phone: { in: Array.from(phoneSet) } }] : []),
        ...(emailSet.size ? [{ email: { in: Array.from(emailSet) } }] : []),
      ],
    },
    select: {
      id: true,
      phone: true,
      email: true,
      leadNumber: true,
      clientName: true,
      currentOwnerId: true,
    },
  });

  const existingMap = new Map<string, typeof existingLeads[0]>();
  for (const l of existingLeads) {
    existingMap.set(normalizePhone(l.phone), l);
    const email = normalizeEmail(l.email);
    if (email) existingMap.set(`email:${email}`, l);
  }

  // Vectorized high-speed batch processing
  const CHUNK_SIZE = 500;
  for (let chunkStart = 0; chunkStart < rows.length; chunkStart += CHUNK_SIZE) {
    const chunk = rows.slice(chunkStart, chunkStart + CHUNK_SIZE);
    const pendingNewLeads: Prisma.LeadCreateManyInput[] = [];
    const pendingAssignments: Prisma.LeadAssignmentCreateManyInput[] = [];
    const pendingUpdates: Prisma.LeadUpdateCreateManyInput[] = [];
    const pendingFollowups: Prisma.LeadFollowupCreateManyInput[] = [];
    const pendingExistingUpdates: Array<{
      id: string;
      ownerToSet: string | null;
      scheduledAt: Date;
      effectiveCampaign: string;
      notes: string;
      source: string;
      targetOwnerId: string | null;
      previousOwnerId: string | null;
    }> = [];
    const batchKeys = new Set<string>();

    for (let idxInChunk = 0; idxInChunk < chunk.length; idxInChunk++) {
      const raw = chunk[idxInChunk];
      const rowNum = chunkStart + idxInChunk + 1;

      const rawName = raw.clientName?.trim();
      const phone = raw.phone?.toString().trim();

      if (!phone) {
        errors.push({ row: rowNum, error: 'phone is required', data: raw });
        continue;
      }

      const clientName = rawName || 'Unnamed Lead';
      const cleanPhone = normalizePhone(phone);
      const normalizedEmail = normalizeEmail(raw.email);
      const phoneKey = `phone:${cleanPhone}`;
      const emailKey = normalizedEmail ? `email:${normalizedEmail}` : '';

      // Parse call date & time
      const dateStr = raw.callDate?.trim() || defaultCallDate || new Date().toISOString().split('T')[0];
      const timeStr = raw.callTime?.trim() || defaultCallTime || '11:00 AM';

      let scheduledAt = new Date();
      try {
        const combined = new Date(`${dateStr} ${timeStr}`);
        if (!isNaN(combined.getTime())) {
          scheduledAt = combined;
        } else {
          scheduledAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
        }
      } catch {
        scheduledAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
      }

      const effectiveCampaign = raw.campaign?.trim() || campaignName?.trim() || 'Telecalling Campaign';
      const notes = raw.scriptNotes?.trim() || 'Scheduled telecalling batch outreach';

      try {
        const existing = existingMap.get(cleanPhone) || (normalizedEmail ? existingMap.get(`email:${normalizedEmail}`) : undefined);

        // Target executive
        let targetOwnerId: string | null = null;
        if (assignmentMode === 'SPECIFIC_USER' && targetUserId) {
          targetOwnerId = targetUserId;
        } else if (assignmentMode === 'ROUND_ROBIN_TEAM' && teamExecutives.length > 0) {
          targetOwnerId = teamExecutives[roundRobinIndex % teamExecutives.length].id;
          roundRobinIndex++;
        } else if (assignmentMode === 'KEEP_OWNER' && existing?.currentOwnerId) {
          targetOwnerId = existing.currentOwnerId;
        } else if (teamExecutives.length > 0) {
          targetOwnerId = teamExecutives[roundRobinIndex % teamExecutives.length].id;
          roundRobinIndex++;
        }
        if (targetOwnerId) {
          assignedCallingCounts.set(targetOwnerId, (assignedCallingCounts.get(targetOwnerId) || 0) + 1);
        }

        if (existing) {
          const ownerToSet = targetOwnerId || existing.currentOwnerId || null;
          pendingExistingUpdates.push({
            id: existing.id,
            ownerToSet,
            scheduledAt,
            effectiveCampaign,
            notes,
            source: `${CALLING_SOURCE_PREFIX} ${effectiveCampaign}`,
            targetOwnerId,
            previousOwnerId: existing.currentOwnerId,
          });
        } else if (batchKeys.has(phoneKey) || (emailKey && batchKeys.has(emailKey))) {
          // duplicate in same batch, skip
          continue;
        } else {
          currentSeq++;
          const leadNumber = `ORV-${currentSeq.toString().padStart(6, '0')}`;
          const leadId = randomUUID();
          const ownerToSet = targetOwnerId || null;
          const createdAt = new Date();

          pendingNewLeads.push({
            id: leadId,
            leadNumber,
            clientName,
            phone: cleanPhone,
            source: `Calling: ${effectiveCampaign}`,
            notes,
            currentOwnerId: ownerToSet,
            currentStatus: 'NEW',
            currentCategory: 'ACTIVE',
            nextAction: `Call: ${effectiveCampaign}`,
            nextActionAt: scheduledAt,
            isNewToMe: true,
            lastUpdatedAt: createdAt,
            createdAt,
            updatedAt: createdAt,
          });

          if (ownerToSet) {
            pendingAssignments.push({
              leadId,
              previousOwnerId: null,
              newOwnerId: ownerToSet,
              performedById: user.id,
              reason: `Calling campaign allocation: ${effectiveCampaign}`,
              type: 'INITIAL',
            });
          }

          if (ownerToSet) {
            pendingFollowups.push({
              leadId,
              userId: ownerToSet,
              dueAt: scheduledAt,
              nextAction: `Call: ${effectiveCampaign}`,
            });
          }

          batchKeys.add(phoneKey);
          if (emailKey) batchKeys.add(emailKey);

          existingMap.set(cleanPhone, {
            id: leadId,
            phone: cleanPhone,
            email: normalizedEmail || null,
            leadNumber,
            clientName,
            currentOwnerId: ownerToSet,
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Row calling schedule failed';
        errors.push({ row: rowNum, error: msg, data: raw });
      }
    }

    // Fast Single Batch Insert
    if (pendingNewLeads.length > 0) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.lead.createMany({ data: pendingNewLeads });
          await tx.leadAssignment.createMany({ data: pendingAssignments });
          if (pendingUpdates.length > 0) {
            await tx.leadUpdate.createMany({ data: pendingUpdates });
          }
          await tx.leadFollowup.createMany({ data: pendingFollowups });
        });
        createdCount += pendingNewLeads.length;
        scheduledCount += pendingNewLeads.length;
        assignedCount += pendingNewLeads.filter((lead) => Boolean(lead.currentOwnerId)).length;
      } catch (err) {
        console.error('Batch calling insert error:', err);
        const msg = err instanceof Error ? err.message : 'Batch insert failed';
        errors.push({ row: chunkStart + 1, error: msg });
      }
    }

    if (pendingExistingUpdates.length > 0) {
      try {
        await prisma.$transaction(async (tx) => {
          const pendingExistingAssignments: Prisma.LeadAssignmentCreateManyInput[] = [];
          const pendingExistingFollowups: Prisma.LeadFollowupCreateManyInput[] = [];

          for (const item of pendingExistingUpdates) {
            if (item.targetOwnerId && item.targetOwnerId !== item.previousOwnerId) {
              pendingExistingAssignments.push({
                leadId: item.id,
                previousOwnerId: item.previousOwnerId,
                newOwnerId: item.targetOwnerId,
                performedById: user.id,
                reason: `Calling campaign reallocation: ${item.effectiveCampaign}`,
                type: 'CALLING_CAMPAIGN',
              });
            }

            await tx.lead.update({
              where: { id: item.id },
              data: {
                currentOwnerId: item.ownerToSet,
                currentCategory: 'ACTIVE',
                source: item.source,
                currentStatus: 'NEW',
                nextAction: `Call: ${item.effectiveCampaign}`,
                nextActionAt: item.scheduledAt,
                isNewToMe: true,
                lastRemarkedAt: null,
                lastUpdatedAt: new Date(),
              },
            });

            if (item.ownerToSet) {
              pendingExistingFollowups.push({
                leadId: item.id,
                userId: item.ownerToSet,
                dueAt: item.scheduledAt,
                nextAction: `Call: ${item.effectiveCampaign}`,
              });
            }
          }

          if (pendingExistingAssignments.length > 0) {
            await tx.leadAssignment.createMany({ data: pendingExistingAssignments });
          }
          if (pendingExistingFollowups.length > 0) {
            await tx.leadFollowup.createMany({ data: pendingExistingFollowups });
          }
        });

        updatedCount += pendingExistingUpdates.length;
        scheduledCount += pendingExistingUpdates.length;
        assignedCount += pendingExistingUpdates.filter((item) => Boolean(item.targetOwnerId)).length;
      } catch (err) {
        console.error('Update calling leads batch error:', err);
        const msg = err instanceof Error ? err.message : 'Batch calling update failed';
        errors.push({ row: chunkStart + 1, error: msg });
      }
    }
  }

  await logAudit({
    actorId: user.id,
    action: 'BULK_IMPORT_CALLING',
    entity: 'LEAD',
    metadata: {
      totalRows: rows.length,
      scheduledCount,
      createdCount,
      updatedCount,
      errorsCount: errors.length,
      campaignName: campaignName || 'Telecalling Batch',
    },
  });

  if (assignedCallingCounts.size > 0) {
    const recipients = await prisma.user.findMany({
      where: { id: { in: Array.from(assignedCallingCounts.keys()) }, active: true },
      select: { id: true, role: true },
    });
    await Promise.all(
      recipients.map((recipient) => createNotification({
        userId: recipient.id,
        type: 'LEAD_ASSIGNED',
        title: 'New Calling Data Added',
        message: `${assignedCallingCounts.get(recipient.id)} calling record${assignedCallingCounts.get(recipient.id) === 1 ? '' : 's'} were added to your queue by ${user.name}.`,
        link: recipient.role === 'TEAM_LEAD'
          ? '/dashboard/team-lead/calling'
          : '/dashboard/executive/calling',
      }))
    );
  }

  return {
    totalRows: rows.length,
    scheduledCount,
    createdCount,
    updatedCount,
    assignedCount,
    errors,
  };
}
