import { prisma } from '../lib/db';
import { hashPassword, comparePassword, signToken, verifyToken } from '../lib/auth';
import { createLead, getLeads, addLeadUpdate, getLeadById, deleteLead, bulkDeleteLeads, bulkReassignLeads, bulkUpdateStatusLeads, getAdminAttentionMetrics } from '../services/lead.service';
import { reassignLead } from '../services/assignment.service';
import { getCallingData } from '../services/followup.service';
import { processBulkLeadsImport, processBulkCallingImport } from '../services/import.service';
import { checkAndEscalateSlaBreaches } from '../services/sla.service';
import { createMeeting, completeMeeting, getMeetings } from '../services/meeting.service';
import { createNotification, getUserNotifications, markNotificationRead, markAllNotificationsRead, clearAllNotifications } from '../services/notification.service';
import { getDailyAttendance, recordClockInOut, setAttendanceStatus, getLeaveRequests, submitLeaveRequest, reviewLeaveRequest, getTargetsAndCommissions, saveSalesTarget, getJobOpenings, createJobOpening, getCandidates, createCandidate, convertCandidateToEmployee } from '../services/hr.service';
import { UserSession } from '../types';

async function runCompleteCrmAudit() {
  console.log('=====================================================');
  console.log('  ORVION ENTERPRISE CRM — EXHAUSTIVE 1-BY-1 AUDIT    ');
  console.log('=====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  // Pre-cleanup any stale test records
  const staleLeads = await prisma.lead.findMany({
    where: {
      OR: [
        { clientName: { contains: 'Audit Test' } },
        { clientName: { contains: 'Bulk Import Prospect' } },
        { clientName: { contains: 'Calling Lead' } },
        { phone: { in: ['+91 99999 11111', '+91 98888 11111', '+91 98888 22222', '+91 97777 11111', '+91 97777 22222'] } },
      ],
    },
    select: { id: true },
  });
  if (staleLeads.length > 0) {
    for (const l of staleLeads) {
      await prisma.leadUpdate.deleteMany({ where: { leadId: l.id } });
      await prisma.leadAssignment.deleteMany({ where: { leadId: l.id } });
      await prisma.leadFollowup.deleteMany({ where: { leadId: l.id } });
      await prisma.leadStatusHistory.deleteMany({ where: { leadId: l.id } });
      await prisma.callLog.deleteMany({ where: { leadId: l.id } });
      await prisma.meeting.deleteMany({ where: { leadId: l.id } });
      await prisma.lead.delete({ where: { id: l.id } });
    }
  }

  // ----------------------------------------------------
  // 1. AUTHENTICATION & CORE USERS
  // ----------------------------------------------------
  console.log('\n--- 1. AUTHENTICATION & SESSION RESOLVER ---');
  const adminUser = await prisma.user.findUnique({ where: { email: 'nehra@orvion.com' } });
  const hrUser = await prisma.user.findUnique({ where: { email: 'meera@orvion.com' } });
  const execUser = await prisma.user.findUnique({ where: { email: 'shubham@orvion.com' } });

  assert(Boolean(adminUser && adminUser.role === 'ADMIN'), 'Admin user "Nehra" exists with ADMIN role');
  assert(Boolean(hrUser && hrUser.role === 'HR'), 'HR user "Meera" exists with HR role');
  assert(Boolean(execUser && execUser.role === 'EXECUTIVE'), 'Executive user "Shubham" exists with EXECUTIVE role');

  if (!adminUser || !hrUser || !execUser) {
    throw new Error('Core users missing from database');
  }

  const adminSession: UserSession = {
    id: adminUser.id,
    name: adminUser.name,
    email: adminUser.email,
    role: adminUser.role as any,
  };
  const execSession: UserSession = {
    id: execUser.id,
    name: execUser.name,
    email: execUser.email,
    role: execUser.role as any,
  };
  const hrSession: UserSession = {
    id: hrUser.id,
    name: hrUser.name,
    email: hrUser.email,
    role: hrUser.role as any,
  };

  const adminToken = signToken(adminSession);
  const verifiedAdmin = verifyToken(adminToken);
  assert(verifiedAdmin?.email === 'nehra@orvion.com' && verifiedAdmin?.role === 'ADMIN', 'JWT Token sign & verify succeeds');

  // ----------------------------------------------------
  // 2. LEAD CREATION, UPDATE & IMMUTABILITY
  // ----------------------------------------------------
  console.log('\n--- 2. LEAD CREATION, UPDATES & STORY DOSSIER ---');
  const testLead = await createLead(
    {
      clientName: 'Audit Test Client',
      phone: '+91 99999 11111',
      alternatePhone: '+91 99999 22222',
      email: 'audit@orvion.com',
      company: 'Audit Enterprises Ltd',
      location: 'Ahmedabad Expressway Zone',
      source: 'Direct Audit',
      notes: 'Initial requirement: 1,000 sq yd industrial land',
      currentStatus: 'NEW',
      currentOwnerId: execUser.id,
    },
    adminSession
  );

  assert(Boolean(testLead.id && testLead.leadNumber.startsWith('ORV-')), `Lead created with permanent ID ${testLead.leadNumber}`);
  assert(testLead.currentOwnerId === execUser.id, 'Lead correctly assigned to executive Shubham');
  assert(testLead.isNewToMe === true, 'isNewToMe flag set to true for newly assigned executive');

  // Add 1st update
  const updatedLead1 = await addLeadUpdate({
    leadId: testLead.id,
    remark: 'Spoke with client. Client requested financial modeling deck.',
    status: 'INTERESTED',
    nextAction: 'Deliver Financial Projections Deck',
    nextActionAt: new Date(Date.now() + 86400000),
    user: execSession,
  });

  assert(updatedLead1.currentStatus === 'INTERESTED', 'Lead status successfully updated to INTERESTED');
  assert(updatedLead1.isNewToMe === false, 'isNewToMe flag cleared after executive remark');
  assert(updatedLead1.currentCategory === 'ACTIVE', 'Category is ACTIVE for INTERESTED status');

  // Add 2nd update
  const updatedLead2 = await addLeadUpdate({
    leadId: testLead.id,
    remark: 'Sent presentation via WhatsApp. Client confirmed receipt.',
    status: 'CALL_BACK',
    nextAction: 'Follow up on WhatsApp presentation',
    nextActionAt: new Date(Date.now() + 172800000),
    user: execSession,
  });

  // Fetch full lead dossier & verify history
  const dossier = await getLeadById(testLead.id);
  assert(dossier?.updates.length === 3, `Lead updates history contains 3 immutable entries (actual: ${dossier?.updates.length})`);
  assert(
    dossier?.updates[0].remark === 'Sent presentation via WhatsApp. Client confirmed receipt.',
    'Most recent update remark is correctly ordered at index 0'
  );

  // ----------------------------------------------------
  // 3. REASSIGNMENT ENGINE & AUDIT TRAIL
  // ----------------------------------------------------
  console.log('\n--- 3. REASSIGNMENT ENGINE & ROLE PERMISSIONS ---');
  const reassignedLead = await reassignLead({
    leadId: testLead.id,
    newOwnerId: adminUser.id,
    performer: adminSession,
    reason: 'Executive requested senior management escalation',
  });

  assert(reassignedLead.currentOwnerId === adminUser.id, 'Lead reassigned to Admin');
  const dossierAfterReassign = await getLeadById(testLead.id);
  assert(
    (dossierAfterReassign?.assignments.length || 0) >= 1,
    `Lead assignment history recorded (count: ${dossierAfterReassign?.assignments.length})`
  );

  // ----------------------------------------------------
  // 4. NOT ANSWERING & NOT INTERESTED TRIAGE QUEUES
  // ----------------------------------------------------
  console.log('\n--- 4. NOT ANSWERING & NOT INTERESTED TRIAGE ---');
  const naUpdated = await addLeadUpdate({
    leadId: testLead.id,
    remark: 'Called 3 times, phone switched off.',
    status: 'NOT_ANSWERING',
    user: adminSession,
  });

  assert(naUpdated.currentCategory === 'NOT_ANSWERING', 'Lead category automatically set to NOT_ANSWERING');

  const niUpdated = await addLeadUpdate({
    leadId: testLead.id,
    remark: 'Client purchased alternate property elsewhere.',
    status: 'NOT_INTERESTED',
    user: adminSession,
  });

  assert(niUpdated.currentCategory === 'NOT_INTERESTED', 'NOT_INTERESTED lead routed to NOT_INTERESTED category');

  // ----------------------------------------------------
  // 5. BULK IMPORT ENGINE (LEADS & CALLING)
  // ----------------------------------------------------
  console.log('\n--- 5. BULK LEADS & CALLING IMPORT PARSER ---');
  const bulkLeadsResult = await processBulkLeadsImport({
    rows: [
      {
        clientName: 'Bulk Import Prospect 1',
        phone: '+91 98888 11111',
        email: 'prospect1@import.test',
        source: 'Property Expo 2026',
        notes: 'Interested in commercial corner plot',
      },
      {
        clientName: 'Bulk Import Prospect 2',
        phone: '+91 98888 22222',
        email: 'prospect2@import.test',
        source: 'Digital Campaign',
      },
    ],
    assignmentMode: 'SPECIFIC_USER',
    targetUserId: execUser.id,
    duplicateStrategy: 'SKIP',
    user: adminSession,
  });

  assert(bulkLeadsResult.createdCount === 2, `Bulk leads import created 2 leads (actual: ${bulkLeadsResult.createdCount})`);
  assert(bulkLeadsResult.assignedCount === 2, `Bulk leads import assigned 2 leads to executive`);

  const bulkCallingResult = await processBulkCallingImport({
    rows: [
      {
        clientName: 'Calling Lead 1',
        phone: '+91 97777 11111',
        campaign: 'Q3 Outbound Calling Wave',
        callDate: '2026-09-15',
        callTime: '11:00',
      },
      {
        clientName: 'Calling Lead 2',
        phone: '+91 97777 22222',
        campaign: 'Q3 Outbound Calling Wave',
        callDate: '2026-09-15',
        callTime: '14:30',
      },
    ],
    assignmentMode: 'SPECIFIC_USER',
    targetUserId: execUser.id,
    user: adminSession,
  });

  assert(bulkCallingResult.createdCount === 2, `Bulk calling import scheduled 2 calling records`);

  // ----------------------------------------------------
  // 6. TELECALLING & CALLING METRICS
  // ----------------------------------------------------
  console.log('\n--- 6. CALLING METRICS & OPERATIONAL POOLS ---');
  const callingData = await getCallingData(adminSession, {});
  assert(callingData.metrics.totalCallingPool > 0, `Active calling pool calculated: ${callingData.metrics.totalCallingPool}`);
  assert(Array.isArray(callingData.callToday), 'callToday list is an array');
  assert(Array.isArray(callingData.executiveMatrix), 'Telecaller matrix is an array');

  // ----------------------------------------------------
  // 7. EXECUTIVE TASKS & DEADLINE SYSTEM
  // ----------------------------------------------------
  console.log('\n--- 7. DAILY TASKS & EXECUTIVE DIRECTIVES ---');
  const createdTask = await prisma.executiveTask.create({
    data: {
      title: 'Audit System Verification Task',
      description: 'Ensure 100% test coverage and zero regressions',
      priority: 'HIGH',
      dueDate: new Date().toISOString().slice(0, 10),
      dueTime: '18:00',
      status: 'PENDING',
      assigneeId: execUser.id,
      createdById: adminUser.id,
    },
  });

  assert(Boolean(createdTask.id), 'Task successfully created for executive');

  const updatedTask = await prisma.executiveTask.update({
    where: { id: createdTask.id },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });

  assert(updatedTask.status === 'COMPLETED' && Boolean(updatedTask.completedAt), 'Executive task completed with timestamp');
  await prisma.executiveTask.delete({ where: { id: createdTask.id } });

  // ----------------------------------------------------
  // 8. HR ATTENDANCE & SHIFTS
  // ----------------------------------------------------
  console.log('\n--- 8. HR ATTENDANCE & SHIFT CLOCK ---');
  const clockInRecord = await recordClockInOut(execUser.id, 'CLOCK_IN', 'Morning shift start');
  assert(Boolean(clockInRecord.clockIn), 'Executive clock-in recorded');

  const clockOutRecord = await recordClockInOut(execUser.id, 'CLOCK_OUT', 'Evening shift complete');
  assert(Boolean(clockOutRecord.clockOut), 'Executive clock-out recorded');

  const dailyRoster = await getDailyAttendance();
  assert(dailyRoster.total >= 3, `Daily attendance roster returned ${dailyRoster.total} staff members`);

  // ----------------------------------------------------
  // 9. LEAVE REQUEST WORKFLOW
  // ----------------------------------------------------
  console.log('\n--- 9. LEAVE REQUESTS & HR APPROVAL ---');
  const leaveReq = await submitLeaveRequest({
    userId: execUser.id,
    leaveType: 'CASUAL',
    startDate: '2026-09-20',
    endDate: '2026-09-21',
    daysCount: 2,
    reason: 'Personal family event',
  });

  assert(leaveReq.status === 'PENDING', 'Leave request submitted with status PENDING');

  const approvedLeave = await reviewLeaveRequest(leaveReq.id, hrUser.id, 'APPROVED', 'Approved by HR Manager');
  assert(approvedLeave.status === 'APPROVED', 'Leave request successfully APPROVED by HR');

  await prisma.leaveRequest.delete({ where: { id: leaveReq.id } });

  // ----------------------------------------------------
  // 10. HR TARGETS & PAYROLL
  // ----------------------------------------------------
  console.log('\n--- 10. TARGETS & SALES COMMISSIONS ---');
  const currentPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const salesTarget = await saveSalesTarget({
    userId: execUser.id,
    period: currentPeriod,
    targetCalls: 200,
    targetMeetings: 25,
    targetRevenue: 5000000,
    commissionRate: 2.5,
    bonus: 5000,
    deductions: 0,
  });

  assert(salesTarget.targetCalls === 200, 'Sales target saved: 200 calls quota');
  const payrollSummary = await getTargetsAndCommissions(currentPeriod);
  assert(payrollSummary.staff.length >= 1, `Payroll summary fetched with ${payrollSummary.staff.length} staff members`);

  // ----------------------------------------------------
  // 11. RECRUITMENT & 1-CLICK HIRING
  // ----------------------------------------------------
  console.log('\n--- 11. RECRUITMENT PIPELINE & HIRING ---');
  const jobOpening = await createJobOpening({
    title: 'Senior Property Sales Specialist',
    department: 'Sales',
    location: 'Ahmedabad',
    experience: '3-5 years',
    openingsCount: 2,
    description: 'Leading high-value industrial and luxury farm transactions',
  });

  assert(Boolean(jobOpening.id), `Job opening created: "${jobOpening.title}"`);

  const candidate = await createCandidate({
    fullName: 'Rohan Deshmukh',
    email: 'rohan.d@recruitment.test',
    phone: '+91 96666 11111',
    jobOpeningId: jobOpening.id,
    currentCompany: 'Apex Realty',
    experienceYears: 4,
    notes: 'Impressive track record in Dholera commercial sales',
  });

  assert(candidate.stage === 'APPLIED', 'Candidate registered in APPLIED stage');

  // ----------------------------------------------------
  // 12. MEETINGS MANAGEMENT
  // ----------------------------------------------------
  console.log('\n--- 12. MEETINGS & CLIENT CALENDAR ---');
  const meeting = await createMeeting({
    leadId: testLead.id,
    date: '2026-09-18',
    time: '11:00',
    meetingType: 'SITE_VISIT',
    location: 'Dholera Industrial Site Node 1',
    notes: 'Present plot coordinates and land registry title deeds',
    user: adminSession,
  });

  assert(meeting.status === 'UPCOMING', 'Meeting scheduled with status UPCOMING');

  const completedMeeting = await completeMeeting({
    meetingId: meeting.id,
    outcome: 'POSITIVE',
    user: adminSession,
    nextAction: 'Draft Expression of Interest (EOI) agreement',
    nextActionAt: new Date(Date.now() + 86400000),
  });

  assert(completedMeeting.status === 'COMPLETED', 'Meeting completed with POSITIVE outcome');

  // ----------------------------------------------------
  // 13. NOTIFICATIONS ENGINE
  // ----------------------------------------------------
  console.log('\n--- 13. REAL-TIME NOTIFICATIONS CENTER ---');
  const notif = await createNotification({
    userId: execUser.id,
    type: 'TASK_ASSIGNED',
    title: 'Audit Notification Test',
    message: 'Test notification delivery',
  });

  assert(Boolean(notif && notif.id), 'Notification created');
  const execNotifs = await getUserNotifications(execUser.id);
  assert(execNotifs.some((n) => notif && n.id === notif.id), 'Notification retrieved in user notification drawer');

  if (notif) {
    await markNotificationRead(notif.id, execUser.id);
    const updatedNotif = await prisma.notification.findUnique({ where: { id: notif.id } });
    assert(updatedNotif?.read === true, 'Notification marked as read');
    await prisma.notification.delete({ where: { id: notif.id } });
  }

  // ----------------------------------------------------
  // 14. SLA INACTIVITY ENGINE
  // ----------------------------------------------------
  console.log('\n--- 14. SLA BREACH DETECTION ENGINE ---');
  const slaCheckResult = await checkAndEscalateSlaBreaches();
  assert(typeof slaCheckResult.checkedCount === 'number', `SLA engine evaluated ${slaCheckResult.checkedCount} active leads`);

  // ----------------------------------------------------
  // 15. CLEANUP AUDIT TEST RECORDS
  // ----------------------------------------------------
  console.log('\n--- 15. CLEANUP AUDIT TEST RECORDS ---');
  // Clean candidate & job opening
  await prisma.candidate.delete({ where: { id: candidate.id } });
  await prisma.jobOpening.delete({ where: { id: jobOpening.id } });

  // Clean test lead and bulk leads
  const testLeadsToDelete = await prisma.lead.findMany({
    where: {
      OR: [
        { id: testLead.id },
        { phone: { in: ['+91 98888 11111', '+91 98888 22222', '+91 97777 11111', '+91 97777 22222', '+91 99999 11111'] } },
      ],
    },
    select: { id: true },
  });

  if (testLeadsToDelete.length > 0) {
    await bulkDeleteLeads(testLeadsToDelete.map((l) => l.id), adminSession);
  }

  // Clean sales target
  await prisma.salesTarget.deleteMany({ where: { id: salesTarget.id } });

  console.log('\n=====================================================');
  console.log(`  AUDIT COMPLETE: ${passed} PASSED, ${failed} FAILED `);
  console.log('=====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runCompleteCrmAudit()
  .catch((err) => {
    console.error('Audit encountered fatal exception:', err);
    process.exit(1);
  });
