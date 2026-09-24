'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,
  Clock,
  CalendarDays,
  DollarSign,
  UserPlus,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  UserX,
  TrendingUp,
  ArrowUpRight,
  Briefcase,
  Layers,
  Sparkles,
  PhoneCall,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { AdminTasksOverviewWidget } from '@/components/tasks/AdminTasksOverviewWidget';
import { getFastCache, setFastCache } from '@/lib/fast-data';
import { useCrmSync } from '@/lib/sync-event';

interface HRDashboardData {
  totalEmployees: number;
  presentToday: number;
  absentToday: number;
  onLeaveToday: number;
  pendingLeavesCount: number;
  openPositionsCount: number;
  activeCandidatesCount: number;
  totalMonthlyPayroll: number;
  totalCommissionAccrued: number;
  recentLeaves: Array<{
    id: string;
    userName: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    daysCount: number;
    status: string;
  }>;
  recentCandidates: Array<{
    id: string;
    fullName: string;
    role: string;
    stage: string;
    experienceYears?: number;
  }>;
}

export default function HRDashboardPage() {
  const cacheKey = 'crm:hr:dashboard_metrics';

  const [data, setData] = useState<HRDashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchHRData = async (isBackground: boolean = false) => {
    const cached = getFastCache<HRDashboardData>(cacheKey);
    if (!cached && !isBackground) {
      setLoading(true);
    }
    try {
      // Parallel fetch from HR endpoints
      const [empRes, attRes, leaveRes, payrollRes, recruitRes] = await Promise.all([
        fetch('/api/hr/employees'),
        fetch('/api/hr/attendance'),
        fetch('/api/hr/leaves?status=PENDING'),
        fetch('/api/hr/payroll'),
        fetch('/api/hr/recruitment'),
      ]);
      const responses = [empRes, attRes, leaveRes, payrollRes, recruitRes];
      if (responses.some((response) => !response.ok)) {
        throw new Error('one or more HR data sources');
      }

      const empJson = empRes.ok ? await empRes.json() : { employees: [] };
      const attJson = attRes.ok ? await attRes.json() : { present: 0, absent: 0, onLeave: 0 };
      const leaveJson = leaveRes.ok ? await leaveRes.json() : { leaves: [] };
      const payrollJson = payrollRes.ok ? await payrollRes.json() : { totalPayroll: 0, totalCommission: 0 };
      const recruitJson = recruitRes.ok ? await recruitRes.json() : { candidates: [], openings: [] };

      const formatted: HRDashboardData = {
        totalEmployees: empJson.employees?.length || 0,
        presentToday: attJson.present || 0,
        absentToday: attJson.absent || 0,
        onLeaveToday: attJson.onLeave || 0,
        pendingLeavesCount: leaveJson.leaves?.length || 0,
        openPositionsCount: recruitJson.openings?.filter((o: { status: string }) => o.status === 'OPEN').length || 0,
        activeCandidatesCount: recruitJson.candidates?.filter((c: { stage: string }) => c.stage !== 'REJECTED' && c.stage !== 'HIRED').length || 0,
        totalMonthlyPayroll: payrollJson.totalPayroll || 0,
        totalCommissionAccrued: payrollJson.totalCommission || 0,
        recentLeaves: (leaveJson.leaves || []).slice(0, 5).map((l: any) => ({
          id: l.id,
          userName: l.user?.name || 'Staff Member',
          leaveType: l.leaveType,
          startDate: l.startDate,
          endDate: l.endDate,
          daysCount: l.daysCount,
          status: l.status,
        })),
        recentCandidates: (recruitJson.candidates || []).slice(0, 5).map((c: any) => ({
          id: c.id,
          fullName: c.fullName,
          role: c.jobOpening?.title || 'General Applicant',
          stage: c.stage,
          experienceYears: c.experienceYears,
        })),
      };

      setData(formatted);
      setLoadError(null);
      setFastCache(cacheKey, formatted, 60000);
    } catch (err) {
      console.error('HR Dashboard load error:', err);
      setLoadError(err instanceof Error ? err.message : 'Unable to load current HR data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const cached = getFastCache<HRDashboardData>(cacheKey);
    if (cached) {
      setData(cached);
      setLoading(false);
      fetchHRData(true);
    } else {
      fetchHRData(false);
    }
    const handleFocus = () => fetchHRData(true);
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  useCrmSync(['hr', 'attendance', 'users', 'tasks', 'all'], () => {
    fetchHRData(true);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E5E0]">
        <div>
          <h2 className="text-xl font-bold text-[#171817] flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-[#B69A63]" /> People &amp; Workforce Management
          </h2>
          <p className="text-xs text-[#626560] mt-1">
            Human resources operations, attendance tracking, leave requests, sales quotas, and recruitment.
          </p>
        </div>
      </div>
      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[#E8D1CF] bg-[#FAF3F3] px-4 py-3 text-xs text-[#753330]">
          <span>Live HR data could not be refreshed: {loadError}. Showing the last verified values.</span>
          <Button size="sm" variant="secondary" onClick={() => fetchHRData(false)}>Retry</Button>
        </div>
      )}


      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Headcount */}
        <Link
          href="/dashboard/hr/employees"
          className="p-4 rounded-2xl bg-white border border-[#E5E5E0] shadow-xs hover:border-[#B69A63] transition group block"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#8C908A] uppercase tracking-wider">Total Staff</span>
            <div className="p-2 rounded-lg bg-[#F8F8F6] text-[#171817] group-hover:bg-[#111314] group-hover:text-[#C6AD7A] transition">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-[#171817] tabular-nums">
            {loading ? '...' : data?.totalEmployees || 0}
          </div>
          <div className="mt-1 text-[11px] text-[#8C908A]">Across Sales &amp; Management</div>
        </Link>

        {/* Present Today */}
        <Link
          href="/dashboard/hr/attendance"
          className="p-4 rounded-2xl bg-white border border-[#E5E5E0] shadow-xs hover:border-[#B69A63] transition group block"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#8C908A] uppercase tracking-wider">Present Today</span>
            <div className="p-2 rounded-lg bg-[#F0F7F2] text-[#2D5A3C] group-hover:bg-[#2D5A3C] group-hover:text-white transition">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-[#2D5A3C] tabular-nums">
            {loading ? '...' : data?.presentToday || 0}
          </div>
          <div className="mt-1 text-[11px] text-[#8C908A]">
            {data?.onLeaveToday || 0} On Leave • {data?.absentToday || 0} Absent
          </div>
        </Link>

        {/* Pending Leaves */}
        <Link
          href="/dashboard/hr/leaves"
          className="p-4 rounded-2xl bg-white border border-[#E5E5E0] shadow-xs hover:border-[#B69A63] transition group block"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#8C908A] uppercase tracking-wider">Pending Leaves</span>
            <div className="p-2 rounded-lg bg-[#FAF8F5] text-[#B69A63] group-hover:bg-[#B69A63] group-hover:text-white transition">
              <CalendarDays className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-[#B69A63] tabular-nums">
            {loading ? '...' : data?.pendingLeavesCount || 0}
          </div>
          <div className="mt-1 text-[11px] text-[#8C908A]">Requires HR Approval</div>
        </Link>

        {/* Open Hiring */}
        <Link
          href="/dashboard/hr/recruitment"
          className="p-4 rounded-2xl bg-white border border-[#E5E5E0] shadow-xs hover:border-[#B69A63] transition group block"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#8C908A] uppercase tracking-wider">Hiring Pipeline</span>
            <div className="p-2 rounded-lg bg-[#F4F4F1] text-[#171817] group-hover:bg-[#111314] group-hover:text-[#C6AD7A] transition">
              <UserPlus className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-[#171817] tabular-nums">
            {loading ? '...' : data?.activeCandidatesCount || 0}
          </div>
          <div className="mt-1 text-[11px] text-[#8C908A]">
            {data?.openPositionsCount || 0} Open Roles Available
          </div>
        </Link>
      </div>

      {/* QUICK WORKFORCE NAVIGATION TILES */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <Link
          href="/dashboard/hr/employees"
          className="p-3.5 rounded-xl bg-white border border-[#E5E5E0] hover:border-[#B69A63] hover:shadow-xs transition flex items-center gap-3"
        >
          <div className="w-9 h-9 rounded-lg bg-[#F8F8F6] text-[#B69A63] flex items-center justify-center flex-shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-[#171817]">Staff Directory</div>
            <div className="text-[10px] text-[#8C908A]">View all profiles &amp; roles</div>
          </div>
        </Link>

        <Link
          href="/dashboard/hr/attendance"
          className="p-3.5 rounded-xl bg-white border border-[#E5E5E0] hover:border-[#B69A63] hover:shadow-xs transition flex items-center gap-3"
        >
          <div className="w-9 h-9 rounded-lg bg-[#F8F8F6] text-[#B69A63] flex items-center justify-center flex-shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-[#171817]">Attendance &amp; Shifts</div>
            <div className="text-[10px] text-[#8C908A]">Mark in/out &amp; roster</div>
          </div>
        </Link>

        <Link
          href="/dashboard/hr/leaves"
          className="p-3.5 rounded-xl bg-white border border-[#E5E5E0] hover:border-[#B69A63] hover:shadow-xs transition flex items-center gap-3"
        >
          <div className="w-9 h-9 rounded-lg bg-[#F8F8F6] text-[#B69A63] flex items-center justify-center flex-shrink-0">
            <CalendarDays className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-[#171817]">Leave Requests</div>
            <div className="text-[10px] text-[#8C908A]">Review &amp; approve time off</div>
          </div>
        </Link>

        <Link
          href="/dashboard/hr/payroll"
          className="p-3.5 rounded-xl bg-white border border-[#E5E5E0] hover:border-[#B69A63] hover:shadow-xs transition flex items-center gap-3"
        >
          <div className="w-9 h-9 rounded-lg bg-[#F8F8F6] text-[#B69A63] flex items-center justify-center flex-shrink-0">
            <DollarSign className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-[#171817]">Targets &amp; Payroll</div>
            <div className="text-[10px] text-[#8C908A]">Commissions &amp; quotas</div>
          </div>
        </Link>

        <Link
          href="/dashboard/hr/recruitment"
          className="p-3.5 rounded-xl bg-white border border-[#E5E5E0] hover:border-[#B69A63] hover:shadow-xs transition flex items-center gap-3"
        >
          <div className="w-9 h-9 rounded-lg bg-[#F8F8F6] text-[#B69A63] flex items-center justify-center flex-shrink-0">
            <UserPlus className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-[#171817]">Hiring Pipeline</div>
            <div className="text-[10px] text-[#8C908A]">Candidates &amp; interviews</div>
          </div>
        </Link>
      </div>

      {/* EXECUTIVE DAILY DIRECTIVES & WORKFORCE TASKS */}
      <AdminTasksOverviewWidget role="HR" />

      {/* TWO COLUMN OPERATIONAL GRIDS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Leaves Requiring Review */}
        <div className="rounded-2xl bg-white border border-[#E5E5E0] p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[#F4F4F1]">
            <h3 className="text-xs font-bold text-[#171817] uppercase tracking-wider flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-[#B69A63]" /> Pending Leave Applications
            </h3>
            <Link href="/dashboard/hr/leaves" className="text-[11px] text-[#B69A63] hover:text-[#C6AD7A] font-semibold">
              Manage All Leaves →
            </Link>
          </div>

          <div className="mt-3 divide-y divide-[#E5E5E0]">
            {(!data?.recentLeaves || data.recentLeaves.length === 0) ? (
              <div className="py-8 text-center text-xs text-[#8C908A]">
                No pending leave requests at this time. All caught up!
              </div>
            ) : (
              data.recentLeaves.map((leave) => (
                <div key={leave.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-[#171817]">{leave.userName}</div>
                    <div className="text-[11px] text-[#626560] mt-0.5">
                      <span className="font-semibold text-[#B69A63]">{leave.leaveType}</span> • {leave.startDate} to {leave.endDate} ({leave.daysCount} days)
                    </div>
                  </div>
                  <Link
                    href="/dashboard/hr/leaves"
                    className="px-2.5 py-1 rounded-md bg-[#F4F4F1] text-[#171817] hover:bg-[#E5E5E0] border border-[#E5E5E0] text-[11px] font-semibold transition"
                  >
                    Review
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Active Candidate Pipeline */}
        <div className="rounded-2xl bg-white border border-[#E5E5E0] p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[#F4F4F1]">
            <h3 className="text-xs font-bold text-[#171817] uppercase tracking-wider flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-[#B69A63]" /> Active Job Applicants
            </h3>
            <Link href="/dashboard/hr/recruitment" className="text-[11px] text-[#B69A63] hover:text-[#C6AD7A] font-semibold">
              View Hiring Board →
            </Link>
          </div>

          <div className="mt-3 divide-y divide-[#E5E5E0]">
            {(!data?.recentCandidates || data.recentCandidates.length === 0) ? (
              <div className="py-8 text-center text-xs text-[#8C908A]">
                No candidates in pipeline. Post a job opening to attract talent.
              </div>
            ) : (
              data.recentCandidates.map((candidate) => (
                <div key={candidate.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-[#171817]">{candidate.fullName}</div>
                    <div className="text-[11px] text-[#626560] mt-0.5">
                      Applying for <span className="font-medium text-[#171817]">{candidate.role}</span>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-[#F4F4F1] text-[#171817] border border-[#E5E5E0]">
                    {candidate.stage.replace('_', ' ')}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
