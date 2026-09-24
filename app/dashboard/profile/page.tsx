import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import ProfileClient, { UserProfile } from './ProfileClient';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }

  let userProfile: UserProfile | null = null;

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

    if (user) {
      let effectiveTeam = user.team;
      let effectiveTeamId = user.teamId;

      // Self-heal: If user is TEAM_LEAD but teamId is null, look up team where user is member
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

      userProfile = {
        ...user,
        teamId: effectiveTeamId,
        team: effectiveTeam,
        teamStats,
        createdAt: user.createdAt ? user.createdAt.toISOString() : new Date().toISOString(),
        lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
        dateOfJoining: user.dateOfJoining ? user.dateOfJoining.toISOString() : null,
      };
    }
  } catch (error) {
    console.error('Error loading profile on server:', error);
  }

  return <ProfileClient initialProfile={userProfile} />;
}
