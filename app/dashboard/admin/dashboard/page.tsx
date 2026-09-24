import React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  UserX,
  Clock,
  Layers,
  Sparkles,
  PhoneOff,
  Share2,
  TrendingUp,
  ArrowUpRight,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';
import { getAdminAttentionMetrics } from '@/services/lead.service';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { AdminTasksOverviewWidget } from '@/components/tasks/AdminTasksOverviewWidget';
import { ExecutiveRealtimeListener } from '@/components/dashboard/ExecutiveRealtimeListener';
import { AlertSummaryCard } from '@/components/dashboard/AlertSummaryCard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminDashboardPage() {
  const session = await getSession();
  if (!session) {
    return null;
  }

  let metrics = {
    unassigned: 0,
    overdueFollowups: 0,
    withoutNextAction: 0,
    notAnswering: 0,
    notInterested: 0,
    interested: 0,
    totalActive: 0,
    newToday: 0,
    totalAll: 0,
    channelPartners: 0,
    otherCategory: 0,
  };
  const slaResult: {
    checkedCount: number;
    breachedCount: number;
    notificationsSent: number;
    breaches: any[];
  } = { checkedCount: 0, breachedCount: 0, notificationsSent: 0, breaches: [] };
  let recentLogs: any[] = [];
  const [
    metricsResult,
    recentLogsResult,
    unreadAlerts,
    recentAlerts,
  ] = await Promise.all([
    getAdminAttentionMetrics().catch((error) => {
      console.error('Failed to get admin attention metrics:', error);
      return null;
    }),
    prisma.auditLog.findMany({
      take: 6,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        metadata: true,
        createdAt: true,
        actor: { select: { name: true, role: true } },
      },
    }).catch((error) => {
      console.error('Failed to fetch recent audit logs:', error);
      return [];
    }),
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

  metrics = metricsResult || metrics;
  recentLogs = recentLogsResult;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E5E0]">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-[#171817] flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#B69A63]" /> Leads &amp; Pipeline Command Center
            </h2>
            <ExecutiveRealtimeListener />
          </div>
          <p className="text-xs text-[#626560] mt-0.5">
            Real-time executive oversight across inbound inquiries, qualified property prospects, and SLA inactivity escalations.
          </p>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 sm:flex-wrap no-scrollbar">
          <Link
            href="/dashboard/admin/bulk-upload"
            prefetch={true}
            className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-[#F8F8F6] text-[#171817] border border-[#E5E5E0] text-xs font-medium inline-flex items-center gap-1.5 transition shadow-2xs whitespace-nowrap shrink-0"
          >
            <UploadCloud className="w-3.5 h-3.5 text-[#B69A63]" /> Bulk Upload
          </Link>
          <Link
            href="/dashboard/admin/interested"
            prefetch={true}
            className="px-3.5 py-1.5 rounded-xl bg-[#EDF5F0] hover:bg-[#E3EFE7] text-[#2D5A3C] border border-[#D3E5D9] text-xs font-medium inline-flex items-center gap-1.5 transition shadow-2xs whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#2D5A3C]" /> Interested ({metrics.interested})
          </Link>
          <Link
            href="/dashboard/admin/leads"
            prefetch={true}
            className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-[#F8F8F6] text-[#171817] border border-[#E5E5E0] text-xs font-medium inline-flex items-center gap-1.5 transition shadow-2xs whitespace-nowrap shrink-0"
          >
            <Layers className="w-3.5 h-3.5 text-[#B69A63]" /> All Leads ({metrics.totalAll})
          </Link>
        </div>
      </div>

      <AlertSummaryCard
        title="Admin alert feed"
        subtitle="No alerts right now."
        unreadAlerts={unreadAlerts}
        alerts={recentAlerts.map((alert) => ({
          id: alert.id,
          title: alert.title,
          message: alert.message,
          read: alert.read,
          link: alert.link,
        }))}
        fallbackLink="/dashboard/admin/leads"
      />

      {/* SLA AUTO-ESCALATION ALERT (Restrained Luxury Charcoal-Rose Banner) */}
      {slaResult.breaches.length > 0 && (
        <div className="p-5 rounded-2xl border border-[#E8D1CF] bg-[#FAF3F3] space-y-3 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-[#753330] flex items-center gap-1.5 uppercase tracking-wide">
              <AlertTriangle className="w-4 h-4 text-[#753330]" />
              Smart SLA Engine • {slaResult.breaches.length} Lead(s) Breached Inactivity Threshold
            </h3>
            <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-white text-[#753330] border border-[#E8D1CF]">
              ⚡ Dual Alert Dispatched to Team Lead &amp; Admin
            </span>
          </div>
          <p className="text-xs text-[#753330]/90">
            Automated compliance check found leads exceeding unattended limits (&gt;2h uncontacted new leads, or &gt;24h dormant not-answering leads). Immediate re-engagement recommended:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
            {slaResult.breaches.slice(0, 6).map((b) => (
              <Link
                key={b.leadId}
                href={`/dashboard/leads/${b.leadId}`}
                prefetch={true}
                className="p-3.5 rounded-xl bg-white border border-[#E8D1CF] hover:border-[#753330]/50 text-xs flex flex-col justify-between space-y-1.5 transition shadow-2xs group"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#171817] group-hover:text-[#B69A63] transition-colors">{b.clientName}</span>
                  <span className="font-mono text-[10px] text-[#626560] font-bold">{b.leadNumber}</span>
                </div>
                <p className="text-[11px] text-[#753330] font-medium">{b.breachReason}</p>
                <div className="flex items-center justify-between pt-1 border-t border-[#F0F0EB] text-[10px] text-[#626560]">
                  <span>Team: <strong className="text-[#171817]">{b.teamName}</strong></span>
                  <span>Exec: <strong className="text-[#171817]">{b.ownerName}</strong></span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* STRATEGIC DARK FEATURE PANEL: ATTENTION REQUIRED */}
      <div className="rounded-2xl bg-[#111314] border border-[#1E2021] p-6 shadow-sm space-y-4 text-[#F4F2EC]">
        <div className="flex items-center justify-between border-b border-[#1E2021] pb-3">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-[#B69A63]" />
            <h3 className="text-xs font-bold tracking-widest text-[#F4F2EC] uppercase">
              Attention Required — Zero Silent Leads Policy
            </h3>
          </div>
          <span className="text-[11px] text-[#AEB1AC] font-mono">Real-time Compliance</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Overdue Follow-ups */}
          <Link
            href="/dashboard/admin/leads?overdue=true"
            prefetch={true}
            className="p-4 rounded-xl bg-[#17191A] border border-[#252829] hover:border-[#B69A63]/50 transition-all text-[#F4F2EC] group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#AEB1AC]">Overdue Follow-ups</span>
              <Clock className="w-4 h-4 text-[#C6AD7A]" />
            </div>
            <p className="text-2xl font-black text-[#F4F2EC] mt-2">
              {metrics.overdueFollowups}
            </p>
            <p className="text-[11px] text-[#AEB1AC] mt-1 flex items-center gap-1 group-hover:text-[#F4F2EC] transition-colors">
              Actions past due time <ArrowUpRight className="w-3 h-3 text-[#B69A63]" />
            </p>
          </Link>

          {/* Unassigned Leads */}
          <Link
            href="/dashboard/admin/leads?unassigned=true"
            prefetch={true}
            className="p-4 rounded-xl bg-[#17191A] border border-[#252829] hover:border-[#B69A63]/50 transition-all text-[#F4F2EC] group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#AEB1AC]">Unassigned Leads</span>
              <UserX className="w-4 h-4 text-[#C6AD7A]" />
            </div>
            <p className="text-2xl font-black text-[#F4F2EC] mt-2">
              {metrics.unassigned}
            </p>
            <p className="text-[11px] text-[#AEB1AC] mt-1 flex items-center gap-1 group-hover:text-[#F4F2EC] transition-colors">
              Awaiting executive owner <ArrowUpRight className="w-3 h-3 text-[#B69A63]" />
            </p>
          </Link>

          {/* Without Next Action */}
          <Link
            href="/dashboard/admin/leads?withoutNextAction=true"
            prefetch={true}
            className="p-4 rounded-xl bg-[#17191A] border border-[#252829] hover:border-[#B69A63]/50 transition-all text-[#F4F2EC] group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#AEB1AC]">Without Next Action</span>
              <AlertTriangle className="w-4 h-4 text-[#C6AD7A]" />
            </div>
            <p className="text-2xl font-black text-[#F4F2EC] mt-2">
              {metrics.withoutNextAction}
            </p>
            <p className="text-[11px] text-[#AEB1AC] mt-1 flex items-center gap-1 group-hover:text-[#F4F2EC] transition-colors">
              Lacking scheduled next step <ArrowUpRight className="w-3 h-3 text-[#B69A63]" />
            </p>
          </Link>

          {/* Not Answering Queue */}
          <Link
            href="/dashboard/admin/not-answering"
            prefetch={true}
            className="p-4 rounded-xl bg-[#17191A] border border-[#252829] hover:border-[#B69A63]/50 transition-all text-[#F4F2EC] group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#AEB1AC]">Not Answering (NA)</span>
              <PhoneOff className="w-4 h-4 text-[#C6AD7A]" />
            </div>
            <p className="text-2xl font-black text-[#F4F2EC] mt-2">{metrics.notAnswering}</p>
            <p className="text-[11px] text-[#AEB1AC] mt-1 flex items-center gap-1 group-hover:text-[#F4F2EC] transition-colors">
              In NA triage queue <ArrowUpRight className="w-3 h-3 text-[#B69A63]" />
            </p>
          </Link>
        </div>
      </div>

      {/* COMPANY PIPELINE METRICS (Pure White KPI Cards with Dominant Numbers) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-[#626560] tracking-wider uppercase">
            Company Overview
          </h3>
          <span className="text-[11px] text-[#90928E]">Live Pipeline State</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3.5">
          <div className="p-4 rounded-xl bg-white border border-[#E5E5E0] shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
            <span className="text-[11px] text-[#626560] font-medium block">New Today</span>
            <p className="text-2xl font-bold text-[#171817] mt-1.5 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#B69A63]" /> {metrics.newToday}
            </p>
          </div>

          <Link
            href="/dashboard/admin/interested"
            prefetch={true}
            className="p-4 rounded-xl bg-white border border-[#E5E5E0] hover:border-[#B69A63] transition shadow-[0_1px_3px_rgba(0,0,0,0.02)] group"
          >
            <span className="text-[11px] text-[#626560] font-medium flex items-center justify-between">
              Interested <ArrowUpRight className="w-3 h-3 text-[#B69A63] group-hover:translate-x-0.5 transition-transform" />
            </span>
            <p className="text-2xl font-bold text-[#2D5A3C] mt-1.5 flex items-center gap-1.5">
              {metrics.interested}
            </p>
          </Link>

          <div className="p-4 rounded-xl bg-white border border-[#E5E5E0] shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
            <span className="text-[11px] text-[#626560] font-medium block">Active Pipeline</span>
            <p className="text-2xl font-bold text-[#171817] mt-1.5 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-[#B69A63]" /> {metrics.totalActive}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white border border-[#E5E5E0] shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
            <span className="text-[11px] text-[#626560] font-medium block">Total Database</span>
            <p className="text-2xl font-bold text-[#171817] mt-1.5 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-[#626560]" /> {metrics.totalAll}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white border border-[#E5E5E0] shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
            <span className="text-[11px] text-[#626560] font-medium block">Not Interested</span>
            <p className="text-2xl font-bold text-[#626560] mt-1.5">{metrics.notInterested}</p>
          </div>

          <div className="p-4 rounded-xl bg-white border border-[#E5E5E0] shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
            <span className="text-[11px] text-[#626560] font-medium block">Channel Partners</span>
            <p className="text-2xl font-bold text-[#171817] mt-1.5 flex items-center gap-1.5">
              <Share2 className="w-4 h-4 text-[#B69A63]" /> {metrics.channelPartners}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white border border-[#E5E5E0] shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
            <span className="text-[11px] text-[#626560] font-medium block">Other Category</span>
            <p className="text-2xl font-bold text-[#626560] mt-1.5">{metrics.otherCategory}</p>
          </div>
        </div>
      </div>

      {/* EXECUTIVE DAILY TASKS & DIRECTIVES TRACKER */}
      <AdminTasksOverviewWidget role="ADMIN" />

      {/* QUICK MANAGEMENT SHORTCUTS & RECENT AUDIT TRAIL */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Management Shortcuts */}
        <div className="rounded-2xl bg-white border border-[#E5E5E0] p-5 space-y-3 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
          <h4 className="text-xs font-bold text-[#171817] uppercase tracking-wider">
            Operational Management
          </h4>
          <div className="space-y-2">
            <Link
              href="/dashboard/admin/leads"
              prefetch={true}
              className="p-2.5 rounded-xl bg-[#F8F8F6] hover:bg-[#FAF9F5] border border-[#E5E5E0] flex items-center justify-between text-xs text-[#171817] font-medium transition group"
            >
              <span>Master All Leads Directory</span>
              <ArrowUpRight className="w-4 h-4 text-[#90928E] group-hover:text-[#B69A63] transition-colors" />
            </Link>
            <Link
              href="/dashboard/admin/bulk-upload"
              prefetch={true}
              className="p-2.5 rounded-xl bg-[#F8F8F6] hover:bg-[#FAF9F5] border border-[#E5E5E0] flex items-center justify-between text-xs text-[#171817] font-medium transition group"
            >
              <span>Bulk Leads Upload Hub</span>
              <ArrowUpRight className="w-4 h-4 text-[#90928E] group-hover:text-[#B69A63] transition-colors" />
            </Link>
            <Link
              href="/dashboard/admin/teams"
              prefetch={true}
              className="p-2.5 rounded-xl bg-[#F8F8F6] hover:bg-[#FAF9F5] border border-[#E5E5E0] flex items-center justify-between text-xs text-[#171817] font-medium transition group"
            >
              <span>Team Structure &amp; Distribution</span>
              <ArrowUpRight className="w-4 h-4 text-[#90928E] group-hover:text-[#B69A63] transition-colors" />
            </Link>
            <Link
              href="/dashboard/admin/users"
              prefetch={true}
              className="p-2.5 rounded-xl bg-[#F8F8F6] hover:bg-[#FAF9F5] border border-[#E5E5E0] flex items-center justify-between text-xs text-[#171817] font-medium transition group"
            >
              <span>User &amp; Employee Access Management</span>
              <ArrowUpRight className="w-4 h-4 text-[#90928E] group-hover:text-[#B69A63] transition-colors" />
            </Link>
            <Link
              href="/dashboard/reports"
              prefetch={true}
              className="p-2.5 rounded-xl bg-[#F8F8F6] hover:bg-[#FAF9F5] border border-[#E5E5E0] flex items-center justify-between text-xs text-[#171817] font-medium transition group"
            >
              <span>Conversion Funnel &amp; Analytics</span>
              <ArrowUpRight className="w-4 h-4 text-[#90928E] group-hover:text-[#B69A63] transition-colors" />
            </Link>
          </div>
        </div>

        {/* Live Immutable Audit Stream */}
        <div className="lg:col-span-2 rounded-2xl bg-white border border-[#E5E5E0] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-[#171817] uppercase tracking-wider">
              Recent Company Audit Activity
            </h4>
            <Link
              href="/dashboard/admin/audit"
              prefetch={true}
              className="text-[11px] text-[#B69A63] hover:text-[#9E834F] font-semibold transition"
            >
              View Full Audit Log →
            </Link>
          </div>

          <div className="divide-y divide-[#E5E5E0] text-xs">
            {recentLogs.map((log) => (
              <div key={log.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-[#171817]">
                    {String(log.action || 'ACTIVITY').replace(/_/g, ' ')}
                  </span>{' '}
                  <span className="text-[#626560] text-[11px]">
                    by {log.actor?.name || 'System'}
                  </span>
                </div>
                <span className="text-[11px] text-[#90928E] font-mono">
                  {new Date(log.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
