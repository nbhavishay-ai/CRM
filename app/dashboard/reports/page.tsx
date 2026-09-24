'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, TrendingUp, RefreshCw, Award, Download } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { generateCSV, downloadCSV, ExportColumn } from '@/lib/export-utils';
import { getFastCache, setFastCache } from '@/lib/fast-data';
import { useCrmSync } from '@/lib/sync-event';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

interface ReportData {
  timeframe: string;
  metrics: {
    totalLeadsReceived: number;
    closedWon: number;
    closedLost: number;
    interested: number;
    notAnswering: number;
    notInterested: number;
    meetingsScheduled: number;
    meetingsCompleted: number;
    followupsCompleted: number;
    reassignedCount: number;
    conversionRate: string;
  };
  executiveBreakdown: Array<{
    id: string;
    name: string;
    teamName: string;
    activeLeads: number;
    closedWon: number;
    meetings: number;
  }>;
}

export default function ReportsPage() {
  const [timeframe, setTimeframe] = useState<'weekly' | 'monthly'>('weekly');
  const cacheKey = `crm:reports:${timeframe}`;

  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchReport = useCallback(async (isBackground: boolean | unknown = false) => {
    const isBg = isBackground === true;
    const currentKey = `crm:reports:${timeframe}`;
    const cached = getFastCache<ReportData>(currentKey);
    if (!cached && !isBg) {
      setLoading(true);
    }
    try {
      const res = await fetch(`/api/reports?timeframe=${timeframe}`);
      if (res.ok) {
        const json = await res.json();
        const data = json.report;
        setReport(data);
        if (data) {
          setFastCache(currentKey, data, 60000);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [timeframe]);

  useEffect(() => {
    const cached = getFastCache<ReportData>(cacheKey);
    if (cached) {
      setReport(cached);
      setLoading(false);
      fetchReport(true);
    } else {
      fetchReport(false);
    }
    const handleFocus = () => fetchReport(true);
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchReport, cacheKey]);

  useCrmSync(['leads', 'calling', 'meetings', 'metrics', 'all'], () => {
    fetchReport(true);
  });

  const m = report?.metrics;

  const funnelData = m
    ? [
        { name: 'Received', value: m.totalLeadsReceived, fill: '#626560' },
        { name: 'Interested', value: m.interested, fill: '#B69A63' },
        { name: 'Meetings', value: m.meetingsScheduled, fill: '#8E918B' },
        { name: 'Followups', value: m.followupsCompleted, fill: '#17191A' },
        { name: 'Deals Won', value: m.closedWon, fill: '#2D5A3C' },
      ]
    : [];

  const handleExportCSV = () => {
    if (!report || !report.executiveBreakdown) return;
    const columns: ExportColumn<ReportData['executiveBreakdown'][0]>[] = [
      { header: 'Executive Name', accessor: (e) => e.name },
      { header: 'Team', accessor: (e) => e.teamName },
      { header: 'Active Leads Pipeline', accessor: (e) => e.activeLeads },
      { header: 'Meetings Conducted', accessor: (e) => e.meetings },
      { header: 'Deals Closed Won', accessor: (e) => e.closedWon },
    ];
    const csv = generateCSV(report.executiveBreakdown, columns);
    downloadCSV(`orvion_executive_performance_${timeframe}_${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E5E0]">
        <div>
          <h2 className="text-xl font-bold text-[#171817] flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#B69A63]" /> Performance &amp; Conversion Analytics
          </h2>
          <p className="text-xs text-[#626560] mt-1">
            Real data metrics calculated dynamically from database transaction logs. Zero fabricated numbers.
          </p>
        </div>

        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
          <div className="flex rounded-xl bg-[#F8F8F6] border border-[#E5E5E0] p-1">
            <button
              onClick={() => setTimeframe('weekly')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer select-none ${
                timeframe === 'weekly'
                  ? 'bg-[#111314] text-[#F4F2EC] font-bold shadow-xs'
                  : 'text-[#626560] hover:text-[#171817]'
              }`}
            >
              Past 7 Days
            </button>
            <button
              onClick={() => setTimeframe('monthly')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer select-none ${
                timeframe === 'monthly'
                  ? 'bg-[#111314] text-[#F4F2EC] font-bold shadow-xs'
                  : 'text-[#626560] hover:text-[#171817]'
              }`}
            >
              Past 30 Days
            </button>
          </div>

          <Button size="sm" variant="outline" onClick={handleExportCSV} disabled={!report}>
            <Download className="w-3.5 h-3.5 mr-1 text-[#B69A63]" /> Export CSV
          </Button>

          <Button size="sm" variant="secondary" onClick={fetchReport} isLoading={loading}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Metrics Summary Grid */}
      {m && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
          <div className="p-4 rounded-2xl bg-white border border-[#E5E5E0] shadow-xs">
            <span className="text-[11px] text-[#626560] font-medium">Deals Closed (Won)</span>
            <p className="text-2xl font-bold text-[#2D5A3C] mt-1 flex items-center gap-1.5 tabular-nums">
              <Award className="w-5 h-5 text-[#2D5A3C]" /> {m.closedWon}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-[#E5E5E0] shadow-xs">
            <span className="text-[11px] text-[#626560] font-medium">Conversion Rate</span>
            <p className="text-2xl font-bold text-[#171817] mt-1 tabular-nums">{m.conversionRate}%</p>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-[#E5E5E0] shadow-xs">
            <span className="text-[11px] text-[#626560] font-medium">Leads Received</span>
            <p className="text-2xl font-bold text-[#171817] mt-1 tabular-nums">{m.totalLeadsReceived}</p>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-[#E5E5E0] shadow-xs">
            <span className="text-[11px] text-[#626560] font-medium">Meetings Completed</span>
            <p className="text-2xl font-bold text-[#171817] mt-1 tabular-nums">{m.meetingsCompleted}</p>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-[#E5E5E0] shadow-xs">
            <span className="text-[11px] text-[#626560] font-medium">Follow-ups Logged</span>
            <p className="text-2xl font-bold text-[#7A5B28] mt-1 tabular-nums">{m.followupsCompleted}</p>
          </div>
        </div>
      )}

      {/* Funnel Chart */}
      <div className="rounded-2xl bg-white border border-[#E5E5E0] p-5 space-y-4 shadow-xs">
        <h3 className="text-xs font-bold text-[#171817] uppercase tracking-wider flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[#B69A63]" /> Pipeline Funnel Distribution
        </h3>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={funnelData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E0" vertical={false} />
              <XAxis dataKey="name" stroke="#626560" fontSize={11} tickLine={false} />
              <YAxis stroke="#626560" fontSize={11} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#111314',
                  borderColor: '#252829',
                  borderRadius: '12px',
                  fontSize: '12px',
                  color: '#F4F2EC',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                }}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Executive Performance Breakdown Table */}
      {report?.executiveBreakdown && report.executiveBreakdown.length > 0 && (
        <div className="rounded-2xl border border-[#E5E5E0] bg-white overflow-hidden shadow-xs">
          <div className="px-4 py-3 bg-[#F8F8F6] border-b border-[#E5E5E0] font-bold text-xs text-[#171817]">
            Executive Productivity &amp; Deal Closures
          </div>
          <table className="w-full text-left text-xs text-[#626560]">
            <thead className="bg-[#F8F8F6] text-[11px] font-bold text-[#626560] uppercase tracking-wider border-b border-[#E5E5E0]">
              <tr>
                <th className="px-4 py-3">Executive</th>
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3">Active Pipeline</th>
                <th className="px-4 py-3">Meetings</th>
                <th className="px-4 py-3">Closed Won</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E5E0]">
              {report.executiveBreakdown.map((exec) => (
                <tr key={exec.id} className="hover:bg-[#FAF9F5] transition-colors">
                  <td className="px-4 py-3 font-semibold text-[#171817]">{exec.name}</td>
                  <td className="px-4 py-3 text-[#626560]">{exec.teamName}</td>
                  <td className="px-4 py-3 text-[#171817] font-bold tabular-nums">{exec.activeLeads}</td>
                  <td className="px-4 py-3 text-[#171817] font-bold tabular-nums">{exec.meetings}</td>
                  <td className="px-4 py-3 text-[#2D5A3C] font-extrabold tabular-nums">{exec.closedWon}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
