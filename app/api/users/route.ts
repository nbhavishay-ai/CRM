import { NextRequest, NextResponse } from 'next/server';
import { getSession, hashPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logAudit } from '@/services/audit.service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const role = searchParams.get('role');
  const teamId = searchParams.get('teamId');

  const where: any = {};

  if (session.role === 'TEAM_LEAD') {
    // Team Lead sees members of their team
    const currentUser = await prisma.user.findUnique({ where: { id: session.id }, select: { teamId: true } });
    where.teamId = currentUser?.teamId || session.teamId || '__no_team__';
    // Team leads can assign work only to executives, never to another lead.
    where.role = 'EXECUTIVE';
  } else if (session.role === 'EXECUTIVE') {
    // Executive can only list peers in active list for collaboration or assignment reference
    where.active = true;
  }

  if (role) where.role = role;
  if (teamId && session.role === 'ADMIN') where.teamId = teamId;

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      phone: true,
      designation: true,
      department: true,
      dateOfJoining: true,
      baseSalary: true,
      emergencyContact: true,
      routingAvailable: true,
      teamId: true,
      team: { select: { id: true, name: true } },
      createdAt: true,
      lastLoginAt: true,
      _count: {
        select: {
          ownedLeads: { where: { currentCategory: 'ACTIVE' } },
          callLogs: true,
          createdMeetings: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  const safeUsers =
    session.role === 'ADMIN' || session.role === 'HR'
      ? users
      : users.map(({ baseSalary: _baseSalary, emergencyContact: _emergencyContact, ...safeUser }) => safeUser);

  return NextResponse.json(
    { users: safeUsers },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    }
  );
}

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session || (session.role !== 'ADMIN' && session.role !== 'HR')) {
    return NextResponse.json({ error: 'Forbidden: Admin or HR access required' }, { status: 403 });
  }

  try {
    const {
      name,
      email,
      password,
      role,
      teamId,
      phone,
      designation,
      department,
      baseSalary,
      emergencyContact,
      routingAvailable,
    } = await req.json();

    if (!name || !email || !password || !role) {
      return NextResponse.json({ error: 'Name, email, password, and role are required' }, { status: 400 });
    }
    if (password.trim().length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }
    if (!['ADMIN', 'HR', 'TEAM_LEAD', 'EXECUTIVE'].includes(role)) {
      return NextResponse.json({ error: 'Invalid user role' }, { status: 400 });
    }

    if (session.role === 'HR' && role !== 'EXECUTIVE' && role !== 'TEAM_LEAD') {
      return NextResponse.json(
        { error: 'Forbidden: HR is only authorized to create Sales Executives or Team Leads' },
        { status: 403 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (existing) {
      return NextResponse.json({ error: 'User with this email already exists' }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);

    const newUser = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase().trim(),
        passwordHash,
        role,
        teamId: teamId || null,
        phone: phone || null,
        designation: designation || null,
        department: department || (role === 'HR' ? 'Human Resources' : 'Sales'),
        baseSalary: baseSalary ? parseFloat(baseSalary) : null,
        emergencyContact: emergencyContact || null,
        routingAvailable: routingAvailable ?? true,
        active: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        teamId: true,
        phone: true,
        designation: true,
        department: true,
      },
    });

    await logAudit({
      actorId: session.id,
      action: 'CREATE_USER',
      entity: 'USER',
      entityId: newUser.id,
      metadata: { name: newUser.name, email: newUser.email, role: newUser.role },
    });

    return NextResponse.json({ user: newUser }, { status: 201 });
  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getSession(req);
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  try {
    const {
      id,
      name,
      email,
      password,
      role,
      teamId,
      phone,
      designation,
      department,
      baseSalary,
      emergencyContact,
      routingAvailable,
      active,
    } = await req.json();

    if (!id) return NextResponse.json({ error: 'User ID is required' }, { status: 400 });

    const dataToUpdate: any = {};
    if (name !== undefined) dataToUpdate.name = name;
    if (email !== undefined) dataToUpdate.email = email.toLowerCase().trim();
    if (role !== undefined) dataToUpdate.role = role;
    if (teamId !== undefined) dataToUpdate.teamId = teamId || null;
    if (phone !== undefined) dataToUpdate.phone = phone || null;
    if (designation !== undefined) dataToUpdate.designation = designation || null;
    if (department !== undefined) dataToUpdate.department = department || null;
    if (baseSalary !== undefined) dataToUpdate.baseSalary = baseSalary ? parseFloat(baseSalary) : null;
    if (emergencyContact !== undefined) dataToUpdate.emergencyContact = emergencyContact || null;
    if (routingAvailable !== undefined) dataToUpdate.routingAvailable = routingAvailable;
    if (active !== undefined) dataToUpdate.active = active;

    if (password && password.trim().length > 0) {
      if (password.trim().length < 6) {
        return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
      }
      dataToUpdate.passwordHash = await hashPassword(password.trim());
    }

    if (role !== undefined && !['ADMIN', 'HR', 'TEAM_LEAD', 'EXECUTIVE'].includes(role)) {
      return NextResponse.json({ error: 'Invalid user role' }, { status: 400 });
    }
    if (email !== undefined && !email.trim()) {
      return NextResponse.json({ error: 'Email cannot be empty' }, { status: 400 });
    }
    if (Object.keys(dataToUpdate).length === 0) {
      return NextResponse.json({ error: 'No user changes were provided' }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: dataToUpdate,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        teamId: true,
        phone: true,
        designation: true,
        department: true,
        baseSalary: true,
        emergencyContact: true,
        routingAvailable: true,
      },
    });

    await logAudit({
      actorId: session.id,
      action: 'UPDATE_USER',
      entity: 'USER',
      entityId: updated.id,
      metadata: { name: updated.name, role: updated.role, active: updated.active },
    });

    return NextResponse.json({ user: updated });
  } catch (error: any) {
    console.error('Update user error:', error);
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'User no longer exists. Refresh the user directory and try again.' }, { status: 404 });
    }
    return NextResponse.json({ error: error.message || 'Failed to update user' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession(req);
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden: Admin access required to delete users' }, { status: 403 });
  }

  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Body may be empty if passing query parameter
      body = {};
    }
    const { id, ids } = body;
    const queryId = req.nextUrl?.searchParams?.get('id');
    const requestedIds: string[] = Array.isArray(ids) ? ids : id ? [id] : queryId ? [queryId] : [];
    const targetIds = [...new Set(requestedIds.filter((userId): userId is string => typeof userId === 'string' && userId.trim().length > 0))];

    if (targetIds.length === 0) {
      return NextResponse.json({ error: 'User ID(s) required' }, { status: 400 });
    }

    // Safety constraint: Prevent current logged in admin from deleting self
    const safeIds = targetIds.filter((userId) => userId !== session.id);
    if (safeIds.length === 0) {
      return NextResponse.json({ error: 'Cannot delete your own active administrator account' }, { status: 400 });
    }

    const usersToDelete = await prisma.user.findMany({
      where: { id: { in: safeIds } },
      select: { id: true, name: true, email: true },
    });
    const existingIds = new Set(usersToDelete.map((user) => user.id));
    const missingIds = safeIds.filter((userId) => !existingIds.has(userId));
    if (missingIds.length > 0) {
      return NextResponse.json({ error: 'One or more selected users no longer exist. Refresh the user directory and try again.' }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Unassign user owned leads
      await tx.lead.updateMany({
        where: { currentOwnerId: { in: safeIds } },
        data: { currentOwnerId: null, isNewToMe: false },
      });

      // 2. Delete tasks assigned to or created by these users
      await tx.executiveTask.deleteMany({
        where: {
          OR: [
            { assigneeId: { in: safeIds } },
            { createdById: { in: safeIds } },
          ],
        },
      });

      // 3. Delete attendance, leaves, notifications, targets
      await tx.attendance.deleteMany({ where: { userId: { in: safeIds } } });
      await tx.leaveRequest.deleteMany({ where: { userId: { in: safeIds } } });
      await tx.notification.deleteMany({ where: { userId: { in: safeIds } } });
      await tx.salesTarget.deleteMany({ where: { userId: { in: safeIds } } });

      // 4. For foreign key restricted relations, preserve the history under the
      // deleting admin so the employee can be removed without losing CRM history.
      // reassign foreign key author to current admin so database integrity and history are preserved
      await tx.leadUpdate.updateMany({
        where: { userId: { in: safeIds } },
        data: { userId: session.id },
      });
      await tx.leadAssignment.updateMany({
        where: { performedById: { in: safeIds } },
        data: { performedById: session.id },
      });
      await tx.leadAssignment.updateMany({
        where: { previousOwnerId: { in: safeIds } },
        data: { previousOwnerId: null },
      });
      await tx.leadAssignment.updateMany({
        where: { newOwnerId: { in: safeIds } },
        data: { newOwnerId: null },
      });
      await tx.callLog.updateMany({
        where: { userId: { in: safeIds } },
        data: { userId: session.id },
      });
      await tx.leadStatusHistory.updateMany({
        where: { userId: { in: safeIds } },
        data: { userId: session.id },
      });
      await tx.leadFollowup.updateMany({
        where: { userId: { in: safeIds } },
        data: { userId: session.id },
      });
      await tx.meeting.updateMany({
        where: { createdById: { in: safeIds } },
        data: { createdById: session.id },
      });

      // 5. Delete the User records
      await tx.user.deleteMany({
        where: { id: { in: safeIds } },
      });
    });

    await logAudit({
      actorId: session.id,
      action: 'DELETE_USER',
      entity: 'USER',
      metadata: { deletedCount: safeIds.length, users: usersToDelete },
    });

    return NextResponse.json({
      success: true,
      deletedCount: safeIds.length,
      deletedUsers: usersToDelete,
    });
  } catch (error: any) {
    console.error('Delete user error:', error);
    if (error?.code === 'P2003') {
      return NextResponse.json({ error: 'This user still has linked records that could not be safely reassigned. Refresh and try again.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message || 'Failed to delete user(s)' }, { status: 500 });
  }
}
