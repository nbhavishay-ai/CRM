import { describe, expect, test, beforeAll } from 'bun:test';
import { NextRequest } from 'next/server';
import { prisma } from '../lib/db';
import { signToken } from '../lib/auth';
import { POST as createTeamRoute } from '../app/api/teams/route';
import { PATCH as updateMembersRoute, POST as addMemberRoute } from '../app/api/teams/[id]/members/route';

describe('ORVION Team Management (Team Leads & Executive Assignments)', () => {
  let adminUser: { id: string; name: string };
  let testExec1: { id: string; name: string };
  let testExec2: { id: string; name: string };
  let testLeadUser: { id: string; name: string };
  let createdTeamId: string;

  beforeAll(async () => {
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    adminUser = { id: admin!.id, name: admin!.name };

    // Create temporary test users for clean test isolation
    testLeadUser = await prisma.user.create({
      data: {
        name: 'Test Lead Prospect',
        email: `test.lead.${Date.now()}@orvion.com`,
        passwordHash: 'dummy',
        role: 'EXECUTIVE',
        active: true,
      },
    });

    testExec1 = await prisma.user.create({
      data: {
        name: 'Test Exec Alpha',
        email: `test.exec1.${Date.now()}@orvion.com`,
        passwordHash: 'dummy',
        role: 'EXECUTIVE',
        active: true,
      },
    });

    testExec2 = await prisma.user.create({
      data: {
        name: 'Test Exec Beta',
        email: `test.exec2.${Date.now()}@orvion.com`,
        passwordHash: 'dummy',
        role: 'EXECUTIVE',
        active: true,
      },
    });
  });

  test('1. Create team with initial Team Lead and Executive members', async () => {
    const team = await prisma.$transaction(async (tx) => {
      const created = await tx.team.create({
        data: {
          name: `Delta Corridors ${Date.now()}`,
          description: 'Specialized enterprise corridor test team',
        },
      });

      createdTeamId = created.id;

      // Assign Team Lead
      await tx.user.update({
        where: { id: testLeadUser.id },
        data: {
          teamId: created.id,
          role: 'TEAM_LEAD',
        },
      });

      // Assign initial executive
      await tx.user.update({
        where: { id: testExec1.id },
        data: {
          teamId: created.id,
        },
      });

      return tx.team.findUnique({
        where: { id: created.id },
        include: { members: true },
      });
    });

    expect(team).not.toBeNull();
    expect(team!.members.length).toBe(2);

    const lead = team!.members.find((m) => m.id === testLeadUser.id);
    expect(lead?.role).toBe('TEAM_LEAD');
    expect(lead?.teamId).toBe(createdTeamId);

    const exec = team!.members.find((m) => m.id === testExec1.id);
    expect(exec?.role).toBe('EXECUTIVE');
    expect(exec?.teamId).toBe(createdTeamId);
  });

  test('2. Add an additional executive to existing team', async () => {
    // Add testExec2 to this specific team
    await prisma.user.update({
      where: { id: testExec2.id },
      data: { teamId: createdTeamId },
    });

    const members = await prisma.user.findMany({ where: { teamId: createdTeamId } });
    expect(members.length).toBe(3);
    const added = members.find((m) => m.id === testExec2.id);
    expect(added).not.toBeUndefined();
    expect(added?.teamId).toBe(createdTeamId);
  });

  test('3. Reassign / Change Team Lead in existing team', async () => {
    // Promote testExec1 to Team Lead and demote testLeadUser to EXECUTIVE
    await prisma.$transaction(async (tx) => {
      await tx.user.updateMany({
        where: { teamId: createdTeamId, role: 'TEAM_LEAD' },
        data: { role: 'EXECUTIVE' },
      });
      await tx.user.update({
        where: { id: testExec1.id },
        data: { role: 'TEAM_LEAD' },
      });
    });

    const updatedLead = await prisma.user.findUnique({ where: { id: testExec1.id } });
    expect(updatedLead?.role).toBe('TEAM_LEAD');

    const previousLead = await prisma.user.findUnique({ where: { id: testLeadUser.id } });
    expect(previousLead?.role).toBe('EXECUTIVE');
  });

  test('4. Remove executive member from team', async () => {
    // Remove testExec2 from team
    await prisma.user.update({
      where: { id: testExec2.id },
      data: { teamId: null },
    });

    const removed = await prisma.user.findUnique({ where: { id: testExec2.id } });
    expect(removed?.teamId).toBeNull();

    const remainingMembers = await prisma.user.findMany({ where: { teamId: createdTeamId } });
    expect(remainingMembers.length).toBe(2);
  });

  test('5. Enforce Rule: An active Team Lead cannot lead a second team (POST /api/teams)', async () => {
    // testExec1 is currently TEAM_LEAD of createdTeamId
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    const adminToken = signToken({
      id: admin!.id,
      name: admin!.name,
      email: admin!.email,
      role: 'ADMIN',
    });

    const req = new NextRequest('http://localhost:3000/api/teams', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: `Illegal Second Team ${Date.now()}`,
        description: 'Should be rejected because testExec1 already leads a team',
        teamLeadId: testExec1.id,
      }),
    });

    const res = await createTeamRoute(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('is already the Team Lead of');
    expect(body.error).toContain('Each Team Lead can only lead 1 team');
  });

  test('6. Enforce Rule: An active Team Lead cannot be reassigned to lead another team via PATCH', async () => {
    // Create an unassigned second team first
    const secondTeam = await prisma.team.create({
      data: {
        name: `Epsilon Group ${Date.now()}`,
        description: 'Second standalone team',
      },
    });

    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    const adminToken = signToken({
      id: admin!.id,
      name: admin!.name,
      email: admin!.email,
      role: 'ADMIN',
    });

    // Try to assign testExec1 (already leading createdTeamId) as lead of secondTeam
    const req = new NextRequest(`http://localhost:3000/api/teams/${secondTeam.id}/members`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        teamLeadId: testExec1.id,
      }),
    });

    const params = Promise.resolve({ id: secondTeam.id });
    const res = await updateMembersRoute(req, { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('is already the Team Lead of');
    expect(body.error).toContain('Each Team Lead can only lead 1 team');
  });

  test('7. Enforce Rule: An active Team Lead cannot be added as executive to another team', async () => {
    const secondTeam = await prisma.team.findFirst({
      where: { name: { startsWith: 'Epsilon Group' } },
    });

    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    const adminToken = signToken({
      id: admin!.id,
      name: admin!.name,
      email: admin!.email,
      role: 'ADMIN',
    });

    // Try to add testExec1 (who leads createdTeamId) into secondTeam
    const req = new NextRequest(`http://localhost:3000/api/teams/${secondTeam!.id}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        userId: testExec1.id,
      }),
    });

    const params = Promise.resolve({ id: secondTeam!.id });
    const res = await addMemberRoute(req, { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('is already the Team Lead of');
    expect(body.error).toContain('Each Team Lead can only lead 1 team');
  });
});

