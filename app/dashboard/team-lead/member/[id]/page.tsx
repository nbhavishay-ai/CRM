import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Phone, Calendar, Layers } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { CALLING_SOURCE_PREFIX } from '@/lib/lead-pipeline';
import { notFound, redirect } from 'next/navigation';
import { Badge, getStatusBadgeVariant } from '@/components/ui/Badge';

export const dynamic = 'force-dynamic';

export default async function MemberWorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session || (session.role !== 'TEAM_LEAD' && session.role !== 'ADMIN')) {
    redirect('/login');
  }

  const { id } = await params;

  const member = await prisma.user.findUnique({
    where: { id },
    include: {
      team: true,
      ownedLeads: {
        where: {
          currentCategory: 'ACTIVE',
          source: { not: { startsWith: CALLING_SOURCE_PREFIX } },
        },
        include: {
          updates: {
            where: { disposition: 'LEAD' },
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { lastUpdatedAt: 'desc' },
      },
      createdMeetings: {
        include: {
          lead: { select: { clientName: true, leadNumber: true } },
        },
        orderBy: { scheduledAt: 'desc' },
      },
      followups: {
        where: { completedAt: null },
        include: {
          lead: { select: { clientName: true, leadNumber: true } },
        },
        orderBy: { dueAt: 'asc' },
      },
    },
  });

  if (!member) notFound();

  // Self-heal: Fetch user from database to ensure fresh teamId
  const currentUser = await prisma.user.findFirst({
    where: {
      OR: [
        { id: session.id },
        ...(session.email ? [{ email: session.email.toLowerCase().trim() }] : []),
        ...(session.email ? [{ email: session.email.trim() }] : []),
      ],
    },
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

  // Team Lead restriction: Member must belong to team lead's team (Admins bypass)
  if (
    session.role === 'TEAM_LEAD' &&
    (!effectiveTeamId || member.role !== 'EXECUTIVE' || member.teamId !== effectiveTeamId)
  ) {
    redirect('/dashboard/team-lead/workflow');
  }

  return (
    <div className="space-y-6">
      {/* Back button & Member Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[#E5E5E0]">
        <div className="flex items-center space-x-3">
          <Link
            href="/dashboard/team-lead/workflow"
            className="p-2 rounded-xl bg-white border border-[#E5E5E0] hover:bg-[#F8F8F6] text-[#171817] transition shadow-xs cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h2 className="text-xl font-bold text-[#171817] flex items-center gap-2">
              {member.name}
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#111314] border border-[#252829] text-[#D2BE91]">
                {member.team?.name || 'No Team'}
              </span>
            </h2>
            <p className="text-xs text-[#626560] mt-0.5">
              Supervising member&apos;s active leads, pending follow-ups, and meetings schedule.
            </p>
          </div>
        </div>
      </div>

      {/* Member Leads Workspace by Status */}
      <div className="rounded-2xl bg-white border border-[#E5E5E0] p-5 space-y-4 shadow-xs">
        <h3 className="text-sm font-bold text-[#171817] flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#B69A63]" /> Member Active Leads Workspace (
          {member.ownedLeads.length})
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {member.ownedLeads.map((lead) => (
            <Link
              key={lead.id}
              href={`/dashboard/leads/${lead.id}`}
              className="p-4 rounded-2xl bg-white border border-[#E5E5E0] flex flex-col justify-between space-y-3 shadow-xs hover:border-[#B69A63] hover:shadow-md transition group cursor-pointer block"
            >
              <div className="flex items-start justify-between">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-[#F8F8F6] text-[#171817] border border-[#E5E5E0]">
                  {lead.leadNumber}
                </span>
                <Badge variant={getStatusBadgeVariant(lead.currentStatus)}>
                  {lead.currentStatus.replace('_', ' ')}
                </Badge>
              </div>

              <div>
                <p className="font-bold text-[#171817] text-sm group-hover:text-[#B69A63] transition-colors">{lead.clientName}</p>
                <p className="text-xs text-[#626560] flex items-center gap-1 mt-0.5">
                  <Phone className="w-3.5 h-3.5 text-[#2D5A3C]" /> {lead.phone}
                </p>
              </div>

              <div className="text-xs text-[#626560] pt-2.5 border-t border-[#E5E5E0]">
                <p className="text-[#171817] font-medium">Next: {lead.nextAction || 'None'}</p>
                {lead.nextActionAt && (
                  <p className="text-[11px] text-[#7A5B28] mt-0.5 font-medium">
                    Due: {new Date(lead.nextActionAt).toLocaleString()}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Member Meetings */}
      <div className="rounded-2xl bg-white border border-[#E5E5E0] p-5 space-y-3 shadow-xs">
        <h3 className="text-sm font-bold text-[#171817] flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#B69A63]" /> Member Scheduled Meetings (
          {member.createdMeetings.length})
        </h3>

        <div className="divide-y divide-[#E5E5E0]">
          {member.createdMeetings.length === 0 ? (
            <p className="text-xs text-[#90928E] py-3">No meetings scheduled by this member.</p>
          ) : (
            member.createdMeetings.map((m) => (
              <div key={m.id} className="py-3 flex items-center justify-between text-xs">
                <div>
                  <p className="font-bold text-[#171817] text-sm">
                    {m.meetingType} with {m.lead.clientName} ({m.lead.leadNumber})
                  </p>
                  <p className="text-xs text-[#626560] mt-0.5">
                    {m.date} at {m.time} • {m.location || 'N/A'}
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full font-bold text-[10px] uppercase tracking-wider bg-[#F8F8F6] text-[#171817] border border-[#E5E5E0]">
                  {m.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
