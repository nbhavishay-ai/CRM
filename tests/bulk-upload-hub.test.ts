import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { prisma } from '@/lib/db';
import { processBulkLeadsImport, processBulkCallingImport } from '@/services/import.service';

describe('ORVION Bulk Upload Hub & CSV Processing Engine', () => {
  let testAdmin: { id: string; name: string; role: any };
  let testTeamLead: { id: string; name: string; role: any };
  let testExecutive1: { id: string; name: string; role: any };
  let testExecutive2: { id: string; name: string; role: any };
  let testTeam: { id: string; name: string };

  const cleanup = async () => {
    await prisma.leadUpdate.deleteMany({ where: { remark: { contains: 'test-bulk' } } });
    await prisma.leadAssignment.deleteMany({ where: { reason: { contains: 'test-bulk' } } });
    await prisma.lead.deleteMany({ where: { clientName: { contains: 'Test Bulk' } } });
    await prisma.team.deleteMany({ where: { name: { contains: 'Bulk Test Pod' } } });
    await prisma.user.deleteMany({ where: { email: { contains: 'testbulk' } } });
  };

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    await cleanup();

    // Setup authentic users
    testAdmin = await prisma.user.create({
      data: {
        name: 'Bulk Admin',
        email: 'testbulk.admin@orvion.com',
        passwordHash: 'hash',
        role: 'ADMIN',
        active: true,
      },
      select: { id: true, name: true, role: true },
    });

    testTeam = await prisma.team.create({
      data: {
        name: 'Bulk Test Pod Alpha',
        description: 'Testing bulk assignment',
      },
      select: { id: true, name: true },
    });

    testTeamLead = await prisma.user.create({
      data: {
        name: 'Bulk TL Vikram',
        email: 'testbulk.tl@orvion.com',
        passwordHash: 'hash',
        role: 'TEAM_LEAD',
        teamId: testTeam.id,
        active: true,
      },
      select: { id: true, name: true, role: true },
    });

    testExecutive1 = await prisma.user.create({
      data: {
        name: 'Bulk Exec Rohan',
        email: 'testbulk.exec1@orvion.com',
        passwordHash: 'hash',
        role: 'EXECUTIVE',
        teamId: testTeam.id,
        active: true,
        routingAvailable: true,
      },
      select: { id: true, name: true, role: true },
    });

    testExecutive2 = await prisma.user.create({
      data: {
        name: 'Bulk Exec Sneha',
        email: 'testbulk.exec2@orvion.com',
        passwordHash: 'hash',
        role: 'EXECUTIVE',
        teamId: testTeam.id,
        active: true,
        routingAvailable: true,
      },
      select: { id: true, name: true, role: true },
    });
  });

  it('1. Bulk Leads Import: Creates new leads with sequential ORV IDs and UNASSIGNED pool', async () => {
    const rows = [
      {
        clientName: 'Test Bulk Client 1',
        phone: '+91 99000 11111',
        email: 'client1@test.com',
        company: 'Test Company 1',
        location: 'Ahmedabad',
        source: 'Bulk Expo',
        notes: 'test-bulk interested in commercial land',
      },
      {
        clientName: 'Test Bulk Client 2',
        phone: '+91 99000 22222',
        email: 'client2@test.com',
        company: 'Test Company 2',
        location: 'Dholera',
        source: 'Bulk Google Ads',
        notes: 'test-bulk requested brochure',
      },
    ];

    const result = await processBulkLeadsImport({
      rows,
      assignmentMode: 'UNASSIGNED',
      duplicateStrategy: 'SKIP',
      user: testAdmin,
    });

    expect(result.totalRows).toBe(2);
    expect(result.createdCount).toBe(2);
    expect(result.updatedCount).toBe(0);
    expect(result.skippedCount).toBe(0);

    const createdLeads = await prisma.lead.findMany({
      where: { clientName: { contains: 'Test Bulk Client' } },
      orderBy: { createdAt: 'asc' },
    });

    expect(createdLeads.length).toBe(2);
    expect(createdLeads[0].leadNumber).toMatch(/^ORV-\d{6}$/);
    expect(createdLeads[1].leadNumber).toMatch(/^ORV-\d{6}$/);
    expect(createdLeads[0].currentOwnerId).toBeNull();
    expect(createdLeads[1].currentOwnerId).toBeNull();
  });

  it('2. Bulk Leads Import: Round-robin distribution across team executives', async () => {
    const rows = [
      { clientName: 'Test Bulk RR 1', phone: '+91 99000 33331', notes: 'test-bulk' },
      { clientName: 'Test Bulk RR 2', phone: '+91 99000 33332', notes: 'test-bulk' },
      { clientName: 'Test Bulk RR 3', phone: '+91 99000 33333', notes: 'test-bulk' },
      { clientName: 'Test Bulk RR 4', phone: '+91 99000 33334', notes: 'test-bulk' },
    ];

    const result = await processBulkLeadsImport({
      rows,
      assignmentMode: 'ROUND_ROBIN_TEAM',
      targetTeamId: testTeam.id,
      duplicateStrategy: 'SKIP',
      user: testAdmin,
    });

    expect(result.totalRows).toBe(4);
    expect(result.createdCount).toBe(4);

    const exec1Leads = await prisma.lead.count({
      where: { currentOwnerId: testExecutive1.id, clientName: { contains: 'Test Bulk RR' } },
    });
    const exec2Leads = await prisma.lead.count({
      where: { currentOwnerId: testExecutive2.id, clientName: { contains: 'Test Bulk RR' } },
    });

    expect(exec1Leads).toBe(2);
    expect(exec2Leads).toBe(2);
  });

  it('3. Duplicate Phone Collision Handling: SKIP vs UPDATE policy', async () => {
    // First: Create initial lead
    await processBulkLeadsImport({
      rows: [
        {
          clientName: 'Test Bulk Original',
          phone: '+91 99000 44444',
          company: 'Original Inc',
          location: 'Delhi',
          notes: 'test-bulk original note',
        },
      ],
      assignmentMode: 'UNASSIGNED',
      duplicateStrategy: 'SKIP',
      user: testAdmin,
    });

    // Test SKIP duplicate
    const skipResult = await processBulkLeadsImport({
      rows: [
        {
          clientName: 'Test Bulk Duplicate Attempt',
          phone: '+91 99000 44444',
          company: 'New Company',
          notes: 'test-bulk duplicate skipped',
        },
      ],
      assignmentMode: 'UNASSIGNED',
      duplicateStrategy: 'SKIP',
      user: testAdmin,
    });

    expect(skipResult.skippedCount).toBe(1);
    expect(skipResult.createdCount).toBe(0);
    expect(skipResult.updatedCount).toBe(0);

    // Test UPDATE duplicate
    const updateResult = await processBulkLeadsImport({
      rows: [
        {
          clientName: 'Test Bulk Updated',
          phone: '+91 99000 44444',
          company: 'Updated Enterprise Ltd',
          location: 'Mumbai',
          notes: 'test-bulk updated info',
        },
      ],
      assignmentMode: 'UNASSIGNED',
      duplicateStrategy: 'UPDATE',
      user: testAdmin,
    });

    expect(updateResult.updatedCount).toBe(1);
    expect(updateResult.createdCount).toBe(0);

    const refreshed = await prisma.lead.findFirst({
      where: { phone: { contains: '9900044444' } },
    });
    expect(refreshed?.company).toBe('Updated Enterprise Ltd');
    expect(refreshed?.location).toBe('Mumbai');
  });

  it('4. Bulk Calling Dispatch: Ingests batch, assigns to executive, sets call schedule', async () => {
    const rows = [
      {
        clientName: 'Test Bulk Call 1',
        phone: '+91 99000 55551',
        campaign: 'Expressway Campaign Q3',
        callDate: '2026-09-20',
        callTime: '02:30 PM',
        priority: 'HIGH',
        scriptNotes: 'test-bulk follow up on site tour inquiry',
      },
      {
        clientName: 'Test Bulk Call 2',
        phone: '+91 99000 55552',
        campaign: 'Expressway Campaign Q3',
        callDate: '2026-09-20',
        callTime: '04:00 PM',
        priority: 'NORMAL',
        scriptNotes: 'test-bulk send master plan PDF',
      },
    ];

    const result = await processBulkCallingImport({
      rows,
      assignmentMode: 'SPECIFIC_USER',
      targetUserId: testExecutive1.id,
      defaultCallDate: '2026-09-20',
      defaultCallTime: '11:00 AM',
      campaignName: 'Expressway Campaign Q3',
      user: testAdmin,
    });

    expect(result.scheduledCount).toBe(2);
    expect(result.createdCount).toBe(2);

    const callLogs = await prisma.leadUpdate.findMany({
      where: { remark: { contains: 'test-bulk' } },
    });
    expect(callLogs.length).toBeGreaterThanOrEqual(2);
  });
});
