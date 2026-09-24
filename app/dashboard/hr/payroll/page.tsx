'use client';

import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  TrendingUp,
  Target,
  Award,
  Calendar,
  Lock,
  Edit2,
  RefreshCw,
  Layers,
  Download,
  Printer,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { generateCSV, downloadCSV, ExportColumn } from '@/lib/export-utils';
import { emitCrmSync, useCrmSync } from '@/lib/sync-event';

interface StaffPayrollItem {
  userId: string;
  name: string;
  email: string;
  role: string;
  teamName: string;
  designation: string;
  period: string;
  baseSalary: number;
  targetCalls: number;
  targetMeetings: number;
  targetRevenue: number;
  commissionRate: number;
  bonus: number;
  deductions: number;
  callsCompletedCount: number;
  meetingsCount: number;
  closedDealsCount: number;
  closedRevenue: number;
  commissionEarned: number;
  netPayout: number;
  achievementPercent: number;
}

export default function TargetsAndPayrollPage() {
  const [selectedPeriod, setSelectedPeriod] = useState(new Date().toISOString().substring(0, 7)); // "2026-09"
  const [staff, setStaff] = useState<StaffPayrollItem[]>([]);
  const [totals, setTotals] = useState({
    totalStaff: 0,
    totalPayroll: 0,
    totalCommission: 0,
    totalRevenueGenerated: 0,
  });
  const [loading, setLoading] = useState(true);
  const [selectedStaffForTarget, setSelectedStaffForTarget] = useState<StaffPayrollItem | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form states
  const [targetForm, setTargetForm] = useState({
    targetCalls: '1000',
    targetMeetings: '15',
    targetRevenue: '5000000',
    commissionRate: '2.0',
    bonus: '0',
    deductions: '0',
  });

  const fetchPayrollData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/hr/payroll?period=${selectedPeriod}`);
      if (res.ok) {
        const json = await res.json();
        setStaff(json.staff || []);
        setTotals({
          totalStaff: json.totalStaff || 0,
          totalPayroll: json.totalPayroll || 0,
          totalCommission: json.totalCommission || 0,
          totalRevenueGenerated: json.totalRevenueGenerated || 0,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayrollData();
  }, [selectedPeriod]);

  useCrmSync(['all'], () => {
    fetchPayrollData();
  });

  const handleOpenTargetModal = (item: StaffPayrollItem) => {
    setSelectedStaffForTarget(item);
    setSaveError(null);
    setTargetForm({
      targetCalls: item.targetCalls.toString(),
      targetMeetings: item.targetMeetings.toString(),
      targetRevenue: item.targetRevenue.toString(),
      commissionRate: item.commissionRate.toString(),
      bonus: item.bonus.toString(),
      deductions: item.deductions.toString(),
    });
  };

  const handleSaveTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaffForTarget) return;

    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/hr/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedStaffForTarget.userId,
          period: selectedPeriod,
          targetCalls: parseInt(targetForm.targetCalls, 10),
          targetMeetings: parseInt(targetForm.targetMeetings, 10),
          targetRevenue: parseFloat(targetForm.targetRevenue),
          commissionRate: parseFloat(targetForm.commissionRate),
          bonus: parseFloat(targetForm.bonus),
          deductions: parseFloat(targetForm.deductions),
        }),
      });

      if (res.ok) {
        emitCrmSync('all');
        setSelectedStaffForTarget(null);
        fetchPayrollData();
      } else {
        const err = await res.json();
        setSaveError(err.error || 'Failed to save sales quota and commission rates');
      }
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Error saving sales target');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportCSV = () => {
    const columns: ExportColumn<StaffPayrollItem>[] = [
      { header: 'Employee Name', accessor: (s) => s.name },
      { header: 'Email', accessor: (s) => s.email },
      { header: 'Designation', accessor: (s) => s.designation || 'N/A' },
      { header: 'Team', accessor: (s) => s.teamName || 'Unassigned' },
      { header: 'Period', accessor: (s) => s.period },
      { header: 'Base Salary (INR)', accessor: (s) => s.baseSalary },
      { header: 'Target Revenue (INR)', accessor: (s) => s.targetRevenue },
      { header: 'Closed Deals Count', accessor: (s) => s.closedDealsCount },
      { header: 'Closed Revenue (INR)', accessor: (s) => s.closedRevenue },
      { header: 'Commission Rate (%)', accessor: (s) => `${s.commissionRate}%` },
      { header: 'Commission Earned (INR)', accessor: (s) => s.commissionEarned },
      { header: 'Bonus (INR)', accessor: (s) => s.bonus },
      { header: 'Deductions (INR)', accessor: (s) => s.deductions },
      { header: 'Net Monthly Payout (INR)', accessor: (s) => s.netPayout },
    ];
    const csv = generateCSV(staff, columns);
    downloadCSV(`orvion_payroll_${selectedPeriod}.csv`, csv);
  };

  const handlePrintPDF = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E5E0]">
        <div>
          <h2 className="text-xl font-bold text-[#171817] flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-[#B69A63]" /> Sales Quotas &amp; Commission Payroll
          </h2>
          <p className="text-xs text-[#626560] mt-1">
            Monthly target management and automated deal commission calculations based on verified CRM closures.
          </p>
        </div>

        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
          <Button size="sm" variant="outline" onClick={handleExportCSV} disabled={staff.length === 0}>
            <Download className="w-3.5 h-3.5 mr-1 text-[#B69A63]" /> Export CSV
          </Button>
          <Button size="sm" variant="secondary" onClick={handlePrintPDF}>
            <Printer className="w-3.5 h-3.5 mr-1 text-[#626560]" /> Print / PDF
          </Button>
          {/* Privacy Wall Pill */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#F0F7F2] border border-[#2D5A3C]/20 text-[#2D5A3C] text-xs font-semibold">
            <Lock className="w-3.5 h-3.5 text-[#2D5A3C]" /> Privacy Barrier Active
          </div>
        </div>
      </div>

      {/* Period Selector & Aggregated Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Month Selector */}
        <div className="p-4 rounded-2xl bg-white border border-[#E5E5E0] shadow-xs flex flex-col justify-between">
          <span className="text-xs font-bold text-[#8C908A] uppercase tracking-wider">Payroll Month</span>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="month"
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="w-full px-3 py-1.5 text-xs font-bold rounded-lg border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
            />
            <Button size="sm" variant="secondary" onClick={fetchPayrollData} isLoading={loading}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="mt-1 text-[11px] text-[#8C908A]">Total Eligible: {totals.totalStaff} staff</div>
        </div>

        {/* Total Monthly Payroll */}
        <div className="p-4 rounded-2xl bg-white border border-[#E5E5E0] shadow-xs">
          <span className="text-xs font-bold text-[#8C908A] uppercase tracking-wider">Total Net Payroll</span>
          <div className="mt-2 text-2xl font-black text-[#171817] tabular-nums">
            ₹{totals.totalPayroll.toLocaleString('en-IN')}
          </div>
          <div className="mt-1 text-[11px] text-[#8C908A]">Salary + Commissions + Bonuses</div>
        </div>

        {/* Total Commissions Accrued */}
        <div className="p-4 rounded-2xl bg-white border border-[#E5E5E0] shadow-xs">
          <span className="text-xs font-bold text-[#8C908A] uppercase tracking-wider">Commissions Accrued</span>
          <div className="mt-2 text-2xl font-black text-[#2D5A3C] tabular-nums">
            ₹{totals.totalCommission.toLocaleString('en-IN')}
          </div>
          <div className="mt-1 text-[11px] text-[#8C908A]">Paid on Closed Deals</div>
        </div>

        {/* Total Closed Revenue Volume */}
        <div className="p-4 rounded-2xl bg-white border border-[#E5E5E0] shadow-xs">
          <span className="text-xs font-bold text-[#8C908A] uppercase tracking-wider">Closed Deal Volume</span>
          <div className="mt-2 text-2xl font-black text-[#B69A63] tabular-nums">
            ₹{totals.totalRevenueGenerated.toLocaleString('en-IN')}
          </div>
          <div className="mt-1 text-[11px] text-[#8C908A]">Gross Won Pipeline Value</div>
        </div>
      </div>

      {/* Staff Payroll & Commission Table */}
      <div className="rounded-2xl bg-white border border-[#E5E5E0] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#F8F8F6] border-b border-[#E5E5E0] text-[#626560] font-bold uppercase tracking-wider text-[11px]">
                <th className="p-3.5">Executive</th>
                <th className="p-3.5">Base Salary</th>
                <th className="p-3.5">Sales Quota (Calls / Mtgs / Rev)</th>
                <th className="p-3.5">Actual Activity</th>
                <th className="p-3.5">Deals Won</th>
                <th className="p-3.5">Closed Volume</th>
                <th className="p-3.5">Commission</th>
                <th className="p-3.5">Net Payout</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E5E0]">
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-[#8C908A]">Calculating monthly commissions &amp; payroll...</td>
                </tr>
              ) : staff.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-[#8C908A]">No sales staff found for this period.</td>
                </tr>
              ) : (
                staff.map((s) => (
                  <tr key={s.userId} className="hover:bg-[#FAF9F5] transition">
                    <td className="p-3.5">
                      <div className="font-bold text-[#171817]">{s.name}</div>
                      <div className="text-[11px] text-[#8C908A]">{s.teamName} • {s.designation}</div>
                    </td>
                    <td className="p-3.5 font-mono text-[#171817] tabular-nums">
                      ₹{s.baseSalary.toLocaleString('en-IN')}
                    </td>
                    <td className="p-3.5 text-[#626560] text-[11px]">
                      <div>Calls: <span className="font-semibold text-[#171817] tabular-nums">{s.targetCalls}</span></div>
                      <div>Mtgs: <span className="font-semibold text-[#171817] tabular-nums">{s.targetMeetings}</span></div>
                      <div>Quota: <span className="font-semibold text-[#171817] tabular-nums">₹{(s.targetRevenue / 100000).toFixed(1)}L</span></div>
                    </td>
                    <td className="p-3.5 text-[#626560] text-[11px]">
                      <div>{s.callsCompletedCount} Calls completed</div>
                      <div>{s.meetingsCount} Meetings conducted</div>
                    </td>
                    <td className="p-3.5">
                      <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-[#F0F7F2] text-[#2D5A3C] border border-[#2D5A3C]/20 tabular-nums">
                        {s.closedDealsCount} Won
                      </span>
                    </td>
                    <td className="p-3.5 font-bold font-mono text-[#171817] tabular-nums">
                      ₹{s.closedRevenue.toLocaleString('en-IN')}
                    </td>
                    <td className="p-3.5 font-mono text-[#2D5A3C] font-bold tabular-nums">
                      ₹{s.commissionEarned.toLocaleString('en-IN')}
                      <span className="text-[10px] font-normal text-[#8C908A] block">({s.commissionRate}%)</span>
                    </td>
                    <td className="p-3.5 font-mono font-black text-[#171817] tabular-nums">
                      ₹{s.netPayout.toLocaleString('en-IN')}
                    </td>
                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => handleOpenTargetModal(s)}
                        className="px-2.5 py-1 rounded-lg bg-[#F4F4F1] hover:bg-[#E5E5E0] text-[#171817] border border-[#E5E5E0] text-xs font-semibold inline-flex items-center gap-1 transition cursor-pointer"
                      >
                        <Edit2 className="w-3 h-3 text-[#B69A63]" /> Edit Quota
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Target / Quota Modal */}
      {selectedStaffForTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-[#E5E5E0]">
            <h3 className="text-base font-bold text-[#171817] mb-1">Set Sales Quotas &amp; Commission Slab</h3>
            <p className="text-xs text-[#626560] mb-4">
              Configuring performance expectations for <strong className="text-[#171817]">{selectedStaffForTarget.name}</strong> for {selectedPeriod}.
            </p>

            <form onSubmit={handleSaveTarget} className="space-y-3.5">
              {saveError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                  {saveError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#171817] mb-1">Monthly Calls Target</label>
                  <input
                    type="number"
                    value={targetForm.targetCalls}
                    onChange={(e) => setTargetForm({ ...targetForm, targetCalls: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#171817] mb-1">Monthly Meetings Target</label>
                  <input
                    type="number"
                    value={targetForm.targetMeetings}
                    onChange={(e) => setTargetForm({ ...targetForm, targetMeetings: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#171817] mb-1">Revenue Target (₹)</label>
                  <input
                    type="number"
                    value={targetForm.targetRevenue}
                    onChange={(e) => setTargetForm({ ...targetForm, targetRevenue: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#171817] mb-1">Commission Rate (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={targetForm.commissionRate}
                    onChange={(e) => setTargetForm({ ...targetForm, commissionRate: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#171817] mb-1">Milestone Bonus (₹)</label>
                  <input
                    type="number"
                    value={targetForm.bonus}
                    onChange={(e) => setTargetForm({ ...targetForm, bonus: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#171817] mb-1">Deductions / Penalties (₹)</label>
                  <input
                    type="number"
                    value={targetForm.deductions}
                    onChange={(e) => setTargetForm({ ...targetForm, deductions: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-[#F4F4F1] flex items-center justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setSelectedStaffForTarget(null)} disabled={isSaving}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save Quotas & Rates'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
