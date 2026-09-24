import { describe, it, expect, beforeAll } from 'bun:test';
import { prisma } from '@/lib/db';
import { hashPassword, comparePassword, signToken } from '@/lib/auth';
import { NextRequest } from 'next/server';
import { GET as getLeadsRoute } from '@/app/api/leads/route';
import { GET as searchRoute } from '@/app/api/search/route';
import { GET as getFollowupsRoute, POST as postFollowupsRoute } from '@/app/api/leads/[id]/followups/route';
import { GET as getReportsRoute } from '@/app/api/reports/route';
import { GET as getMeetingsRoute } from '@/app/api/meetings/route';
import { PATCH as patchUsersRoute } from '@/app/api/users/route';
import { completeFollowup, getCallingData } from '@/services/followup.service';
import { getPerformanceReport } from '@/services/report.service';
import { processBulkLeadsImport } from '@/services/import.service';
import { bulkUpdateStatusLeads } from '@/services/lead.service';
import { canAccessLead } from '@/lib/permissions';
import { UserSession } from '@/types';

describe('ORVION Comprehensive CRM & Backend Engine Audit', () => {
  let adminSession: UserSession;
  let hrSession: UserSession;
  let executiveSession: UserSession;
  let adminToken: string;
  let hrToken: string;
  let executiveToken: string;
  let testLeadId: string;
  let testCandidateId: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword('Test@123456');

    // 1. Ensure Admin User
    const adminUser = await prisma.user.upsert({
      where: { email: 'audit-admin@orvion.com' },
      update: {},
      create: {
        name: 'Audit Admin',
        email: 'audit-admin@orvion.com',
        passwordHash,
        role: 'ADMIN',
        active: true,
      },
    });
    adminSession = { id: adminUser.id, email: adminUser.email, role: 'ADMIN', name: adminUser.name };
    adminToken = signToken(adminSession);

    // 2. Ensure HR User
    const hrUser = await prisma.user.upsert({
      where: { email: 'audit-hr@orvion.com' },
      update: {},
      create: {
        name: 'Audit HR Manager',
        email: 'audit-hr@orvion.com',
        passwordHash,
        role: 'HR',
        active: true,
      },
    });
    hrSession = { id: hrUser.id, email: hrUser.email, role: 'HR', name: hrUser.name };
    hrToken = signToken(hrSession);

    // 3. Ensure Executive User
    const execUser = await prisma.user.upsert({
      where: { email: 'audit-exec@orvion.com' },
      update: {},
      create: {
        name: 'Audit Sales Executive',
        email: 'audit-exec@orvion.com',
        passwordHash,
        role: 'EXECUTIVE',
        active: true,
      },
    });
    executiveSession = { id: execUser.id, email: execUser.email, role: 'EXECUTIVE', name: execUser.name };
    executiveToken = signToken(executiveSession);

    // 4. Create a test lead
    const lead = await prisma.lead.upsert({
      where: { leadNumber: 'ORV-AUDIT-001' },
      update: {},
      create: {
        leadNumber: 'ORV-AUDIT-001',
        clientName: 'Audit Prospect Sharma',
        phone: '9876543299',
        source: 'Website Form',
        currentOwnerId: execUser.id,
        currentStatus: 'NEW',
        currentCategory: 'ACTIVE',
      },
    });
    testLeadId = lead.id;

    // 5. Create a test candidate
    const candidate = await prisma.candidate.create({
      data: {
        fullName: 'Audit Candidate Mehra',
        email: 'mehra.candidate@example.com',
        phone: '9988776655',
        stage: 'INTERVIEW_1',
        experienceYears: 4.5,
      },
    });
    testCandidateId = candidate.id;
  });

  it('1. GET /api/leads supports both limit and pageSize parameters', async () => {
    const reqWithLimit = new NextRequest('http://localhost:3000/api/leads?limit=5', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const resLimit = await getLeadsRoute(reqWithLimit);
    expect(resLimit.status).toBe(200);
    const jsonLimit = await resLimit.json();
    expect(jsonLimit.pageSize).toBe(5);

    const reqWithPageSize = new NextRequest('http://localhost:3000/api/leads?pageSize=10', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const resPageSize = await getLeadsRoute(reqWithPageSize);
    expect(resPageSize.status).toBe(200);
    const jsonPageSize = await resPageSize.json();
    expect(jsonPageSize.pageSize).toBe(10);
  });

  it('2. Global Omnibar /api/search finds candidate records for HR & Admin', async () => {
    const searchReq = new NextRequest('http://localhost:3000/api/search?q=Mehra&type=all', {
      headers: { Authorization: `Bearer ${hrToken}` },
    });
    const res = await searchRoute(searchReq);
    expect(res.status).toBe(200);
    const json = await res.json();
    const candidateResult = json.results.find((r: any) => r.type === 'candidate');
    expect(candidateResult).toBeDefined();
    expect(candidateResult.title).toBe('Audit Candidate Mehra');
    expect(candidateResult.url).toBe('/dashboard/hr/recruitment');
  });

  it('3. Global Omnibar /api/search isolates leads from HR access', async () => {
    const searchReq = new NextRequest('http://localhost:3000/api/search?q=Sharma&type=all', {
      headers: { Authorization: `Bearer ${hrToken}` },
    });
    const res = await searchRoute(searchReq);
    expect(res.status).toBe(200);
    const json = await res.json();
    const leadResults = json.results.filter((r: any) => r.type === 'lead');
    expect(leadResults.length).toBe(0); // HR must never see customer leads in search
  });

  it('4. Followups API /api/leads/[id]/followups correctly validates sessions and saves new followup', async () => {
    const postReq = new NextRequest(`http://localhost:3000/api/leads/${testLeadId}/followups`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${executiveToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dueAt: new Date(Date.now() + 86400000).toISOString(),
        nextAction: 'Discuss Quotation & Payment Terms',
      }),
    });

    const postRes = await postFollowupsRoute(postReq, { params: Promise.resolve({ id: testLeadId }) });
    expect(postRes.status).toBe(201);
    const postJson = await postRes.json();
    expect(postJson.followup).toBeDefined();
    expect(postJson.followup.nextAction).toBe('Discuss Quotation & Payment Terms');

    // Fetch followups
    const getReq = new NextRequest(`http://localhost:3000/api/leads/${testLeadId}/followups`, {
      headers: { Authorization: `Bearer ${executiveToken}` },
    });
    const getRes = await getFollowupsRoute(getReq, { params: Promise.resolve({ id: testLeadId }) });
    expect(getRes.status).toBe(200);
    const getJson = await getRes.json();
    expect(getJson.followups.length).toBeGreaterThan(0);
  });

  it('5. completeFollowup synchronizes currentCategory and updates score', async () => {
    // Create a followup
    const f = await prisma.leadFollowup.create({
      data: {
        leadId: testLeadId,
        userId: executiveSession.id,
        dueAt: new Date(),
        nextAction: 'Call prospect',
      },
    });

    // Complete with NOT_ANSWERING
    const result = await completeFollowup({
      followupId: f.id,
      user: executiveSession,
      outcome: 'No answer after 4 rings',
      newStatus: 'NOT_ANSWERING',
    });

    expect(result.updatedLead.currentStatus).toBe('NOT_ANSWERING');
    expect(result.updatedLead.currentCategory).toBe('NOT_ANSWERING');

    const inDb = await prisma.lead.findUnique({ where: { id: testLeadId } });
    expect(inDb?.currentCategory).toBe('NOT_ANSWERING');
  });

  it('6. GET /api/reports restricts HR from accessing customer sales metrics', async () => {
    const hrReq = new NextRequest('http://localhost:3000/api/reports', {
      headers: { Authorization: `Bearer ${hrToken}` },
    });
    const res = await getReportsRoute(hrReq);
    expect(res.status).toBe(403);
  });

  it('7. getPerformanceReport scopes metrics for Executive vs Admin', async () => {
    const execReport = await getPerformanceReport({
      user: executiveSession,
      timeframe: 'weekly',
    });
    expect(execReport.metrics).toBeDefined();

    const adminReport = await getPerformanceReport({
      user: adminSession,
      timeframe: 'weekly',
    });
    expect(adminReport.metrics).toBeDefined();
    expect(adminReport.executiveBreakdown).toBeDefined();
  });

  it('8. GET /api/meetings strictly forbids HR role', async () => {
    const hrReq = new NextRequest('http://localhost:3000/api/meetings', {
      headers: { Authorization: `Bearer ${hrToken}` },
    });
    const res = await getMeetingsRoute(hrReq);
    expect(res.status).toBe(403);
  });

  it('9. processBulkLeadsImport maps CHANNEL_PARTNER and OTHER categories', async () => {
    const res = await processBulkLeadsImport({
      rows: [
        { clientName: 'CP Lead', phone: '9900012345', status: 'CHANNEL_PARTNER' },
        { clientName: 'Other Lead', phone: '9900054321', status: 'OTHER' },
      ],
      assignmentMode: 'UNASSIGNED',
      duplicateStrategy: 'SKIP',
      user: { id: adminSession.id, name: adminSession.name, role: adminSession.role },
    });

    expect(res.createdCount).toBe(2);

    const cpLead = await prisma.lead.findFirst({ where: { phone: '9900012345' } });
    expect(cpLead?.currentCategory).toBe('CHANNEL_PARTNER');

    const otherLead = await prisma.lead.findFirst({ where: { phone: '9900054321' } });
    expect(otherLead?.currentCategory).toBe('OTHER');

    // Cleanup
    if (cpLead) await prisma.lead.delete({ where: { id: cpLead.id } });
    if (otherLead) await prisma.lead.delete({ where: { id: otherLead.id } });
  });

  it('10. bulkUpdateStatusLeads records status history and updates scores', async () => {
    const bulkLead = await prisma.lead.create({
      data: {
        leadNumber: `ORV-BULK-${Date.now()}`,
        clientName: 'Bulk Status Target',
        phone: `991122${Math.floor(Math.random() * 9000 + 1000)}`,
        currentStatus: 'NEW',
        currentCategory: 'ACTIVE',
      },
    });

    await bulkUpdateStatusLeads({
      leadIds: [bulkLead.id],
      status: 'NOT_ANSWERING',
      remark: 'No response to bulk campaign',
      user: adminSession,
    });

    const history = await prisma.leadStatusHistory.findFirst({
      where: { leadId: bulkLead.id },
    });
    expect(history).toBeDefined();
    expect(history?.fromStatus).toBe('NEW');
    expect(history?.toStatus).toBe('NOT_ANSWERING');

    const updated = await prisma.lead.findUnique({ where: { id: bulkLead.id } });
    expect(updated?.currentCategory).toBe('NOT_ANSWERING');

    // Cleanup
    await prisma.leadStatusHistory.deleteMany({ where: { leadId: bulkLead.id } });
    await prisma.leadUpdate.deleteMany({ where: { leadId: bulkLead.id } });
    await prisma.lead.delete({ where: { id: bulkLead.id } });
  });

  it('11. canAccessLead allows assigned Executive and Team Lead, blocks HR', () => {
    const leadOwnedByExec = { currentOwnerId: executiveSession.id, currentOwner: { teamId: 'team-1' } };
    expect(canAccessLead(executiveSession, leadOwnedByExec)).toBe(true);
    expect(canAccessLead(hrSession, leadOwnedByExec)).toBe(false);
    expect(canAccessLead(adminSession, leadOwnedByExec)).toBe(true);
  });

  it('12. getCallingData scopes callToday without overlapping overdue calls', async () => {
    const callingData = await getCallingData(adminSession);
    expect(callingData.overdue).toBeDefined();
    expect(callingData.callToday).toBeDefined();
    expect(callingData.metrics).toBeDefined();
  });

  it('13. Admin can change any executive password via PATCH /api/users, non-admin is forbidden', async () => {
    const newExecPassword = 'NewSecretPassword@2026';

    // 1. Executive trying to reset password via PATCH /api/users should be forbidden (403)
    const execReq = new NextRequest('http://localhost:3000/api/users', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${executiveToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: executiveSession.id,
        password: newExecPassword,
      }),
    });
    const execRes = await patchUsersRoute(execReq);
    expect(execRes.status).toBe(403);

    // 2. Admin successfully changes executive password
    const adminReq = new NextRequest('http://localhost:3000/api/users', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: executiveSession.id,
        password: newExecPassword,
      }),
    });
    const adminRes = await patchUsersRoute(adminReq);
    expect(adminRes.status).toBe(200);

    // 3. Verify user's new password hash in database
    const updatedExec = await prisma.user.findUnique({
      where: { id: executiveSession.id },
    });
    expect(updatedExec).toBeDefined();
    const isMatch = await comparePassword(newExecPassword, updatedExec!.passwordHash);
    expect(isMatch).toBe(true);

    // 4. Verify old password no longer matches
    const isOldMatch = await comparePassword('Test@123456', updatedExec!.passwordHash);
    expect(isOldMatch).toBe(false);
  });
});
