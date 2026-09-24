import { prisma } from '@/lib/db';
import { createNotification } from './notification.service';
import { logAudit } from './audit.service';

export interface SlaBreachItem {
  leadId: string;
  leadNumber: string;
  clientName: string;
  phone: string;
  currentStatus: string;
  currentCategory: string;
  ownerName: string;
  teamName: string;
  teamLeadName: string;
  breachReason: string;
  hoursDelayed: number;
}

/**
 * Evaluates active leads against ORVION Enterprise SLA thresholds.
 * When an SLA threshold is breached, dispatches high-priority notification
 * alerts simultaneously to BOTH the Team Lead and ALL system Admins.
 */
export async function checkAndEscalateSlaBreaches(): Promise<{
  checkedCount: number;
  breachedCount: number;
  notificationsSent: number;
  breaches: SlaBreachItem[];
}> {
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // 1. Fetch potential SLA candidates
  const [candidateLeads, activeAdmins, recentSlaNotifications] = await Promise.all([
    prisma.lead.findMany({
      where: {
        OR: [
          { currentStatus: 'NEW', createdAt: { lt: twoHoursAgo } },
          { currentCategory: 'NOT_ANSWERING', lastUpdatedAt: { lt: twentyFourHoursAgo } },
          { currentCategory: 'ACTIVE', nextActionAt: { lt: twentyFourHoursAgo } },
        ],
      },
      include: {
        currentOwner: {
          include: {
            team: {
              include: {
                members: {
                  where: { role: 'TEAM_LEAD', active: true },
                },
              },
            },
          },
        },
        updates: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    }),
    prisma.user.findMany({
      where: { role: 'ADMIN', active: true },
      select: { id: true, name: true, email: true },
    }),
    prisma.notification.findMany({
      where: {
        type: { in: ['SLA_BREACH', 'SLA_ESCALATION'] },
        createdAt: { gte: twentyFourHoursAgo },
      },
      select: { link: true },
    }),
  ]);

  const breaches: SlaBreachItem[] = [];
  let notificationsSent = 0;
  const notifiedLeadLinks = new Set(
    recentSlaNotifications.map((notification) => notification.link).filter(Boolean)
  );

  for (const lead of candidateLeads) {
    let breachReason = '';
    let hoursDelayed = 0;

    if (lead.currentStatus === 'NEW' && lead.createdAt < twoHoursAgo) {
      // Check if any real update has occurred
      if (lead.updates.length === 0) {
        hoursDelayed = Math.round((now.getTime() - lead.createdAt.getTime()) / (1000 * 60 * 60));
        breachReason = `New lead untouched for ${hoursDelayed} hours (SLA limit: 2 hours)`;
      }
    } else if (lead.currentCategory === 'NOT_ANSWERING' && lead.lastUpdatedAt < twentyFourHoursAgo) {
      hoursDelayed = Math.round((now.getTime() - lead.lastUpdatedAt.getTime()) / (1000 * 60 * 60));
      breachReason = `Not Answering lead unattended for ${hoursDelayed} hours (SLA limit: 24 hours)`;
    } else if (lead.nextActionAt && lead.nextActionAt < twentyFourHoursAgo) {
      hoursDelayed = Math.round((now.getTime() - lead.nextActionAt.getTime()) / (1000 * 60 * 60));
      breachReason = `Scheduled action past due by ${hoursDelayed} hours (SLA limit: 24 hours)`;
    }

    if (!breachReason) continue;

    const team = lead.currentOwner?.team;
    const teamLead = team?.members[0];
    const teamName = team?.name || 'Company Direct';
    const teamLeadName = teamLead?.name || 'Unassigned Lead';
    const ownerName = lead.currentOwner?.name || 'Unassigned';

    breaches.push({
      leadId: lead.id,
      leadNumber: lead.leadNumber,
      clientName: lead.clientName,
      phone: lead.phone,
      currentStatus: lead.currentStatus,
      currentCategory: lead.currentCategory,
      ownerName,
      teamName,
      teamLeadName,
      breachReason,
      hoursDelayed,
    });

    const leadLink = `/dashboard/leads/${lead.id}`;
    if (!notifiedLeadLinks.has(leadLink)) {
      notifiedLeadLinks.add(leadLink);
      // Dispatch A: Notify Team Lead (if assigned)
      const notificationWrites: Promise<unknown>[] = [];
      if (teamLead) {
        notificationWrites.push(createNotification({
          userId: teamLead.id,
          type: 'SLA_BREACH',
          title: `⚠️ Team SLA Alert: ${lead.leadNumber} (${lead.clientName})`,
          message: `${breachReason}. Assigned Executive: ${ownerName}. Immediate supervisory action required.`,
          link: leadLink,
        }));
      }

      // Dispatch B: Notify ALL Admins (Always, per user specification)
      for (const admin of activeAdmins) {
        // Don't duplicate if admin happens to be the team lead
        if (admin.id === teamLead?.id) continue;

        notificationWrites.push(createNotification({
          userId: admin.id,
          type: 'SLA_ESCALATION',
          title: `🚨 SLA Escalation: ${lead.leadNumber} (${lead.clientName})`,
          message: `${breachReason} under Team "${teamName}" (Lead: ${teamLeadName}). Assigned to ${ownerName}.`,
          link: leadLink,
        }));
      }

      // Audit Log for permanent compliance record
      notificationWrites.push(logAudit({
        actorId: null,
        action: 'SLA_BREACH_ESCALATED',
        entity: 'LEAD',
        entityId: lead.id,
        metadata: {
          leadNumber: lead.leadNumber,
          breachReason,
          hoursDelayed,
          ownerName,
          teamName,
          teamLeadId: teamLead?.id,
          adminsNotifiedCount: activeAdmins.length,
        },
      }));
      await Promise.all(notificationWrites);
      notificationsSent += notificationWrites.length - 1;
    }
  }

  return {
    checkedCount: candidateLeads.length,
    breachedCount: breaches.length,
    notificationsSent,
    breaches,
  };
}
