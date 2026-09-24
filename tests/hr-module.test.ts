import { describe, expect, test, beforeAll } from 'bun:test';
import { prisma } from '../lib/db';
import { canAccessLead, canReassignLead, isHR } from '../lib/permissions';
import { signToken } from '../lib/auth';
import { NextRequest } from 'next/server';
import { POST as postUsersRoute } from '../app/api/users/route';
import { POST as postEmployeesRoute } from '../app/api/hr/employees/route';
import { GET as getAttendanceExportRoute } from '../app/api/hr/attendance/export/route';
import {
  getEmployees,
  recordClockInOut,
  submitLeaveRequest,
  reviewLeaveRequest,
  getTargetsAndCommissions,
  createJobOpening,
  createCandidate,
  updateCandidateStage,
  convertCandidateToEmployee,
} from '../services/hr.service';
import { UserSession } from '../types';

describe('ORVION HR & Workforce Management Module (Zero Lead Access)', () => {
  let hrSession: UserSession;
  let adminSession: UserSession;
  let rahulSession: UserSession;
  let sampleLeadId: string;

  beforeAll(async () => {
    let testTeam = await prisma.team.findFirst();
    if (!testTeam) {
      testTeam = await prisma.team.create({
        data: { name: 'Alpha Sales Division' },
      });
    }

    const ensureUser = async (email: string, name: string, role: string) => {
      let u = await prisma.user.findUnique({ where: { email } });
      if (!u) {
        u = await prisma.user.create({
          data: {
            email,
            name,
            role,
            teamId: role === 'EXECUTIVE' ? testTeam.id : null,
            baseSalary: 45000,
            routingAvailable: true,
            passwordHash: 'test',
          },
        });
      }
      return u;
    };

    const hr = await ensureUser('hr@orvion.com', 'HR Director', 'HR');
    const admin = await ensureUser('admin@orvion.com', 'Admin Test', 'ADMIN');
    const rahul = await ensureUser('rahul@orvion.com', 'Rahul Sharma', 'EXECUTIVE');

    hrSession = { id: hr.id, name: hr.name, email: hr.email, role: 'HR' };
    adminSession = { id: admin.id, name: admin.name, email: admin.email, role: 'ADMIN' };
    rahulSession = { id: rahul.id, name: rahul.name, email: rahul.email, role: 'EXECUTIVE', teamId: rahul.teamId };

    let firstLead = await prisma.lead.findFirst();
    if (!firstLead) {
      firstLead = await prisma.lead.create({
        data: {
          leadNumber: 'ORV-HR-TEST-01',
          clientName: 'HR Test Prospect',
          phone: '+91 99887 00000',
          source: 'Direct HNI',
          currentOwnerId: rahulSession.id,
        },
      });
    }
    sampleLeadId = firstLead.id;
  });

  test('1. Security: HR is strictly blocked from accessing leads and reassignments', async () => {
    expect(isHR(hrSession)).toBe(true);

    const lead = await prisma.lead.findUnique({
      where: { id: sampleLeadId },
      include: { currentOwner: true },
    });

    // Verify permission check returns false for HR
    expect(canAccessLead(hrSession, lead!)).toBe(false);
    expect(canReassignLead(hrSession)).toBe(false);
  });

  test('2. Attendance & Smart Lead Routing Synchronization', async () => {
    await prisma.attendance.deleteMany({ where: { userId: rahulSession.id } });

    // Rahul clocks in -> routingAvailable should become true
    await recordClockInOut(rahulSession.id, 'CLOCK_IN', 'Morning shift');
    let user = await prisma.user.findUnique({ where: { id: rahulSession.id } });
    expect(user?.routingAvailable).toBe(true);

    // Rahul clocks out -> routingAvailable should be false
    await recordClockInOut(rahulSession.id, 'CLOCK_OUT', 'Leaving for day');
    user = await prisma.user.findUnique({ where: { id: rahulSession.id } });
    expect(user?.routingAvailable).toBe(false);

    // A second clock-in on the same day cannot reopen the completed shift.
    await recordClockInOut(rahulSession.id, 'CLOCK_IN', 'Repeated mark in');
    user = await prisma.user.findUnique({ where: { id: rahulSession.id } });
    expect(user?.routingAvailable).toBe(false);
  });

  test('3. Leave Management & Approval Safeguards', async () => {
    const todayStr = new Date().toISOString().split('T')[0];

    // Submit leave
    const leave = await submitLeaveRequest({
      userId: rahulSession.id,
      leaveType: 'CASUAL',
      startDate: todayStr,
      endDate: todayStr,
      daysCount: 1,
      reason: 'Personal errand',
    });

    expect(leave.status).toBe('PENDING');

    // HR approves leave
    const approved = await reviewLeaveRequest(leave.id, hrSession.id, 'APPROVED', 'Approved by HR');
    expect(approved.status).toBe('APPROVED');
    expect(approved.reviewedById).toBe(hrSession.id);

    // Because today is within leave range, Rahul's routingAvailable should become false
    const user = await prisma.user.findUnique({ where: { id: rahulSession.id } });
    expect(user?.routingAvailable).toBe(false);

    // Reset back to available for subsequent tests
    await prisma.user.update({
      where: { id: rahulSession.id },
      data: { routingAvailable: true },
    });
  });

  test('4. Targets & Commissions Calculator (Zero Lead Privacy)', async () => {
    const period = new Date().toISOString().substring(0, 7);
    const payroll = await getTargetsAndCommissions(period);

    expect(payroll.staff.length).toBeGreaterThan(0);
    expect(payroll.totalPayroll).toBeGreaterThan(0);

    const rahulPayroll = payroll.staff.find((s) => s.userId === rahulSession.id);
    expect(rahulPayroll).not.toBeUndefined();
    expect(rahulPayroll?.baseSalary).toBeGreaterThan(0);
    expect(rahulPayroll?.netPayout).toBeGreaterThanOrEqual(rahulPayroll!.baseSalary);

    // Ensure zero customer lead details exist in payroll response
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((rahulPayroll as any).leadNumber).toBeUndefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((rahulPayroll as any).clientName).toBeUndefined();
  });

  test('5. Recruitment Pipeline & 1-Click Candidate Hiring', async () => {
    // Create Job Opening
    const opening = await createJobOpening({
      title: 'Junior Property Closer',
      department: 'Sales',
      location: 'Ahmedabad',
      experience: '1-2 years',
    });

    // Create Candidate
    const candidate = await createCandidate({
      fullName: 'Aakash Verma',
      email: `aakash.${Date.now()}@example.com`,
      phone: '+91 98777 66554',
      jobOpeningId: opening.id,
      experienceYears: 1.5,
      currentCtc: 300000,
      expectedCtc: 420000,
    });

    expect(candidate.stage).toBe('APPLIED');

    // Move candidate through pipeline: APPLIED -> MOCK_PITCH -> OFFER
    await updateCandidateStage(candidate.id, 'MOCK_PITCH', 5, 'Great phone mock pitch');
    const updated = await prisma.candidate.findUnique({ where: { id: candidate.id } });
    expect(updated?.stage).toBe('MOCK_PITCH');
    expect(updated?.rating).toBe(5);

    // 1-Click Hire: Convert Candidate to Employee
    const newEmployee = await convertCandidateToEmployee({
      candidateId: candidate.id,
      role: 'EXECUTIVE',
      designation: 'Junior Closer',
      department: 'Sales',
      baseSalary: 35000,
      actorId: hrSession.id,
    });

    expect(newEmployee.email).toBe(candidate.email);
    expect(newEmployee.role).toBe('EXECUTIVE');
    expect(newEmployee.routingAvailable).toBe(true);

    // Candidate should now be marked HIRED
    const hiredCandidate = await prisma.candidate.findUnique({ where: { id: candidate.id } });
    expect(hiredCandidate?.stage).toBe('HIRED');
  });

  test('6. HR Permissions: HR can create Sales Executive and Team Lead accounts', async () => {
    const hrToken = signToken(hrSession);

    // 1. HR creates Sales Executive via POST /api/users
    const execEmail = `exec.hrcrt.${Date.now()}@orvion.com`;
    const execReq = new NextRequest('http://localhost:3000/api/users', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${hrToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'HR Created Exec',
        email: execEmail,
        password: 'Password@123',
        role: 'EXECUTIVE',
        designation: 'Sales Closer',
      }),
    });
    const execRes = await postUsersRoute(execReq);
    expect(execRes.status).toBe(201);

    // 2. HR creates Team Lead via POST /api/hr/employees
    const leadEmail = `lead.hrcrt.${Date.now()}@orvion.com`;
    const leadReq = new NextRequest('http://localhost:3000/api/hr/employees', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${hrToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'HR Created Lead',
        email: leadEmail,
        password: 'Password@123',
        role: 'TEAM_LEAD',
        designation: 'Team Captain',
      }),
    });
    const leadRes = await postEmployeesRoute(leadReq);
    expect(leadRes.status).toBe(201);

    // Cleanup
    await prisma.user.deleteMany({ where: { email: { in: [execEmail, leadEmail] } } });
  });

  test('7. HR Security Enforced: HR is strictly forbidden from creating ADMIN or HR accounts', async () => {
    const hrToken = signToken(hrSession);

    // 1. HR attempting to create ADMIN via POST /api/users
    const fakeAdminReq = new NextRequest('http://localhost:3000/api/users', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${hrToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Unauthorized Admin',
        email: `fakeadmin.${Date.now()}@orvion.com`,
        password: 'Password@123',
        role: 'ADMIN',
      }),
    });
    const fakeAdminRes = await postUsersRoute(fakeAdminReq);
    expect(fakeAdminRes.status).toBe(403);

    // 2. HR attempting to create HR via POST /api/hr/employees
    const fakeHrReq = new NextRequest('http://localhost:3000/api/hr/employees', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${hrToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Unauthorized HR Manager',
        email: `fakehr.${Date.now()}@orvion.com`,
        password: 'Password@123',
        role: 'HR',
      }),
    });
    const fakeHrRes = await postEmployeesRoute(fakeHrReq);
    expect(fakeHrRes.status).toBe(403);
  });

  test('8. Export 1-Month and Selected Date Attendance Sheets (CSV and Summary Rollup)', async () => {
    const hrToken = signToken(hrSession);

    // 1. Export 1-Month Detailed Daily Log Sheet as CSV
    const monthExportReq = new NextRequest(
      'http://localhost:3000/api/hr/attendance/export?startDate=2026-09-01&endDate=2026-09-30&format=csv&type=daily',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${hrToken}`,
        },
      }
    );
    const monthRes = await getAttendanceExportRoute(monthExportReq);
    expect(monthRes.status).toBe(200);
    expect(monthRes.headers.get('Content-Type')).toContain('text/csv');
    const monthCsvText = await monthRes.text();
    expect(monthCsvText).toContain('Employee Name');
    expect(monthCsvText).toContain('Mark-In Time (IST)');
    expect(monthCsvText).toContain('Mark-Out Time (IST)');

    // 2. Export 1-Month Summary Rollup Sheet as CSV
    const summaryExportReq = new NextRequest(
      'http://localhost:3000/api/hr/attendance/export?startDate=2026-09-01&endDate=2026-09-30&format=csv&type=summary',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${hrToken}`,
        },
      }
    );
    const summaryRes = await getAttendanceExportRoute(summaryExportReq);
    expect(summaryRes.status).toBe(200);
    const summaryCsvText = await summaryRes.text();
    expect(summaryCsvText).toContain('Attendance %');
    expect(summaryCsvText).toContain('Present Days');

    // 3. Export Single Selected Date Sheet
    const singleDayReq = new NextRequest(
      'http://localhost:3000/api/hr/attendance/export?startDate=2026-09-15&endDate=2026-09-15&format=csv&type=daily',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${hrToken}`,
        },
      }
    );
    const singleDayRes = await getAttendanceExportRoute(singleDayReq);
    expect(singleDayRes.status).toBe(200);
    const singleDayCsv = await singleDayRes.text();
    expect(singleDayCsv).toContain('2026-09-15');
  });
});
