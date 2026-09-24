'use client';

import React, { useState, useEffect } from 'react';
import {
  Clock,
  Calendar,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MapPin,
  Play,
  Square,
  RefreshCw,
  Edit,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { getFastCache, setFastCache } from '@/lib/fast-data';
import { useCrmSync, emitCrmSync } from '@/lib/sync-event';
import { AttendanceExportModal } from '@/components/attendance/AttendanceExportModal';

interface AttendanceRosterItem {
  userId: string;
  name: string;
  email: string;
  role: string;
  designation?: string | null;
  department?: string | null;
  teamName?: string | null;
  routingAvailable: boolean;
  attendanceId?: string | null;
  date: string;
  status: string;
  clockIn?: string | null;
  clockOut?: string | null;
  workHours?: number | null;
  notes?: string | null;
}

interface AttendancePageCache {
  roster: AttendanceRosterItem[];
  summary: {
    total: number;
    present: number;
    absent: number;
    onLeave: number;
    halfDay: number;
    onField: number;
    notLogged: number;
  };
}

export default function AttendanceShiftsPage() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const cacheKey = `crm:hr:attendance:${selectedDate}`;

  const [roster, setRoster] = useState<AttendanceRosterItem[]>([]);
  const [summary, setSummary] = useState({
    total: 0,
    present: 0,
    absent: 0,
    onLeave: 0,
    halfDay: 0,
    onField: 0,
    notLogged: 0,
  });
  const [loading, setLoading] = useState(false);
  const [clockActionLoading, setClockActionLoading] = useState(false);

  const fetchAttendance = async (isBackground: boolean | unknown = false) => {
    const isBg = isBackground === true;
    const currentKey = `crm:hr:attendance:${selectedDate}`;
    const cached = getFastCache<AttendancePageCache>(currentKey);
    if (!cached && !isBg) {
      setLoading(true);
    }
    try {
      const res = await fetch(`/api/hr/attendance?date=${selectedDate}`);
      if (res.ok) {
        const json = await res.json();
        const payload: AttendancePageCache = {
          roster: json.roster || [],
          summary: {
            total: json.total || 0,
            present: json.present || 0,
            absent: json.absent || 0,
            onLeave: json.onLeave || 0,
            halfDay: json.halfDay || 0,
            onField: json.onField || 0,
            notLogged: json.notLogged || 0,
          },
        };
        setRoster(payload.roster);
        setSummary(payload.summary);
        setFastCache(currentKey, payload, 60000);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const cached = getFastCache<AttendancePageCache>(cacheKey);
    if (cached) {
      setRoster(cached.roster);
      setSummary(cached.summary);
      setLoading(false);
      fetchAttendance(true);
    } else {
      fetchAttendance(false);
    }
    const handleFocus = () => fetchAttendance(true);
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [selectedDate, cacheKey]);

  useCrmSync(['attendance', 'hr', 'all'], () => {
    fetchAttendance(true);
  });

  const handleSelfClock = async (action: 'CLOCK_IN' | 'CLOCK_OUT') => {
    setClockActionLoading(true);
    try {
      const res = await fetch('/api/hr/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        emitCrmSync('attendance');
        emitCrmSync('hr');
        fetchAttendance(true);
      }
    } finally {
      setClockActionLoading(false);
    }
  };

  const handleSetStatus = async (userId: string, status: string) => {
    const res = await fetch('/api/hr/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        date: selectedDate,
        status,
      }),
    });
    if (res.ok) {
      emitCrmSync('attendance');
      emitCrmSync('hr');
      fetchAttendance(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E5E0]">
        <div>
          <h2 className="text-xl font-bold text-[#171817] flex items-center gap-2">
            <Clock className="w-5 h-5 text-[#B69A63]" /> Attendance, Shifts &amp; Availability
          </h2>
          <p className="text-xs text-[#626560] mt-1">
            Real-time daily roster. When an executive is absent or on leave, lead routing is automatically paused.
          </p>
        </div>

        {/* Controls: Export + Self Clock Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-1.5 cursor-pointer font-bold"
          >
            <Download className="w-3.5 h-3.5 text-[#B69A63]" />
            <span>Export Sheet</span>
          </Button>

          <Button
            size="sm"
            onClick={() => handleSelfClock('CLOCK_IN')}
            isLoading={clockActionLoading}
            variant="primary"
            className="flex items-center gap-1"
          >
            <Play className="w-3.5 h-3.5" /> Mark In
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => handleSelfClock('CLOCK_OUT')}
            isLoading={clockActionLoading}
            className="flex items-center gap-1"
          >
            <Square className="w-3.5 h-3.5" /> Mark Out
          </Button>
        </div>
      </div>

      {/* Date Bar & Summary Pills */}
      <div className="p-4 rounded-2xl bg-white border border-[#E5E5E0] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <label className="text-xs font-bold text-[#171817]">Date:</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
          />
          <Button size="sm" variant="secondary" onClick={fetchAttendance} isLoading={loading}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Count Summary */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-lg bg-[#F0F7F2] text-[#2D5A3C] border border-[#2D5A3C]/20 font-semibold tabular-nums">
            {summary.present} Present
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-[#FDF2F2] text-[#8C3333] border border-[#8C3333]/20 font-semibold tabular-nums">
            {summary.absent} Absent
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-[#FAF8F5] text-[#B69A63] border border-[#B69A63]/20 font-semibold tabular-nums">
            {summary.onLeave} On Leave
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-[#F4F4F1] text-[#171817] border border-[#E5E5E0] font-semibold tabular-nums">
            {summary.onField} On Field
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-[#F8F8F6] text-[#626560] border border-[#E5E5E0] font-semibold tabular-nums">
            {summary.notLogged} Not Logged
          </span>
        </div>
      </div>

      {/* Attendance Roster Table */}
      <div className="rounded-2xl bg-white border border-[#E5E5E0] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#F8F8F6] border-b border-[#E5E5E0] text-[#626560] font-bold uppercase tracking-wider text-[11px]">
                <th className="p-3.5">Employee</th>
                <th className="p-3.5">Department / Team</th>
                <th className="p-3.5">Today Status</th>
                <th className="p-3.5">Mark In</th>
                <th className="p-3.5">Mark Out</th>
                <th className="p-3.5">Work Hours</th>
                <th className="p-3.5">Lead Routing</th>
                <th className="p-3.5 text-right">Override Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E5E0]">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-[#8C908A]">Loading attendance roster...</td>
                </tr>
              ) : roster.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-[#8C908A]">No active employees found.</td>
                </tr>
              ) : (
                roster.map((item) => (
                  <tr key={item.userId} className="hover:bg-[#FAF9F5] transition">
                    <td className="p-3.5">
                      <div className="font-bold text-[#171817]">{item.name}</div>
                      <div className="text-[11px] text-[#8C908A]">{item.designation || item.role}</div>
                    </td>
                    <td className="p-3.5 text-[#626560]">
                      <div>{item.department || 'General'}</div>
                      {item.teamName && (
                        <div className="text-[11px] text-[#B69A63] font-medium">{item.teamName}</div>
                      )}
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold border inline-block ${
                          item.status === 'PRESENT'
                            ? 'bg-[#F0F7F2] text-[#2D5A3C] border-[#2D5A3C]/20'
                            : item.status === 'ABSENT'
                            ? 'bg-[#FDF2F2] text-[#8C3333] border-[#8C3333]/20'
                            : item.status === 'ON_LEAVE'
                            ? 'bg-[#FAF8F5] text-[#B69A63] border-[#B69A63]/20'
                            : item.status === 'ON_FIELD'
                            ? 'bg-[#F4F4F1] text-[#171817] border-[#E5E5E0]'
                            : 'bg-[#F8F8F6] text-[#626560] border-[#E5E5E0]'
                        }`}
                      >
                        {item.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono text-[#171817] tabular-nums">
                      {item.clockIn ? new Date(item.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="p-3.5 font-mono text-[#171817] tabular-nums">
                      {item.clockOut ? new Date(item.clockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="p-3.5 font-mono text-[#171817] tabular-nums">
                      {item.workHours !== null && item.workHours !== undefined ? `${item.workHours} hrs` : '—'}
                    </td>
                    <td className="p-3.5">
                      {item.role === 'EXECUTIVE' ? (
                        <span
                          className={`text-[11px] font-bold flex items-center gap-1 ${
                            item.routingAvailable ? 'text-[#2D5A3C]' : 'text-[#8C3333]'
                          }`}
                        >
                          {item.routingAvailable ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" /> Active
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3.5 h-3.5" /> Paused
                            </>
                          )}
                        </span>
                      ) : (
                        <span className="text-[#8C908A] text-[11px]">N/A</span>
                      )}
                    </td>
                    <td className="p-3.5 text-right">
                      <select
                        value={item.status}
                        onChange={(e) => handleSetStatus(item.userId, e.target.value)}
                        className="px-2 py-1 text-[11px] rounded-lg border border-[#E5E5E0] text-[#171817] bg-white focus:outline-none focus:border-[#B69A63]"
                      >
                        <option value="PRESENT">Present</option>
                        <option value="ABSENT">Absent</option>
                        <option value="ON_LEAVE">On Leave</option>
                        <option value="ON_FIELD">On Field</option>
                        <option value="HALF_DAY">Half Day</option>
                      </select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Export Attendance Register Modal */}
      <AttendanceExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        currentSelectedDate={selectedDate}
      />
    </div>
  );
}
