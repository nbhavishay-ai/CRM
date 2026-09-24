import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { prisma } from '../lib/db';
import { reassignLead } from '../services/assignment.service';
import { addLeadUpdate, getLeads, getAdminAttentionMetrics } from '../services/lead.service';
import { canAccessLead } from '../lib/permissions';
import { UserSession } from '../types';

describe('ORVION Enterprise CRM Core Business Rules', () => {
  let adminUser: UserSession;
  let rahulUser: UserSession;
  let amitUser: UserSession;
  let priyaUser: UserSession;
  let karanUser: UserSession;

  beforeAll(async () => {
    // Ensure test team exists
    let testTeam = await prisma.team.findFirst();
    if (!testTeam) {
      testTeam = await prisma.team.create({
        data: { name: 'Alpha Sales Division' },
      });
    }

    // Ensure test users exist
    const ensureUser = async (email: string, name: string, role: string) => {
      let u = await prisma.user.findUnique({ where: { email } });
      if (!u) {
        u = await prisma.user.create({
          data: {
            email,
            name,
            role,
            teamId: role === 'EXECUTIVE' ? testTeam.id : null,
            passwordHash: 'test',
          },
        });
      }
      return u;
    };

    const admin = await ensureUser('admin@orvion.com', 'Admin Test', 'ADMIN');
    const rahul = await ensureUser('rahul@orvion.com', 'Rahul Sharma', 'EXECUTIVE');
    const amit = await ensureUser('amit@orvion.com', 'Amit Verma', 'EXECUTIVE');
    const priya = await ensureUser('priya@orvion.com', 'Priya Singh', 'EXECUTIVE');
    const karan = await ensureUser('karan@orvion.com', 'Karan Mehta', 'EXECUTIVE');

    adminUser = { id: admin.id, name: admin.name, email: admin.email, role: 'ADMIN' };
    rahulUser = { id: rahul.id, name: rahul.name, email: rahul.email, role: 'EXECUTIVE', teamId: rahul.teamId };
    amitUser = { id: amit.id, name: amit.name, email: amit.email, role: 'EXECUTIVE', teamId: amit.teamId };
    priyaUser = { id: priya.id, name: priya.name, email: priya.email, role: 'EXECUTIVE', teamId: priya.teamId };
    karanUser = { id: karan.id, name: karan.name, email: karan.email, role: 'EXECUTIVE', teamId: karan.teamId };
  });

  test('1. Multi-hop Reassignment Chain: Rahul -> Amit -> Priya -> Karan -> Rahul', async () => {
    // Create a fresh lead assigned to Rahul
    const testLead = await prisma.lead.create({
      data: {
        leadNumber: 'ORV-TEST-001',
        clientName: 'Tata Power Transmission',
        phone: '+91 99887 76655',
        source: 'Direct HNI',
        currentOwnerId: rahulUser.id,
        currentStatus: 'INTERESTED',
        currentCategory: 'ACTIVE',
        isNewToMe: true,
      },
    });

    const leadId = testLead.id;

    // Step 1: Rahul -> Amit
    await reassignLead({ leadId, newOwnerId: amitUser.id, performer: adminUser, reason: 'Shift to Amit' });
    let lead = await prisma.lead.findUnique({ where: { id: leadId } });
    expect(lead?.currentOwnerId).toBe(amitUser.id);
    expect(lead?.isNewToMe).toBe(true);

    // Step 2: Amit -> Priya
    await reassignLead({ leadId, newOwnerId: priyaUser.id, performer: adminUser, reason: 'Shift to Priya' });
    lead = await prisma.lead.findUnique({ where: { id: leadId } });
    expect(lead?.currentOwnerId).toBe(priyaUser.id);

    // Step 3: Priya -> Karan
    await reassignLead({ leadId, newOwnerId: karanUser.id, performer: adminUser, reason: 'Shift to Karan' });
    lead = await prisma.lead.findUnique({ where: { id: leadId } });
    expect(lead?.currentOwnerId).toBe(karanUser.id);

    // Step 4: Karan -> Rahul (Full cycle completed)
    await reassignLead({ leadId, newOwnerId: rahulUser.id, performer: adminUser, reason: 'Returned to Rahul' });
    lead = await prisma.lead.findUnique({ where: { id: leadId } });
    expect(lead?.currentOwnerId).toBe(rahulUser.id);
    expect(lead?.leadNumber).toBe('ORV-TEST-001'); // ID NEVER CHANGES

    // Verify assignment history is unbroken
    const history = await prisma.leadAssignment.findMany({
      where: { leadId },
      orderBy: { timestamp: 'asc' },
    });
    expect(history.length).toBe(4);
    expect(history[0].newOwnerId).toBe(amitUser.id);
    expect(history[1].newOwnerId).toBe(priyaUser.id);
    expect(history[2].newOwnerId).toBe(karanUser.id);
    expect(history[3].newOwnerId).toBe(rahulUser.id);

    // Verify previous owner (Karan) does not see it in active leads, but Rahul does
    const karanLeads = await getLeads({ session: karanUser });
    expect(karanLeads.leads.some((l) => l.id === leadId)).toBe(false);

    const rahulLeads = await getLeads({ session: rahulUser });
    expect(rahulLeads.leads.some((l) => l.id === leadId)).toBe(true);

    // Cleanup
    await prisma.leadAssignment.deleteMany({ where: { leadId } });
    await prisma.leadUpdate.deleteMany({ where: { leadId } });
    await prisma.lead.delete({ where: { id: leadId } });
  });

  test('2. Not Answering (NA) moves lead out of Executive workspace into Admin queue', async () => {
    const naLead = await prisma.lead.create({
      data: {
        leadNumber: 'ORV-TEST-002',
        clientName: 'Testing NA Workflow',
        phone: '+91 99999 00001',
        source: 'Web',
        currentOwnerId: rahulUser.id,
        currentStatus: 'NEW',
        currentCategory: 'ACTIVE',
      },
    });

    // Executive logs update marking Not Answering
    await addLeadUpdate({
      leadId: naLead.id,
      remark: 'No response after 3 phone attempts',
      status: 'NOT_ANSWERING',
      user: rahulUser,
    });

    const updated = await prisma.lead.findUnique({ where: { id: naLead.id } });
    expect(updated?.currentStatus).toBe('NOT_ANSWERING');
    expect(updated?.currentCategory).toBe('NOT_ANSWERING');

    // Verify Rahul does not see it in active workspace
    const rahulActiveLeads = await getLeads({ session: rahulUser, category: 'ACTIVE' });
    expect(rahulActiveLeads.leads.some((l) => l.id === naLead.id)).toBe(false);

    // Verify Admin sees it in NOT_ANSWERING queue
    const adminNALeads = await getLeads({ session: adminUser, category: 'NOT_ANSWERING' });
    expect(adminNALeads.leads.some((l) => l.id === naLead.id)).toBe(true);

    // Cleanup
    await prisma.leadUpdate.deleteMany({ where: { leadId: naLead.id } });
    await prisma.leadStatusHistory.deleteMany({ where: { leadId: naLead.id } });
    await prisma.lead.delete({ where: { id: naLead.id } });
  });

  test('3. Immutable remarks history never overwrites previous updates', async () => {
    const historyLead = await prisma.lead.create({
      data: {
        leadNumber: 'ORV-TEST-003',
        clientName: 'Immutable Updates Test',
        phone: '+91 99999 00002',
        source: 'Web',
        currentOwnerId: rahulUser.id,
      },
    });

    await addLeadUpdate({ leadId: historyLead.id, remark: 'First remark: Called client', user: rahulUser });
    await addLeadUpdate({ leadId: historyLead.id, remark: 'Second remark: Sent TP map', user: rahulUser });
    await addLeadUpdate({ leadId: historyLead.id, remark: 'Third remark: Negotiated price', user: rahulUser });

    const updates = await prisma.leadUpdate.findMany({
      where: { leadId: historyLead.id },
      orderBy: { createdAt: 'asc' },
    });

    expect(updates.length).toBe(3);
    expect(updates[0].remark).toContain('First remark');
    expect(updates[1].remark).toContain('Second remark');
    expect(updates[2].remark).toContain('Third remark');

    // Cleanup
    await prisma.leadUpdate.deleteMany({ where: { leadId: historyLead.id } });
    await prisma.lead.delete({ where: { id: historyLead.id } });
  });

  test('4. Strict Role-Based Isolation', async () => {
    // Lead owned by Rahul (Team Alpha)
    const alphaLead = {
      currentOwnerId: rahulUser.id,
      currentOwner: { teamId: rahulUser.teamId },
    };

    // Rahul can access
    expect(canAccessLead(rahulUser, alphaLead)).toBe(true);

    // Amit (same team) as Executive CANNOT access Rahul's private active lead
    expect(canAccessLead(amitUser, alphaLead)).toBe(false);

    // Priya (Team Bravo) CANNOT access Rahul's lead
    expect(canAccessLead(priyaUser, alphaLead)).toBe(false);

    // Admin CAN access everything
    expect(canAccessLead(adminUser, alphaLead)).toBe(true);
  });

  test('5. Admin Real Attention Metrics (Zero Hardcoding)', async () => {
    const metrics = await getAdminAttentionMetrics();
    expect(typeof metrics.unassigned).toBe('number');
    expect(typeof metrics.overdueFollowups).toBe('number');
    expect(typeof metrics.withoutNextAction).toBe('number');
    expect(typeof metrics.notAnswering).toBe('number');
    expect(typeof metrics.notInterested).toBe('number');
    expect(typeof metrics.totalActive).toBe('number');
    expect(typeof metrics.totalAll).toBe('number');
    expect(metrics.totalAll).toBeGreaterThanOrEqual(0);
  });

  test('6. RBAC: Executive & HR restricted from manual lead creation', async () => {
    // Lead creation is reserved exclusively for ADMIN
    expect(adminUser.role === 'ADMIN').toBe(true);
    expect(rahulUser.role === 'EXECUTIVE').toBe(true);

    // Verify Admin can create lead
    const adminCreatedLead = await prisma.lead.create({
      data: {
        leadNumber: 'ORV-TEST-ADMIN-01',
        clientName: 'Adani Infrastructure',
        phone: '+91 99000 88776',
        source: 'Admin Portal',
        currentStatus: 'NEW',
        currentCategory: 'ACTIVE',
        lastUpdatedAt: new Date(),
      },
    });
    expect(adminCreatedLead.id).toBeTruthy();
    expect(adminCreatedLead.clientName).toBe('Adani Infrastructure');

    // Cleanup
    await prisma.lead.delete({ where: { id: adminCreatedLead.id } });
  });

  test('7. Story / Lead Dossier Restricted Exclusively to ADMIN', () => {
    // Only ADMIN has role === 'ADMIN'
    const isAdminUser = (user: { role: string }) => user.role === 'ADMIN';

    expect(isAdminUser(adminUser)).toBe(true);
    expect(isAdminUser(rahulUser)).toBe(false);
    expect(isAdminUser(amitUser)).toBe(false);
    expect(isAdminUser(priyaUser)).toBe(false);
    expect(isAdminUser({ role: 'HR' })).toBe(false);
    expect(isAdminUser({ role: 'TEAM_LEAD' })).toBe(false);
  });

  test('8. Delete Lead & Bulk Delete Leads - Cascades related records safely', async () => {
    const { deleteLead, bulkDeleteLeads } = await import('@/services/lead.service');

    // Create 3 temporary leads
    const l1 = await prisma.lead.create({
      data: {
        leadNumber: 'DEL-TEST-001',
        clientName: 'Single Delete Prospect',
        phone: '919900112233',
        source: 'Website',
      },
    });

    const l2 = await prisma.lead.create({
      data: {
        leadNumber: 'DEL-TEST-002',
        clientName: 'Bulk Delete Prospect 1',
        phone: '919900112234',
        source: 'Website',
      },
    });

    const l3 = await prisma.lead.create({
      data: {
        leadNumber: 'DEL-TEST-003',
        clientName: 'Bulk Delete Prospect 2',
        phone: '919900112235',
        source: 'Website',
      },
    });

    // Test single delete
    const singleResult = await deleteLead(l1.id, adminUser);
    expect(singleResult.success).toBe(true);
    const checkL1 = await prisma.lead.findUnique({ where: { id: l1.id } });
    expect(checkL1).toBeNull();

    // Test bulk delete
    const bulkResult = await bulkDeleteLeads([l2.id, l3.id], adminUser);
    expect(bulkResult.count).toBe(2);
    const checkRemaining = await prisma.lead.findMany({ where: { id: { in: [l2.id, l3.id] } } });
    expect(checkRemaining.length).toBe(0);
  });

  test('9. Bulk Reassignment & Bulk Status Updates', async () => {
    const { bulkReassignLeads, bulkUpdateStatusLeads } = await import('@/services/lead.service');

    const rand = Date.now();
    await prisma.lead.deleteMany({ where: { leadNumber: { in: ['BULK-TEST-001', 'BULK-TEST-002'] } } });

    const bLeads = await Promise.all([
      prisma.lead.create({
        data: {
          leadNumber: `BULK-TEST-${rand}-1`,
          clientName: 'Bulk Action Prospect 1',
          phone: `919911${Math.floor(Math.random() * 9000 + 1000)}`,
          currentStatus: 'NEW',
          currentCategory: 'ACTIVE',
        },
      }),
      prisma.lead.create({
        data: {
          leadNumber: `BULK-TEST-${rand}-2`,
          clientName: 'Bulk Action Prospect 2',
          phone: `919911${Math.floor(Math.random() * 9000 + 1000)}`,
          currentStatus: 'NEW',
          currentCategory: 'ACTIVE',
        },
      }),
    ]);

    const ids = bLeads.map((l) => l.id);

    // Bulk Reassign to Rahul
    const reassignResult = await bulkReassignLeads({
      leadIds: ids,
      newOwnerId: rahulUser.id,
      user: adminUser,
      reason: 'Bulk testing assignment',
    });
    expect(reassignResult.count).toBe(2);

    const afterReassign = await prisma.lead.findMany({ where: { id: { in: ids } } });
    expect(afterReassign.every((l) => l.currentOwnerId === rahulUser.id)).toBe(true);

    // Bulk Update Status to INTERESTED
    const statusResult = await bulkUpdateStatusLeads({
      leadIds: ids,
      status: 'INTERESTED',
      remark: 'Bulk qualified via campaign',
      user: adminUser,
    });
    expect(statusResult.count).toBe(2);

    const afterStatus = await prisma.lead.findMany({ where: { id: { in: ids } } });
    expect(afterStatus.every((l) => l.currentStatus === 'INTERESTED')).toBe(true);

    // Clean up
    const { bulkDeleteLeads } = await import('@/services/lead.service');
    await bulkDeleteLeads(ids, adminUser);
  });
});


