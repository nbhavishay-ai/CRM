import { describe, expect, test, beforeAll } from 'bun:test';
import { NextRequest } from 'next/server';
import { prisma } from '../lib/db';
import { signToken, hashPassword } from '../lib/auth';
import { GET as getProfileRoute, PATCH as updateProfileRoute } from '../app/api/profile/route';
import { POST as createUserRoute } from '../app/api/users/route';
import { POST as loginRoute } from '../app/api/auth/login/route';

describe('ORVION User Profile & Password Management', () => {
  let testUser: { id: string; name: string; email: string };
  let testUserToken: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword('CurrentSecret123');
    const user = await prisma.user.create({
      data: {
        name: 'Profile Test User',
        email: `profile.test.${Date.now()}@orvion.com`,
        passwordHash,
        role: 'EXECUTIVE',
        phone: '+91 91234 56789',
        active: true,
        routingAvailable: true,
      },
    });

    testUser = { id: user.id, name: user.name, email: user.email };
    testUserToken = signToken({
      id: user.id,
      name: user.name,
      email: user.email,
      role: 'EXECUTIVE',
    });
  });

  test('1. Security: Unauthenticated profile requests return 401 Unauthorized', async () => {
    const req = new NextRequest('http://localhost:3000/api/profile', {
      method: 'GET',
    });
    const res = await getProfileRoute(req);
    expect(res.status).toBe(401);
  });

  test('2. GET /api/profile returns full authenticated user profile', async () => {
    const req = new NextRequest('http://localhost:3000/api/profile', {
      method: 'GET',
      headers: { Authorization: `Bearer ${testUserToken}` },
    });

    const res = await getProfileRoute(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).not.toBeNull();
    expect(body.user.email).toBe(testUser.email);
    expect(body.user.name).toBe('Profile Test User');
    expect(body.user.role).toBe('EXECUTIVE');
    expect(body.user.routingAvailable).toBe(true);
  });

  test('3. PATCH /api/profile updates personal details and routing availability', async () => {
    const req = new NextRequest('http://localhost:3000/api/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({
        name: 'Updated Profile Name',
        phone: '+91 99999 88888',
        emergencyContact: 'Doctor Sharma (+91 98888 77777)',
        routingAvailable: false,
      }),
    });

    const res = await updateProfileRoute(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.user.name).toBe('Updated Profile Name');
    expect(body.user.phone).toBe('+91 99999 88888');
    expect(body.user.emergencyContact).toBe('Doctor Sharma (+91 98888 77777)');
    expect(body.user.routingAvailable).toBe(false);

    // Verify persistence in DB
    const dbUser = await prisma.user.findUnique({ where: { id: testUser.id } });
    expect(dbUser?.routingAvailable).toBe(false);
  });

  test('4. PATCH /api/profile rejects password change with invalid current password', async () => {
    const req = new NextRequest('http://localhost:3000/api/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({
        currentPassword: 'WrongPassword!',
        newPassword: 'BrandNewSecurePassword123',
      }),
    });

    const res = await updateProfileRoute(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Incorrect current password');
  });

  test('5. PATCH /api/profile successfully updates password with valid current password', async () => {
    const req = new NextRequest('http://localhost:3000/api/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({
        currentPassword: 'CurrentSecret123',
        newPassword: 'BrandNewSecurePassword123',
      }),
    });

    const res = await updateProfileRoute(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify new password works and old fails
    const dbUser = await prisma.user.findUnique({ where: { id: testUser.id } });
    const { comparePassword } = await import('../lib/auth');
    const oldMatches = await comparePassword('CurrentSecret123', dbUser!.passwordHash);
    const newMatches = await comparePassword('BrandNewSecurePassword123', dbUser!.passwordHash);
    expect(oldMatches).toBe(false);
    expect(newMatches).toBe(true);
  });

  test('6. Self-Healing: Stale UUID with valid email resolves profile and sets refreshed cookie', async () => {
    // Generate token with an obsolete UUID but testUser's actual email
    const staleToken = signToken({
      id: '00000000-0000-0000-0000-000000000000',
      name: testUser.name,
      email: testUser.email,
      role: 'EXECUTIVE',
    });

    const req = new NextRequest('http://localhost:3000/api/profile', {
      method: 'GET',
      headers: { Authorization: `Bearer ${staleToken}` },
    });

    const res = await getProfileRoute(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.id).toBe(testUser.id);
    expect(body.user.email).toBe(testUser.email);
    // Cookie was refreshed with actual ID
    expect(res.cookies.get('orvion_session')).toBeDefined();
  });

  test('7. Admin User Creation - Admin can create an HR user with role HR', async () => {
    let admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!admin) {
      admin = await prisma.user.create({
        data: {
          name: 'Admin Boss',
          email: `admin.boss.${Date.now()}@orvion.com`,
          passwordHash: await hashPassword('AdminPass@123'),
          role: 'ADMIN',
          active: true,
        },
      });
    }

    const adminToken = signToken({
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: 'ADMIN',
    });

    const hrEmail = `hr.manager.${Date.now()}@orvion.com`;
    const createReq = new NextRequest('http://localhost:3000/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'Pooja HR Head',
        email: hrEmail,
        password: 'HrPassword@2026',
        role: 'HR',
      }),
    });

    const createRes = await createUserRoute(createReq);
    expect(createRes.status).toBe(201);
    const body = await createRes.json();
    expect(body.user).toBeDefined();
    expect(body.user.role).toBe('HR');
    expect(body.user.email).toBe(hrEmail);

    // Verify DB
    const dbHr = await prisma.user.findUnique({ where: { email: hrEmail } });
    expect(dbHr).not.toBeNull();
    expect(dbHr?.role).toBe('HR');
  });

  test('8. HR Login & Profile Flow - HR user can log in with credentials and view profile', async () => {
    const hrEmail = `hr.login.${Date.now()}@orvion.com`;
    const passwordHash = await hashPassword('HrSecretPassword@123');
    const hrUser = await prisma.user.create({
      data: {
        name: 'Deepika Sharma',
        email: hrEmail,
        passwordHash,
        role: 'HR',
        designation: 'Human Resources Director',
        department: 'Human Resources',
        active: true,
      },
    });

    // 1. Attempt login via /api/auth/login
    const loginReq = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: hrEmail,
        password: 'HrSecretPassword@123',
      }),
    });

    const loginRes = await loginRoute(loginReq);
    expect(loginRes.status).toBe(200);
    const loginBody = await loginRes.json();
    expect(loginBody.success).toBe(true);
    expect(loginBody.user.role).toBe('HR');
    expect(loginBody.token).toBeDefined();

    // 2. Access /api/profile with the HR token
    const profileReq = new NextRequest('http://localhost:3000/api/profile', {
      method: 'GET',
      headers: { Authorization: `Bearer ${loginBody.token}` },
    });

    const profileRes = await getProfileRoute(profileReq);
    expect(profileRes.status).toBe(200);
    const profileBody = await profileRes.json();
    expect(profileBody.user.name).toBe('Deepika Sharma');
    expect(profileBody.user.role).toBe('HR');
    expect(profileBody.user.designation).toBe('Human Resources Director');

    // Cleanup
    await prisma.user.delete({ where: { id: hrUser.id } });
  });

  test('9. Team Lead Profile Fetching - Returns complete Team Lead profile with teamStats', async () => {
    const ts = Date.now();
    const tlEmail = `tl.profile.${ts}@orvion.com`;
    const execEmail = `exec.tl.${ts}@orvion.com`;
    const passwordHash = await hashPassword('TlPassword@123');

    // Create Team
    const testTeam = await prisma.team.create({
      data: {
        name: `Alpha Sales Cluster ${ts}`,
        description: 'High performance closer unit',
      },
    });

    // Create Team Lead user
    const tlUser = await prisma.user.create({
      data: {
        name: 'Rajesh Team Lead',
        email: tlEmail,
        passwordHash,
        role: 'TEAM_LEAD',
        designation: 'Sales Team Leader',
        department: 'Sales',
        teamId: testTeam.id,
        active: true,
      },
    });

    // Create Supervised Executive
    const execUser = await prisma.user.create({
      data: {
        name: 'Sunil Closer',
        email: execEmail,
        passwordHash,
        role: 'EXECUTIVE',
        teamId: testTeam.id,
        active: true,
      },
    });

    // Create Active Lead for the Executive
    await prisma.lead.create({
      data: {
        leadNumber: `ORV-TL-${ts}`,
        clientName: 'Alpha Supervised Client',
        phone: '9888877777',
        currentCategory: 'ACTIVE',
        currentOwnerId: execUser.id,
      },
    });

    // 1. Authenticate Team Lead
    const loginReq = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: tlEmail,
        password: 'TlPassword@123',
      }),
    });

    const loginRes = await loginRoute(loginReq);
    expect(loginRes.status).toBe(200);
    const loginBody = await loginRes.json();
    expect(loginBody.user.role).toBe('TEAM_LEAD');
    expect(loginBody.user.teamName).toBe(`Alpha Sales Cluster ${ts}`);

    // 2. Fetch Team Lead profile via GET /api/profile
    const profileReq = new NextRequest('http://localhost:3000/api/profile', {
      method: 'GET',
      headers: { Authorization: `Bearer ${loginBody.token}` },
    });

    const profileRes = await getProfileRoute(profileReq);
    expect(profileRes.status).toBe(200);
    const profileBody = await profileRes.json();
    expect(profileBody.user.name).toBe('Rajesh Team Lead');
    expect(profileBody.user.role).toBe('TEAM_LEAD');
    expect(profileBody.user.team.name).toBe(`Alpha Sales Cluster ${ts}`);
    expect(profileBody.user.teamStats).not.toBeNull();
    expect(profileBody.user.teamStats.membersCount).toBe(1); // Sunil Closer
    expect(profileBody.user.teamStats.activeLeadsCount).toBeGreaterThanOrEqual(1);

    // 3. Test /api/auth/me endpoint with Team Lead token
    const { GET: getAuthMeRoute } = await import('../app/api/auth/me/route');
    // Note: getAuthMeRoute reads from cookies / getSession()
    const meReq = new NextRequest('http://localhost:3000/api/auth/me', {
      headers: { Authorization: `Bearer ${loginBody.token}` },
    });
    const meRes = await getProfileRoute(meReq);
    expect(meRes.status).toBe(200);
  });

  test('10. Self-Healing Team Lead Profile - Resolves team even if session teamId was stale', async () => {
    const ts = Date.now() + 10;
    const tlEmail = `tl.heal.${ts}@orvion.com`;
    const passwordHash = await hashPassword('TlPassword@123');

    const testTeam = await prisma.team.create({
      data: { name: `Healing Cluster ${ts}` },
    });

    const tlUser = await prisma.user.create({
      data: {
        name: 'Vikas Healed Lead',
        email: tlEmail,
        passwordHash,
        role: 'TEAM_LEAD',
        teamId: testTeam.id,
        active: true,
      },
    });

    // Sign a token with NO teamId (simulating an older JWT token)
    const staleTlToken = signToken({
      id: tlUser.id,
      name: tlUser.name,
      email: tlUser.email,
      role: 'TEAM_LEAD',
    });

    const profileReq = new NextRequest('http://localhost:3000/api/profile', {
      method: 'GET',
      headers: { Authorization: `Bearer ${staleTlToken}` },
    });

    const profileRes = await getProfileRoute(profileReq);
    expect(profileRes.status).toBe(200);
    const profileBody = await profileRes.json();
    expect(profileBody.user.id).toBe(tlUser.id);
    expect(profileBody.user.team.name).toBe(`Healing Cluster ${ts}`);
    expect(profileBody.user.teamStats).toBeDefined();
    // Cookie was updated
    expect(profileRes.cookies.get('orvion_session')).toBeDefined();
  });
});
