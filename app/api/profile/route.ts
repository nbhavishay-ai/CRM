import { NextRequest, NextResponse } from 'next/server';
import { getSession, comparePassword, hashPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logAudit } from '@/services/audit.service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { id: session.id },
          ...(session.email ? [{ email: session.email.toLowerCase().trim() }] : []),
          ...(session.email ? [{ email: session.email.trim() }] : []),
        ],
      },
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
        emergencyContact: true,
        routingAvailable: true,
        teamId: true,
        team: {
          select: {
            id: true,
            name: true,
          },
        },
        leaveRequests: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            leaveType: true,
            startDate: true,
            endDate: true,
            daysCount: true,
            reason: true,
            status: true,
            reviewComment: true,
            createdAt: true,
          },
        },
        createdAt: true,
        lastLoginAt: true,
        _count: {
          select: {
            ownedLeads: true,
            createdMeetings: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    let effectiveTeam = user.team;
    let effectiveTeamId = user.teamId;

    // Self-healing: If user is TEAM_LEAD but teamId is null on user model, check team relations
    if (!effectiveTeamId && user.role === 'TEAM_LEAD') {
      const foundTeam = await prisma.team.findFirst({
        where: { members: { some: { id: user.id } } },
        select: { id: true, name: true },
      });
      if (foundTeam) {
        effectiveTeam = foundTeam;
        effectiveTeamId = foundTeam.id;
        await prisma.user.update({
          where: { id: user.id },
          data: { teamId: foundTeam.id },
        });
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let teamStats: any = null;
    if (user.role === 'TEAM_LEAD' && effectiveTeamId) {
      const [membersCount, activeLeadsCount, upcomingMeetingsCount] = await Promise.all([
        prisma.user.count({
          where: { teamId: effectiveTeamId, role: 'EXECUTIVE', active: true },
        }),
        prisma.lead.count({
          where: {
            currentCategory: 'ACTIVE',
            currentOwner: { teamId: effectiveTeamId },
          },
        }),
        prisma.meeting.count({
          where: {
            status: 'UPCOMING',
            createdBy: { teamId: effectiveTeamId },
          },
        }),
      ]);

      teamStats = {
        membersCount,
        activeLeadsCount,
        upcomingMeetingsCount,
      };
    }

    const fullUser = {
      ...user,
      teamId: effectiveTeamId,
      team: effectiveTeam,
      teamStats,
    };

    const res = NextResponse.json({ user: fullUser });

    // Self-healing: if session ID or teamId in cookie differs, update cookie
    if (
      session.id !== user.id ||
      session.teamId !== effectiveTeamId ||
      session.role !== user.role ||
      session.name !== user.name
    ) {
      const { signToken, AUTH_COOKIE_NAME } = await import('@/lib/auth');
      const token = signToken({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role as any,
        teamId: effectiveTeamId,
        teamName: effectiveTeam?.name || null,
      });
      res.cookies.set(AUTH_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      });
    }

    return res;
  } catch (error) {
    console.error('Fetch profile error:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      name,
      phone,
      emergencyContact,
      routingAvailable,
      currentPassword,
      newPassword,
    } = body;

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { id: session.id },
          ...(session.email ? [{ email: session.email.toLowerCase().trim() }] : []),
          ...(session.email ? [{ email: session.email.trim() }] : []),
        ],
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};

    if (name && typeof name === 'string' && name.trim()) {
      updateData.name = name.trim();
    }

    if (phone !== undefined) {
      updateData.phone = phone ? phone.trim() : null;
    }

    if (emergencyContact !== undefined) {
      updateData.emergencyContact = emergencyContact ? emergencyContact.trim() : null;
    }

    if (typeof routingAvailable === 'boolean') {
      updateData.routingAvailable = routingAvailable;
    }

    // Handle Password Change if requested
    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: 'Current password is required to set a new password' },
          { status: 400 }
        );
      }

      const isCurrentValid = await comparePassword(currentPassword, user.passwordHash);
      if (!isCurrentValid) {
        return NextResponse.json(
          { error: 'Incorrect current password provided' },
          { status: 400 }
        );
      }

      if (newPassword.length < 6) {
        return NextResponse.json(
          { error: 'New password must be at least 6 characters long' },
          { status: 400 }
        );
      }

      updateData.passwordHash = await hashPassword(newPassword);
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        designation: true,
        department: true,
        emergencyContact: true,
        routingAvailable: true,
        teamId: true,
        team: { select: { id: true, name: true } },
        updatedAt: true,
      },
    });

    await logAudit({
      actorId: user.id,
      action: newPassword ? 'CHANGE_PASSWORD' : 'UPDATE_PROFILE',
      entity: 'USER',
      entityId: user.id,
      metadata: {
        updatedFields: Object.keys(updateData).filter((k) => k !== 'passwordHash'),
        passwordChanged: Boolean(newPassword),
      },
    });

    const res = NextResponse.json({ success: true, user: updatedUser });

    // Self-healing: if session ID in cookie was from a previous seed or name changed, update cookie
    if (session.id !== user.id || (name && name.trim() !== session.name)) {
      const { signToken, AUTH_COOKIE_NAME } = await import('@/lib/auth');
      const token = signToken({
        id: user.id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role as any,
        teamId: updatedUser.teamId,
        teamName: updatedUser.team?.name || null,
      });
      res.cookies.set(AUTH_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      });
    }

    return res;
  } catch (error) {
    console.error('Update profile error:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
