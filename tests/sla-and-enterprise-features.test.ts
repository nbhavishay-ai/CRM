import { describe, expect, test, beforeAll } from 'bun:test';
import { NextRequest } from 'next/server';
import { prisma } from '../lib/db';
import { signToken } from '../lib/auth';
import { checkAndEscalateSlaBreaches } from '../services/sla.service';
import { generateCSV, escapeCSVValue, ExportColumn } from '../lib/export-utils';
import { GET as slaCheckRoute } from '../app/api/sla/check/route';

describe('ORVION Enterprise SLA Engine & Dual Notifications', () => {
  let adminUser: { id: string; name: string; email: string };
  let teamLeadUser: { id: string; name: string; email: string };
  let executiveUser: { id: string; name: string; email: string };
  let teamId: string;
  let breachingLeadId: string;

  beforeAll(async () => {
    // 1. Create isolated Team, Team Lead, and Executive
    const team = await prisma.team.create({
      data: {
        name: `SLA Test Team ${Date.now()}`,
        description: 'Team for automated SLA verification',
      },
    });
    teamId = team.id;

    teamLeadUser = await prisma.user.create({
      data: {
        name: 'SLA Team Lead',
        email: `sla.tl.${Date.now()}@orvion.com`,
        passwordHash: 'dummy',
        role: 'TEAM_LEAD',
        teamId,
        active: true,
      },
    });

    executiveUser = await prisma.user.create({
      data: {
        name: 'SLA Executive',
        email: `sla.exec.${Date.now()}@orvion.com`,
        passwordHash: 'dummy',
        role: 'EXECUTIVE',
        teamId,
        active: true,
      },
    });

    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    adminUser = { id: admin!.id, name: admin!.name, email: admin!.email };

    // 2. Create a Lead that is 3 hours old with NEW status (breaches 2h SLA)
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const breachingLead = await prisma.lead.create({
      data: {
        leadNumber: `ORV-SLA-${Date.now().toString().slice(-6)}`,
        clientName: 'SLA Breach Test Prospect',
        phone: '+91 98765 43210',
        currentStatus: 'NEW',
        currentCategory: 'ACTIVE',
        currentOwnerId: executiveUser.id,
        createdAt: threeHoursAgo,
        lastUpdatedAt: threeHoursAgo,
      },
    });
    breachingLeadId = breachingLead.id;
  });

  test('1. Smart SLA Engine detects uncontacted NEW lead (> 2 hours)', async () => {
    const result = await checkAndEscalateSlaBreaches();

    expect(result.checkedCount).toBeGreaterThan(0);
    expect(result.breachedCount).toBeGreaterThan(0);

    const match = result.breaches.find((b) => b.leadId === breachingLeadId);
    expect(match).not.toBeUndefined();
    expect(match?.clientName).toBe('SLA Breach Test Prospect');
    expect(match?.teamName).toContain('SLA Test Team');
    expect(match?.teamLeadName).toBe('SLA Team Lead');
    expect(match?.breachReason).toContain('New lead untouched for');
  });

  test('2. Dual Notification: BOTH Team Lead and Admin receive high-priority alerts', async () => {
    // A. Check that the Team Lead received SLA_BREACH notification
    const tlNotification = await prisma.notification.findFirst({
      where: {
        userId: teamLeadUser.id,
        type: 'SLA_BREACH',
        link: `/dashboard/leads/${breachingLeadId}`,
      },
    });
    expect(tlNotification).not.toBeNull();
    expect(tlNotification?.title).toContain('Team SLA Alert');
    expect(tlNotification?.message).toContain('Assigned Executive: SLA Executive');

    // B. Check that the Admin received SLA_ESCALATION notification
    const adminNotification = await prisma.notification.findFirst({
      where: {
        userId: adminUser.id,
        type: 'SLA_ESCALATION',
        link: `/dashboard/leads/${breachingLeadId}`,
      },
    });
    expect(adminNotification).not.toBeNull();
    expect(adminNotification?.title).toContain('SLA Escalation');
    expect(adminNotification?.message).toContain('SLA Test Team');
  });

  test('3. Deduplication: SLA check does not re-spam notifications within 24 hours', async () => {
    // Running again immediately should find the breach but send 0 new notifications
    const result = await checkAndEscalateSlaBreaches();
    expect(result.breachedCount).toBeGreaterThan(0);
    // notificationsSent for this lead should be 0 because recentNotification exists
    const duplicateNotifications = await prisma.notification.findMany({
      where: {
        userId: teamLeadUser.id,
        type: 'SLA_BREACH',
        link: `/dashboard/leads/${breachingLeadId}`,
      },
    });
    expect(duplicateNotifications.length).toBe(1); // Exactly 1, not duplicated!
  });

  test('4. API Route /api/sla/check dispatches and returns JSON summary', async () => {
    const adminToken = signToken({
      id: adminUser.id,
      name: adminUser.name,
      email: adminUser.email,
      role: 'ADMIN',
    });

    const req = new NextRequest('http://localhost:3000/api/sla/check', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    const res = await slaCheckRoute(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.breachedCount).toBeGreaterThan(0);
    expect(Array.isArray(body.breaches)).toBe(true);
  });

  test('5. CSV Export Utility generates valid RFC-4180 format with UTF-8 BOM', () => {
    interface TestItem {
      name: string;
      notes: string;
      price: number;
    }

    const testData: TestItem[] = [
      { name: 'John Doe', notes: 'Interested in "Villa", wants call', price: 15000000 },
      { name: 'Jane Smith', notes: 'Line 1\nLine 2', price: 8500000 },
    ];

    const columns: ExportColumn<TestItem>[] = [
      { header: 'Full Name', accessor: (d) => d.name },
      { header: 'Customer Notes', accessor: (d) => d.notes },
      { header: 'Amount (₹)', accessor: (d) => `₹${d.price.toLocaleString('en-IN')}` },
    ];

    const csv = generateCSV(testData, columns);

    // Verify UTF-8 BOM presence
    expect(csv.startsWith('\uFEFF')).toBe(true);

    // Verify header row
    expect(csv).toContain('"Full Name","Customer Notes","Amount (₹)"');

    // Verify quote escaping in CSV
    expect(csv).toContain('""Villa""');

    // Verify currency symbol preserved
    expect(csv).toContain('₹1,50,00,000');
  });
});
