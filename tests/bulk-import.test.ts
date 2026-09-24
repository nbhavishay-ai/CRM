import { describe, expect, test, beforeAll } from 'bun:test';
import { prisma } from '../lib/db';
import { processBulkLeadsImport, processBulkCallingImport } from '../services/import.service';
import { addLeadUpdate, getLeads } from '../services/lead.service';
import { getCallingData } from '../services/followup.service';
import { assignCallingPool } from '../services/assignment.service';
import { recordClockInOut } from '../services/hr.service';
import { UserRole, UserSession } from '../types';

describe('ORVION Bulk Leads & Calling Data Import Service', () => {
  let adminUser: UserSession;
  let rahulUser: UserSession;
  let amitUser: UserSession;
  let testTeamId: string;

  beforeAll(async () => {
    let testTeam = await prisma.team.findFirst({ where: { name: { contains: 'Alpha' } } });
    if (!testTeam) {
      testTeam = await prisma.team.create({
        data: { name: 'Alpha Sales Division' },
      });
    }
    testTeamId = testTeam.id;

    const ensureUser = async (email: string, name: string, role: string) => {
      let u = await prisma.user.findUnique({ where: { email } });
      if (!u) {
        u = await prisma.user.create({
          data: {
            email,
            name,
            role,
            teamId: role === 'EXECUTIVE' ? testTeamId : null,
            passwordHash: 'test',
          },
        });
      }
      return u;
    };

    const admin = await ensureUser('admin@orvion.com', 'Admin Test', 'ADMIN');
    const rahul = await ensureUser('rahul@orvion.com', 'Rahul Sharma', 'EXECUTIVE');
    const amit = await ensureUser('amit@orvion.com', 'Amit Verma', 'EXECUTIVE');

    adminUser = { id: admin.id, name: admin.name, email: admin.email, role: admin.role as UserRole };
    rahulUser = { id: rahul.id, name: rahul.name, email: rahul.email, role: rahul.role as UserRole };
    amitUser = { id: amit.id, name: amit.name, email: amit.email, role: amit.role as UserRole };
  });

  test('1. Bulk Leads Import - Direct Assignment to Executive', async () => {
    const uniquePhone1 = `+919811${Math.floor(100000 + Math.random() * 900000)}`;
    const uniquePhone2 = `+919812${Math.floor(100000 + Math.random() * 900000)}`;
    const uniqueEmail1 = `corpa_${Date.now()}_${Math.floor(Math.random() * 10000)}@example.com`;
    const uniqueEmail2 = `corpb_${Date.now()}_${Math.floor(Math.random() * 10000)}@example.com`;

    const result = await processBulkLeadsImport({
      rows: [
        {
          clientName: 'Bulk Import Corp A',
          phone: uniquePhone1,
          email: uniqueEmail1,
          company: 'Corp Alpha Ltd',
          source: 'Bulk CSV Ingestion',
          notes: 'Priority prospect from Expo 2026',
        },
        {
          clientName: 'Bulk Import Corp B',
          phone: uniquePhone2,
          email: uniqueEmail2,
          company: 'Corp Beta Ltd',
          source: 'Bulk CSV Ingestion',
        },
      ],
      assignmentMode: 'SPECIFIC_USER',
      targetUserId: rahulUser.id,
      duplicateStrategy: 'SKIP',
      user: adminUser,
    });

    expect(result.createdCount).toBe(2);
    expect(result.errors.length).toBe(0);

    // Verify leads in DB
    const lead1 = await prisma.lead.findFirst({ where: { phone: uniquePhone1 } });
    expect(lead1).not.toBeNull();
    expect(lead1?.currentOwnerId).toBe(rahulUser.id);
    expect(lead1?.clientName).toBe('Bulk Import Corp A');
    expect(lead1?.company).toBe('Corp Alpha Ltd');
    expect(lead1?.isNewToMe).toBe(true);

    const todayLeads = await getLeads({ session: rahulUser, todayLeads: true, pageSize: 100 });
    const callingData = await getCallingData(rahulUser);
    expect(todayLeads.leads.some((lead) => lead.id === lead1?.id)).toBe(true);
    expect(callingData.callToday.some((lead) => lead.id === lead1?.id)).toBe(false);

    // Verify initial assignment history was created
    const assignments = await prisma.leadAssignment.findMany({ where: { leadId: lead1!.id } });
    expect(assignments.length).toBe(1);
    expect(assignments[0].newOwnerId).toBe(rahulUser.id);
  });

  test('2. Bulk Leads Import - Duplicate Detection (Skip vs Update)', async () => {
    const duplicatePhone = `+919813${Math.floor(100000 + Math.random() * 900000)}`;

    // Initial creation
    const initialResult = await processBulkLeadsImport({
      rows: [
        {
          clientName: 'Original Prospect',
          phone: duplicatePhone,
          company: 'Original Co',
          source: 'Website',
        },
      ],
      assignmentMode: 'UNASSIGNED',
      duplicateStrategy: 'SKIP',
      user: adminUser,
    });
    expect(initialResult.createdCount).toBe(1);

    // Test duplicateStrategy = 'SKIP'
    const skipResult = await processBulkLeadsImport({
      rows: [
        {
          clientName: 'Duplicate Prospect Ignored',
          phone: duplicatePhone,
          company: 'Ignored Co',
        },
      ],
      assignmentMode: 'SPECIFIC_USER',
      targetUserId: amitUser.id,
      duplicateStrategy: 'SKIP',
      user: adminUser,
    });
    expect(skipResult.skippedCount).toBe(1);
    expect(skipResult.createdCount).toBe(0);

    // Verify lead was unchanged
    const untouched = await prisma.lead.findFirst({ where: { phone: duplicatePhone } });
    expect(untouched?.clientName).toBe('Original Prospect');

    // Test duplicateStrategy = 'UPDATE'
    const updateResult = await processBulkLeadsImport({
      rows: [
        {
          clientName: 'Updated Prospect Name',
          phone: duplicatePhone,
          company: 'Updated Enterprise Ltd',
          notes: 'Re-engaged via webinar import',
        },
      ],
      assignmentMode: 'UNASSIGNED',
      duplicateStrategy: 'UPDATE',
      user: adminUser,
    });
    expect(updateResult.updatedCount).toBe(1);

    // Verify lead was updated
    const updated = await prisma.lead.findFirst({ where: { phone: duplicatePhone } });
    expect(updated?.clientName).toBe('Updated Prospect Name');
    expect(updated?.company).toBe('Updated Enterprise Ltd');
  });

  test('3. Bulk Leads Import - Round Robin Team Distribution', async () => {
    if (!testTeamId) return;

    const phones = [
      `+919814${Math.floor(100000 + Math.random() * 900000)}`,
      `+919815${Math.floor(100000 + Math.random() * 900000)}`,
      `+919816${Math.floor(100000 + Math.random() * 900000)}`,
      `+919817${Math.floor(100000 + Math.random() * 900000)}`,
    ];

    const result = await processBulkLeadsImport({
      rows: phones.map((p, idx) => ({
        clientName: `Round Robin Client ${idx + 1}`,
        phone: p,
        source: 'Round Robin Batch',
      })),
      assignmentMode: 'ROUND_ROBIN_TEAM',
      targetTeamId: testTeamId,
      duplicateStrategy: 'SKIP',
      user: adminUser,
    });

    expect(result.createdCount).toBe(4);

    // Fetch created leads and ensure they were distributed across team members
    const createdLeads = await prisma.lead.findMany({
      where: { phone: { in: phones } },
    });

    const owners = new Set(createdLeads.map((l) => l.currentOwnerId));
    // Should have distributed to at least 2 distinct team members if team has > 1 member
    const teamMembers = await prisma.user.findMany({ where: { teamId: testTeamId, active: true } });
    if (teamMembers.length > 1) {
      expect(owners.size).toBeGreaterThanOrEqual(2);
    }
  });

  test('4. Bulk Calling Data Import - Queuing Scheduled Calls for Executive', async () => {
    const callPhone1 = `+919821${Math.floor(100000 + Math.random() * 900000)}`;
    const callPhone2 = `+919822${Math.floor(100000 + Math.random() * 900000)}`;

    const result = await processBulkCallingImport({
      rows: [
        {
          clientName: 'Calling Target One',
          phone: callPhone1,
          callDate: '2026-09-20',
          callTime: '11:30',
          campaign: 'Q3 Enterprise Outbound',
          priority: 'HIGH',
          scriptNotes: 'Pitch Enterprise 2.0 SLA and Q3 discount.',
        },
        {
          clientName: 'Calling Target Two',
          phone: callPhone2,
          callDate: '2026-09-20',
          callTime: '14:00',
          campaign: 'Q3 Enterprise Outbound',
          priority: 'URGENT',
          scriptNotes: 'Contract renewal due in 15 days.',
        },
      ],
      assignmentMode: 'SPECIFIC_USER',
      targetUserId: rahulUser.id,
      user: adminUser,
    });

    expect(result.createdCount).toBe(2);
    expect(result.errors.length).toBe(0);

    // Calling uploads remain new drafts until an executive logs a real remark.
    const callLead1 = await prisma.lead.findFirst({ where: { phone: callPhone1 } });
    expect(callLead1).not.toBeNull();
    expect(callLead1?.currentOwnerId).toBe(rahulUser.id);
    expect(callLead1?.currentStatus).toBe('NEW');
    expect(callLead1?.isNewToMe).toBe(true);
    expect(callLead1?.nextAction).toContain('Q3 Enterprise Outbound');
    expect(callLead1?.nextActionAt).not.toBeNull();

    await prisma.attendance.deleteMany({ where: { userId: rahulUser.id } });
    await recordClockInOut(rahulUser.id, 'CLOCK_IN');

    const todayLeads = await getLeads({ session: rahulUser, todayLeads: true, pageSize: 100 });
    const callingData = await getCallingData(rahulUser);
    expect(todayLeads.leads.some((lead) => lead.id === callLead1?.id)).toBe(false);
    expect(callingData.callToday.some((lead) => lead.id === callLead1?.id)).toBe(true);

    // Verify follow-up reminder was created
    const followups = await prisma.leadFollowup.findMany({ where: { leadId: callLead1!.id } });
    expect(followups.length).toBeGreaterThanOrEqual(1);
    expect(followups[0].dueAt).not.toBeNull();
  });

  test('5. Bulk Leads & Calling Import - Upload Without Name defaults to Unnamed Lead', async () => {
    const namelessPhone1 = `+919831${Math.floor(100000 + Math.random() * 900000)}`;
    const namelessPhone2 = `+919832${Math.floor(100000 + Math.random() * 900000)}`;

    // Bulk leads import without clientName
    const leadsResult = await processBulkLeadsImport({
      rows: [
        {
          phone: namelessPhone1,
          company: 'Mystery Enterprise',
          source: 'Cold Database 2026',
        },
      ],
      assignmentMode: 'SPECIFIC_USER',
      targetUserId: rahulUser.id,
      duplicateStrategy: 'SKIP',
      user: adminUser,
    });

    expect(leadsResult.createdCount).toBe(1);
    expect(leadsResult.errors.length).toBe(0);

    const createdNamelessLead = await prisma.lead.findFirst({ where: { phone: namelessPhone1 } });
    expect(createdNamelessLead).not.toBeNull();
    expect(createdNamelessLead?.clientName).toBe('Unnamed Lead');
    expect(createdNamelessLead?.currentOwnerId).toBe(rahulUser.id);

    // Bulk calling import without clientName
    const callingResult = await processBulkCallingImport({
      rows: [
        {
          phone: namelessPhone2,
          callDate: '2026-09-22',
          callTime: '15:30',
          scriptNotes: 'Cold pitch to raw phone list',
        },
      ],
      assignmentMode: 'SPECIFIC_USER',
      targetUserId: rahulUser.id,
      user: adminUser,
    });

    expect(callingResult.createdCount).toBe(1);
    const createdCallingLead = await prisma.lead.findFirst({ where: { phone: namelessPhone2 } });
    expect(createdCallingLead).not.toBeNull();
    expect(createdCallingLead?.clientName).toBe('Unnamed Lead');
  });

  test('6. Admin Calling Pool - Assigns a selected count and removes it from the pool', async () => {
    const phones = [
      `+919900${Math.floor(100000 + Math.random() * 900000)}`,
      `+919901${Math.floor(100000 + Math.random() * 900000)}`,
      `+919902${Math.floor(100000 + Math.random() * 900000)}`,
    ];

    try {
      const imported = await processBulkCallingImport({
        rows: phones.map((phone, index) => ({
          clientName: `Calling Pool Test ${index + 1}`,
          phone,
          campaign: 'Calling Pool Regression',
          callDate: '2026-09-20',
          callTime: '11:00',
        })),
        assignmentMode: 'UNASSIGNED',
        user: adminUser,
      });

      expect(imported.createdCount).toBe(3);
      expect(imported.assignedCount).toBe(0);

      const assigned = await assignCallingPool({
        count: 2,
        newOwnerId: rahulUser.id,
        performer: adminUser,
      });
      expect(assigned.assignedCount).toBe(2);

      const assignedRecords = await prisma.lead.findMany({
        where: { leadNumber: { in: assigned.leadNumbers } },
        select: { currentOwnerId: true },
      });
      expect(assignedRecords).toHaveLength(2);
      expect(assignedRecords.every((record) => record.currentOwnerId === rahulUser.id)).toBe(true);
    } finally {
      await prisma.lead.deleteMany({ where: { phone: { in: phones } } });
    }
  });

  test('7. Executive Permission - Executive can update lead name during call/update logging', async () => {
    const leadPhone = `+919841${Math.floor(100000 + Math.random() * 900000)}`;

    // 1. Create lead with placeholder name
    const initialResult = await processBulkLeadsImport({
      rows: [
        {
          phone: leadPhone,
          source: 'Exhibition Drop Box',
        },
      ],
      assignmentMode: 'SPECIFIC_USER',
      targetUserId: rahulUser.id,
      duplicateStrategy: 'SKIP',
      user: adminUser,
    });
    expect(initialResult.createdCount).toBe(1);

    const lead = await prisma.lead.findFirst({ where: { phone: leadPhone } });
    expect(lead?.clientName).toBe('Unnamed Lead');

    // 2. Executive calls prospect, discovers their real name is "Vikram Singhania", and logs update
    const updatedLead = await addLeadUpdate({
      leadId: lead!.id,
      clientName: 'Vikram Singhania',
      remark: 'Spoke with client, confirmed interest in commercial plot. Updated contact name.',
      status: 'INTERESTED',
      nextAction: 'Send project brochure on WhatsApp',
      user: rahulUser,
    });

    expect(updatedLead.clientName).toBe('Vikram Singhania');
    expect(updatedLead.currentStatus).toBe('INTERESTED');

    // Verify DB record has updated name
    const dbLead = await prisma.lead.findUnique({ where: { id: lead!.id } });
    expect(dbLead?.clientName).toBe('Vikram Singhania');

    // Verify audit log recorded the name change
    const auditRecord = await prisma.auditLog.findFirst({
      where: {
        entityId: lead!.id,
        actorId: rahulUser.id,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(auditRecord).not.toBeNull();
    expect(auditRecord?.action).toBe('EDIT_LEAD_INFO');
  });
});
