import React from 'react';
import Link from 'next/link';
import { TrendingUp, AlertTriangle, ArrowRight } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function TeamWorkflowPage() {
  const session = await getSession();
  if (!session || (session.role !== 'TEAM_LEAD' && session.role !== 'ADMIN')) {
    redirect('/login');
  }

  // Fetch members of the team with deep counts
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  // Self-heal: Fetch user from database to ensure fresh teamId
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
  if (!effectiveTeamId && currentUser) {
    const userTeam = await prisma.team.findFirst({
      where: { members: { some: { id: currentUser.id } } },
    });
    if (userTeam) {
      effectiveTeamId = userTeam.id;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userWhere: any = { role: 'EXECUTIVE', active: true };
  if (session.role === 'TEAM_LEAD') {
    userWhere.teamId = effectiveTeamId || '__no_team__';
  }

  const executives = await prisma.user.findMany({
    where: userWhere,
    include: {
      team: { select: { name: true } },
      ownedLeads: {
        where: { currentCategory: 'ACTIVE' },
        select: {
          id: true,
          currentStatus: true,
          isNewToMe: true,
          nextActionAt: true,
        },
      },
      createdMeetings: {
        where: {
          scheduledAt: { gte: startOfWeek, lte: endOfWeek },
        },
        select: { id: true },
      },
    },
    orderBy: { name: 'asc' },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-[#E5E5E0]">
        <h2 className="text-xl font-bold text-[#171817] flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-[#B69A63]" /> Team Workflow &amp; Accountability
        </h2>
        <p className="text-xs text-[#626560] mt-1">
          Detailed operational workload per executive. Supervise active pipelines, overdue tasks, and client touchpoints.
        </p>
      </div>

      {/* Member Workload Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {executives.map((exec) => {
          const totalActive = exec.ownedLeads.length;
          const newLeads = exec.ownedLeads.filter(
            (l) => l.isNewToMe || l.currentStatus === 'NEW'
          ).length;
          const followups = exec.ownedLeads.filter((l) => l.currentStatus === 'FOLLOW_UP').length;
          const overdue = exec.ownedLeads.filter(
            (l) => l.nextActionAt && new Date(l.nextActionAt) < now
          ).length;
          const meetingsCount = exec.createdMeetings.length;

          return (
            <div
              key={exec.id}
              className="rounded-2xl bg-white border border-[#E5E5E0] hover:border-[#B69A63] p-5 flex flex-col justify-between space-y-4 shadow-xs transition-all group"
            >
              {/* Member Title */}
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-[#111314] border border-[#252829] text-[#D2BE91] font-extrabold flex items-center justify-center text-sm shadow-xs">
                    {exec.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#171817] group-hover:text-[#B69A63] transition-colors">
                      {exec.name}
                    </h3>
                    <p className="text-[11px] text-[#626560]">
                      {exec.team?.name || 'Executive Staff'}
                    </p>
                  </div>
                </div>

                {overdue > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FDF2F0] text-[#8C332E] border border-[#F1C7C5]">
                    <AlertTriangle className="w-3 h-3 text-[#8C332E]" /> {overdue} Overdue
                  </span>
                )}
              </div>

              {/* Exact Metrics */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-[#F8F8F6] border border-[#E5E5E0]">
                  <span className="text-[10px] text-[#626560] font-medium">Active Leads</span>
                  <p className="text-lg font-bold text-[#171817] mt-0.5">{totalActive}</p>
                </div>

                <div className="p-2.5 rounded-xl bg-[#F8F8F6] border border-[#E5E5E0]">
                  <span className="text-[10px] text-[#626560] font-medium">New Leads</span>
                  <p className="text-lg font-bold text-[#7A5B28] mt-0.5">{newLeads}</p>
                </div>

                <div className="p-2.5 rounded-xl bg-[#F8F8F6] border border-[#E5E5E0]">
                  <span className="text-[10px] text-[#626560] font-medium">Follow-ups</span>
                  <p className="text-lg font-bold text-[#171817] mt-0.5">{followups}</p>
                </div>

                <div className="p-2.5 rounded-xl bg-[#F8F8F6] border border-[#E5E5E0]">
                  <span className="text-[10px] text-[#626560] font-medium">Meetings This Week</span>
                  <p className="text-lg font-bold text-[#171817] mt-0.5">{meetingsCount}</p>
                </div>
              </div>

              {/* View Workflow Button */}
              <Link
                href={`/dashboard/team-lead/member/${exec.id}`}
                className="w-full py-2.5 rounded-xl bg-[#111314] hover:bg-[#1E2021] text-[#F4F2EC] border border-[#252829] text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-xs active:scale-[0.99]"
              >
                <span>View Member Workflow</span>
                <ArrowRight className="w-4 h-4 text-[#D2BE91]" />
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
