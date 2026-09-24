import React from 'react';
import Link from 'next/link';
import {
  UserCheck,
  Clock,
  Calendar,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redirect } from 'next/navigation';
import { LeadCard } from '@/components/leads/LeadCard';
import { ExecutiveTasksWidget } from '@/components/tasks/ExecutiveTasksWidget';
import { ExecutiveRealtimeListener } from '@/components/dashboard/ExecutiveRealtimeListener';
import { AlertSummaryCard } from '@/components/dashboard/AlertSummaryCard';
import { CALLING_SOURCE_PREFIX } from '@/lib/lead-pipeline';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ExecutiveDashboardPage() {
  const session = await getSession();
  if (!session) redirect('/login');


  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

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

  // Real Database queries for this Executive
  let newToMeLeads: any[] = [];
  let pendingFollowups = 0;
  let meetingsThisWeek: any[] = [];
  let completedTodayUpdates = 0;
  let rawTasks: any[] = [];

  try {
    const results = await Promise.all([
      // New To Me
      prisma.lead.findMany({
        where: {
          currentOwnerId: session.id,
          currentCategory: 'ACTIVE',
          source: { not: { startsWith: CALLING_SOURCE_PREFIX } },
          isNewToMe: true,
        },
        include: {
          currentOwner: { select: { id: true, name: true } },
          updates: { where: { disposition: 'LEAD' }, take: 1, orderBy: { createdAt: 'desc' } },
        },
        orderBy: [{ lastUpdatedAt: 'desc' }, { leadNumber: 'asc' }],
        take: 6,
      }),
      // Total pending follow-ups
      prisma.lead.count({
        where: {
          currentOwnerId: session.id,
          currentCategory: 'ACTIVE',
          source: { not: { startsWith: CALLING_SOURCE_PREFIX } },
          nextActionAt: { not: null },
        },
      }),
      // Meetings this week
      prisma.meeting.findMany({
        where: {
          createdById: session.id,
          scheduledAt: { gte: startOfWeek, lte: endOfWeek },
        },
        include: {
          lead: { select: { clientName: true, leadNumber: true, phone: true } },
        },
        orderBy: { scheduledAt: 'asc' },
      }),
      // Completed Today
      prisma.leadUpdate.count({
        where: {
          userId: session.id,
          createdAt: { gte: startOfToday, lte: endOfToday },
          disposition: 'LEAD',
        },
      }),
      // Executive Tasks for Today
      prisma.executiveTask.findMany({
        where: {
          assigneeId: session.id,
          dueDate: todayStr,
        },
        include: {
          assignee: { select: { id: true, name: true, email: true, designation: true } },
          createdBy: { select: { id: true, name: true, email: true, role: true } },
        },
        orderBy: [
          { priority: 'desc' },
          { dueTime: 'asc' },
          { createdAt: 'desc' },
        ],
      }),
    ]);

    newToMeLeads = results[0];
    pendingFollowups = results[1];
    meetingsThisWeek = results[2];
    completedTodayUpdates = results[3];
    rawTasks = results[4];
  } catch (err) {
    console.error('Failed to query executive dashboard data:', err);
  }

  // Evaluate overdue status
  const overdueTaskIds: string[] = [];
  const todayTasks = rawTasks.map((task) => {
    if (task.status === 'PENDING') {
      const isPastDate = task.dueDate < todayStr;
      const isPastTime = task.dueDate === todayStr && task.dueTime < currentTimeStr;
      if (isPastDate || isPastTime) {
        overdueTaskIds.push(task.id);
        return { ...task, status: 'OVERDUE' };
      }
    }
    return task;
  });

  if (overdueTaskIds.length > 0) {
    await prisma.executiveTask.updateMany({
      where: { id: { in: overdueTaskIds } },
      data: { status: 'OVERDUE' },
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E5E0]">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-[#171817]">
              Welcome, {session.name}
            </h2>
            <ExecutiveRealtimeListener />
          </div>
          <p className="text-xs text-[#626560] mt-1">
            Executive Daily Workspace — Real-time priority stream &amp; execution queue
          </p>
        </div>

      </div>

      <AlertSummaryCard
        title="Your CRM alerts"
        subtitle="No alerts right now."
        unreadAlerts={unreadAlerts}
        alerts={recentAlerts.map((alert) => ({
          id: alert.id,
          title: alert.title,
          message: alert.message,
          read: alert.read,
          link: alert.link,
        }))}
        fallbackLink="/dashboard/executive/workspace"
      />

      {/* Daily Assigned Tasks Widget */}
      <ExecutiveTasksWidget initialTasks={todayTasks as any} />

      {/* Primary Status Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* New to Me */}
        <Link
          href="/dashboard/executive/today"
          prefetch={true}
          className="p-3.5 rounded-2xl bg-white border border-[#E5E5E0] hover:border-[#B69A63] transition shadow-xs"
        >
          <span className="text-[11px] text-[#7A5B28] font-semibold flex items-center gap-1">
            <UserCheck className="w-3.5 h-3.5 text-[#B69A63]" /> New to Me
          </span>
          <p className="text-2xl font-black text-[#171817] mt-1.5">{newToMeLeads.length}</p>
        </Link>

        {/* Pending Follow-ups */}
        <div className="p-3.5 rounded-2xl bg-white border border-[#E5E5E0] shadow-xs">
          <span className="text-[11px] text-[#7A5B28] font-semibold flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-[#B69A63]" /> Follow-ups
          </span>
          <p className="text-2xl font-black text-[#171817] mt-1.5">{pendingFollowups}</p>
        </div>

        {/* Meetings this week */}
        <Link
          href="/dashboard/meetings"
          prefetch={true}
          className="p-3.5 rounded-2xl bg-white border border-[#E5E5E0] hover:border-[#B69A63] transition shadow-xs"
        >
          <span className="text-[11px] text-[#171817] font-semibold flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-[#626560]" /> Meetings
          </span>
          <p className="text-2xl font-black text-[#171817] mt-1.5">{meetingsThisWeek.length}</p>
        </Link>

        {/* Completed today */}
        <div className="p-3.5 rounded-2xl bg-white border border-[#E5E5E0] shadow-xs">
          <span className="text-[11px] text-[#2D5A3C] font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#2D5A3C]" /> Done Today
          </span>
          <p className="text-2xl font-black text-[#171817] mt-1.5">{completedTodayUpdates}</p>
        </div>
      </div>

      {/* NEW TO ME LEADS */}
      <div className="rounded-2xl bg-white border border-[#E5E5E0] p-5 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#171817] flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-[#B69A63]" /> New To Me (Assigned & Reassigned)
            </h3>
            <p className="text-xs text-[#626560] mt-0.5">
              Leads newly assigned to you that have not yet had an executive remark logged.
            </p>
          </div>

          <Link
            href="/dashboard/executive/today"
            prefetch={true}
            className="text-xs font-semibold text-[#171817] hover:text-[#B69A63] flex items-center gap-1"
          >
            View All ({newToMeLeads.length}) <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {newToMeLeads.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#90928E] border border-dashed border-[#E5E5E0] rounded-xl">
            No unreviewed new leads. You are up to date!
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {newToMeLeads.map((lead) => (
              <LeadCard key={lead.id} lead={lead} />
            ))}
          </div>
        )}
      </div>

      {/* MEETINGS THIS WEEK */}
      <div className="rounded-2xl bg-white border border-[#E5E5E0] p-5 space-y-3 shadow-xs">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#171817] flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#B69A63]" /> My Scheduled Meetings This Week
          </h3>
          <Link
            href="/dashboard/meetings"
            prefetch={true}
            className="text-xs font-semibold text-[#171817] hover:text-[#B69A63]"
          >
            Manage Calendar →
          </Link>
        </div>

        <div className="divide-y divide-[#E5E5E0]">
          {meetingsThisWeek.length === 0 ? (
            <p className="text-xs text-[#90928E] py-3">No client meetings scheduled for this week.</p>
          ) : (
            meetingsThisWeek.map((m) => (
              <div key={m.id} className="py-2.5 flex items-center justify-between text-xs">
                <div>
                  <p className="font-semibold text-[#171817]">
                    {m.meetingType} with {m.lead.clientName} ({m.lead.leadNumber})
                  </p>
                  <p className="text-[11px] text-[#626560]">
                    {m.date} at {m.time} • {m.location || 'Online'}
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-[#FAF5EB] text-[#7A5B28] border border-[#E8DCBE]">
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
