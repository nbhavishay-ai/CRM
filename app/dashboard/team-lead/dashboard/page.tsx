import React from 'react';
import Link from 'next/link';
import { TrendingUp, Users, Shield, AlertTriangle, UserRound, CheckCircle2, CalendarDays } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redirect } from 'next/navigation';
import { CALLING_SOURCE_PREFIX } from '@/lib/lead-pipeline';

export const dynamic = 'force-dynamic';

type DashboardView = 'team' | 'personal';

export default async function TeamLeadDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] | undefined }>;
}) {
  const session = await getSession();
  if (!session || (session.role !== 'TEAM_LEAD' && session.role !== 'ADMIN')) {
    redirect('/login');
  }
  const requestedView = (await searchParams).view;
  const view: DashboardView = requestedView === 'personal' || requestedView === 'own'
    ? 'personal'
    : 'team';

  // Self-heal: Fetch user from database to ensure fresh teamId and role
  const currentUser = await prisma.user.findFirst({
    where: {
      OR: [
        { id: session.id },
        ...(session.email ? [{ email: session.email.toLowerCase().trim() }] : []),
        ...(session.email ? [{ email: session.email.trim() }] : []),
      ],
    },
    include: { team: true },
  });

  let effectiveTeamId = currentUser?.teamId || session.teamId;

  // Fallback: If effectiveTeamId is still null, look up team where user is a member
  if (!effectiveTeamId && currentUser) {
    const userTeam = await prisma.team.findFirst({
      where: { members: { some: { id: currentUser.id } } },
    });
    if (userTeam) {
      effectiveTeamId = userTeam.id;
      await prisma.user.update({
        where: { id: currentUser.id },
        data: { teamId: userTeam.id },
      });
    }
  }

  // If Admin is inspecting team-lead dashboard without a direct team, fallback to first team
  if (!effectiveTeamId && session.role === 'ADMIN') {
    const firstTeam = await prisma.team.findFirst();
    if (firstTeam) effectiveTeamId = firstTeam.id;
  }

  // Fetch team details and members
  let team: any = null;
  let members: any[] = [];
  const slaResult = { checkedCount: 0, breachedCount: 0, notificationsSent: 0, breaches: [] as any[] };

  try {
    if (effectiveTeamId) {
      team = await prisma.team.findUnique({
        where: { id: effectiveTeamId },
        include: {
          members: {
            where: { active: true },
            include: {
              ownedLeads: {
                where: { source: { not: { startsWith: CALLING_SOURCE_PREFIX } } },
                select: {
                  id: true,
                  currentStatus: true,
                  currentCategory: true,
                  isNewToMe: true,
                  nextActionAt: true,
                },
              },
              createdMeetings: {
                where: { status: 'UPCOMING' },
                select: { id: true },
              },
            },
          },
        },
      });
      members = team?.members || [];
    }
  } catch (err) {
    console.error('Failed to query team lead team data:', err);
  }

  const now = new Date();

  const [unreadAlerts, recentAlerts] = await Promise.all([
    prisma.notification.count({
      where: { userId: session.id, read: false },
    }),
    prisma.notification.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { id: true, title: true, message: true, read: true, createdAt: true, link: true },
    }),
  ]);

  // Aggregate stats across team
  let totalTeamActiveLeads = 0;
  let totalTeamNew = 0;
  let totalTeamOverdue = 0;
  let totalTeamMeetings = 0;

  members.forEach((m) => {
    const owned = m.ownedLeads || [];
    const active = owned.filter((l: any) => l.currentCategory === 'ACTIVE');
    totalTeamActiveLeads += active.length;
    totalTeamNew += active.filter((l: any) => l.isNewToMe || l.currentStatus === 'NEW').length;
    totalTeamOverdue += active.filter(
      (l: any) => l.nextActionAt && new Date(l.nextActionAt) < now
    ).length;
    totalTeamMeetings += (m.createdMeetings || []).length;
  });

  const teamBreaches = (slaResult.breaches || []).filter(
    (b: any) => b.teamName === (team?.name || 'Company Direct')
  );

  const personalOwnerId = currentUser?.id || session.id;
  const personalStartOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const personalEndOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let personalLeads: any[] = [];
  let personalActiveLeads = 0;
  let personalNewLeads = 0;
  let personalOverdue = 0;
  let personalCompletedUpdates = 0;
  let personalMeetings = 0;

  if (view === 'personal') {
    try {
      const [ownedLeads, activeLeadCount, newLeadCount, overdueLeadCount, updates, meetings] = await Promise.all([
        prisma.lead.findMany({
          where: {
            currentOwnerId: personalOwnerId,
            currentCategory: 'ACTIVE',
            source: { not: { startsWith: CALLING_SOURCE_PREFIX } },
          },
          select: {
            id: true,
            leadNumber: true,
            clientName: true,
            currentStatus: true,
            source: true,
            nextAction: true,
            nextActionAt: true,
            isNewToMe: true,
          },
          orderBy: [{ nextActionAt: 'asc' }, { lastUpdatedAt: 'desc' }],
        }),
        prisma.lead.count({
          where: {
            currentOwnerId: personalOwnerId,
            currentCategory: 'ACTIVE',
            source: { not: { startsWith: CALLING_SOURCE_PREFIX } },
          },
        }),
        prisma.lead.count({
          where: {
            currentOwnerId: personalOwnerId,
            currentCategory: 'ACTIVE',
            source: { not: { startsWith: CALLING_SOURCE_PREFIX } },
            OR: [{ isNewToMe: true }, { currentStatus: 'NEW' }],
          },
        }),
        prisma.lead.count({
          where: {
            currentOwnerId: personalOwnerId,
            currentCategory: 'ACTIVE',
            source: { not: { startsWith: CALLING_SOURCE_PREFIX } },
            nextActionAt: { lt: now },
          },
        }),
        prisma.leadUpdate.count({
          where: {
            userId: personalOwnerId,
            createdAt: { gte: personalStartOfToday, lte: personalEndOfToday },
            disposition: 'LEAD',
          },
        }),
        prisma.meeting.count({
          where: {
            createdById: personalOwnerId,
            scheduledAt: { gte: personalStartOfToday },
            status: 'UPCOMING',
          },
        }),
      ]);

      personalLeads = ownedLeads;
      personalActiveLeads = activeLeadCount;
      personalNewLeads = newLeadCount;
      personalOverdue = overdueLeadCount;
      personalCompletedUpdates = updates;
      personalMeetings = meetings;
    } catch (err) {
      console.error('Failed to query personal team lead dashboard data:', err);
    }
  }

  const dashboardToggle = (
    <div className="inline-flex items-center rounded-lg border border-[#E5E5E0] bg-[#F8F8F6] p-1">
      <Link
        href="/dashboard/team-lead/dashboard?view=team"
        className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition ${
          view === 'team' ? 'bg-[#111314] text-[#F4F2EC] shadow-sm' : 'text-[#626560] hover:text-[#171817]'
        }`}
      >
        <Users className="inline-block w-3.5 h-3.5 mr-1 align-[-2px]" /> Team Dashboard
      </Link>
      <Link
        href="/dashboard/team-lead/dashboard?view=personal"
        className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition ${
          view === 'personal' ? 'bg-[#111314] text-[#F4F2EC] shadow-sm' : 'text-[#626560] hover:text-[#171817]'
        }`}
      >
        <UserRound className="inline-block w-3.5 h-3.5 mr-1 align-[-2px]" /> My Dashboard
      </Link>
    </div>
  );

  if (view === 'personal') {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E5E0]">
          <div>
            <h2 className="text-xl font-bold text-[#171817] flex items-center gap-2">
              <UserRound className="w-5 h-5 text-[#B69A63]" /> My Dashboard
            </h2>
            <p className="text-xs text-[#626560] mt-1">
              Your own leads, follow-ups, and activity
            </p>
          </div>
          {dashboardToggle}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'My Active Leads', value: personalActiveLeads, icon: UserRound },
            { label: 'New Leads', value: personalNewLeads, icon: TrendingUp },
            { label: 'Overdue Actions', value: personalOverdue, icon: AlertTriangle },
            { label: 'Updates Today', value: personalCompletedUpdates, icon: CheckCircle2 },
            { label: 'Upcoming Meetings', value: personalMeetings, icon: CalendarDays },
          ].map((metric) => {
            const Icon = metric.icon;
            return (
              <div key={metric.label} className="p-3.5 rounded-2xl bg-white border border-[#E5E5E0] shadow-xs">
                <Icon className="w-4 h-4 text-[#B69A63]" />
                <p className="text-[11px] text-[#626560] font-medium mt-2">{metric.label}</p>
                <p className="text-2xl font-black text-[#171817] mt-1">{metric.value}</p>
              </div>
            );
          })}
        </div>

        <div className="rounded-2xl bg-white border border-[#E5E5E0] p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-[#171817] uppercase tracking-wider">My Assigned Leads</h3>
            <Link
              href="/dashboard/team-lead/my-leads"
              className="text-xs text-[#171817] hover:text-[#B69A63] font-semibold"
            >
              Manage My Leads →
            </Link>
          </div>
          {personalLeads.length === 0 ? (
            <p className="text-xs text-[#90928E] py-4">No active leads are currently assigned to you.</p>
          ) : (
            <div className="divide-y divide-[#F0EFEB]">
              {personalLeads.map((lead) => (
                <Link
                  key={lead.id}
                  href={`/dashboard/leads/${lead.id}`}
                  className="flex items-center justify-between gap-3 py-3 hover:bg-[#F8F8F6] px-2 rounded-lg transition"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#171817] truncate">{lead.clientName}</p>
                    <p className="text-[11px] text-[#90928E]">{lead.leadNumber} · {lead.currentStatus}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[11px] font-semibold text-[#626560]">{lead.nextAction || 'Follow up'}</p>
                    {lead.nextActionAt && (
                      <p className={`text-[10px] ${new Date(lead.nextActionAt) < now ? 'text-[#8C332E]' : 'text-[#90928E]'}`}>
                        {new Date(lead.nextActionAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E5E0]">
        <div>
          <h2 className="text-xl font-bold text-[#171817] flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#B69A63]" /> Team Lead Dashboard
          </h2>
          <p className="text-xs text-[#626560] mt-1">
            Supervising: <strong className="text-[#171817]">{team?.name || 'Assigned Team'}</strong>
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {dashboardToggle}
          <Link
            href="/dashboard/team-lead/workflow"
            prefetch={true}
            className="px-4 py-2 rounded-lg bg-[#111314] hover:bg-[#1E2021] text-[#F4F2EC] border border-[#252829] font-semibold text-xs inline-flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
          >
            <TrendingUp className="w-4 h-4 text-[#D2BE91]" /> VIEW TEAM WORKFLOW
          </Link>
        </div>
      </div>

      {/* Aggregate Team Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-[#E5E5E0] shadow-xs">
          <span className="text-xs text-[#626560] font-medium">Team Active Leads</span>
          <p className="text-2xl font-black text-[#171817] mt-2">{totalTeamActiveLeads}</p>
          <p className="text-[11px] text-[#90928E] mt-1">Currently in executive pipelines</p>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-[#E5E5E0] shadow-xs">
          <span className="text-xs text-[#626560] font-medium">New / Unprocessed</span>
          <p className="text-2xl font-black text-[#7A5B28] mt-2">{totalTeamNew}</p>
          <p className="text-[11px] text-[#90928E] mt-1">New to executives</p>
        </div>

        <div className={`p-4 rounded-2xl bg-white border shadow-xs ${totalTeamOverdue > 0 ? 'border-rose-200 bg-[#FFF9F9]' : 'border-[#E5E5E0]'}`}>
          <span className={`text-xs font-bold ${totalTeamOverdue > 0 ? 'text-[#8C332E]' : 'text-[#171817]'}`}>Team Overdue Actions</span>
          <p className={`text-2xl font-black mt-2 ${totalTeamOverdue > 0 ? 'text-[#8C332E]' : 'text-[#171817]'}`}>{totalTeamOverdue}</p>
          <p className="text-[11px] text-[#90928E] mt-1">Require immediate supervision</p>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-[#E5E5E0] shadow-xs">
          <span className="text-xs text-[#626560] font-medium">Upcoming Meetings</span>
          <p className="text-2xl font-black text-[#171817] mt-2">{totalTeamMeetings}</p>
          <p className="text-[11px] text-[#90928E] mt-1">Scheduled by team members</p>
        </div>
      </div>

      {/* SLA Auto-Escalation Callout */}
      {teamBreaches.length > 0 && (
        <div className="p-5 rounded-2xl border border-rose-200 bg-[#FFF9F9] space-y-2 shadow-xs">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-[#8C332E] flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-[#8C332E]" />
              ⚡ Team SLA Inactivity Alert ({teamBreaches.length} Leads Breached Threshold)
            </h4>
            <span className="text-[11px] font-semibold text-[#8C332E]">
              Dual Notification Sent to Team Lead &amp; Admin
            </span>
          </div>
          <p className="text-xs text-[#8C332E]">
            The following leads have exceeded unattended SLA thresholds (e.g. &gt;2 hours uncontacted or &gt;24 hours dormant). Please intervene or reassign:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
            {teamBreaches.slice(0, 4).map((b) => (
              <div
                key={b.leadId}
                className="p-3 rounded-xl bg-white border border-rose-200 text-xs flex items-center justify-between shadow-2xs"
              >
                <div>
                  <span className="font-bold text-[#171817]">{b.clientName}</span>
                  <span className="text-[11px] text-[#90928E] ml-2">({b.leadNumber})</span>
                  <p className="text-[11px] text-[#8C332E] font-medium">{b.breachReason}</p>
                </div>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[#F8F8F6] text-[#171817] border border-[#E5E5E0]">
                  {b.ownerName}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team Members Quick Grid */}
      <div className="rounded-2xl bg-white border border-[#E5E5E0] p-5 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-[#171817] uppercase tracking-wider flex items-center gap-2">
            <Users className="w-4 h-4 text-[#B69A63]" /> Supervised Executives ({members.length})
          </h3>
          <Link
            href="/dashboard/team-lead/workflow"
            prefetch={true}
            className="text-xs text-[#171817] hover:text-[#B69A63] font-semibold"
          >
            Inspect Detailed Workflows →
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {members.map((m: any) => {
            const owned = m.ownedLeads || [];
            const activeLeads = owned.filter((l: any) => l.currentCategory === 'ACTIVE');
            const overdue = activeLeads.filter(
              (l: any) => l.nextActionAt && new Date(l.nextActionAt) < now
            ).length;

            return (
              <div
                key={m.id}
                className="p-4 rounded-xl bg-[#F8F8F6] border border-[#E5E5E0] flex flex-col justify-between space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#171817] text-xs">{m.name}</span>
                  {overdue > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FDF2F0] text-[#8C332E] border border-[#F1C7C5]">
                      {overdue} Overdue
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs text-[#626560]">
                  <span>{activeLeads.length} Active Leads</span>
                  <span>{(m.createdMeetings || []).length} Meetings</span>
                </div>

                <Link
                  href={`/dashboard/team-lead/member/${m.id}`}
                  prefetch={true}
                  className="w-full text-center py-1.5 rounded-lg bg-white hover:bg-[#F0EFEB] text-[11px] font-semibold text-[#171817] border border-[#E5E5E0] transition shadow-2xs"
                >
                  Inspect Member Workspace
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
