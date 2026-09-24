'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Sparkles,
  ShieldCheck,
  Timer,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { emitCrmSync, useCrmSync } from '@/lib/sync-event';

interface AttendanceRecord {
  id: string;
  userId: string;
  date: string;
  status: string; // "PRESENT", "HALF_DAY", "ABSENT", "ON_LEAVE", "ON_FIELD"
  clockIn?: string | null;
  clockOut?: string | null;
  workHours?: number | null;
  notes?: string | null;
}

interface AttendanceWidgetProps {
  className?: string;
  compact?: boolean;
}

export const AttendanceWidget: React.FC<AttendanceWidgetProps> = ({
  className = '',
  compact = false,
}) => {
  const [attendance, setAttendance] = useState<AttendanceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [elapsedText, setElapsedText] = useState<string>('');
  const [isPast1010, setIsPast1010] = useState<boolean>(false);
  const [isMarkInAvailable, setIsMarkInAvailable] = useState<boolean>(false);

  // Check current time against 09:30 AM availability gate and 10:10 AM cutoff
  useEffect(() => {
    const checkCutoff = () => {
      try {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', {
          timeZone: 'Asia/Kolkata',
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
        });
        const [h, m] = timeStr.split(':').map(Number);
        setIsPast1010(h > 10 || (h === 10 && m > 10));
        setIsMarkInAvailable(h > 9 || (h === 9 && m >= 30));
      } catch {
        const now = new Date();
        setIsPast1010(now.getHours() > 10 || (now.getHours() === 10 && now.getMinutes() > 10));
        setIsMarkInAvailable(now.getHours() > 9 || (now.getHours() === 9 && now.getMinutes() >= 30));
      }
    };

    checkCutoff();
    const interval = setInterval(checkCutoff, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchAttendance = useCallback(async () => {
    try {
      const res = await fetch('/api/hr/attendance?mode=me');
      if (res.ok) {
        const json = await res.json();
        setAttendance(json.attendance || null);
      }
    } catch (err) {
      console.error('Failed to load attendance:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  useCrmSync(['all'], () => {
    fetchAttendance();
  });

  // Calculate live elapsed work timer if clocked in
  useEffect(() => {
    if (!attendance?.clockIn || attendance?.clockOut) {
      setElapsedText('');
      return;
    }

    const updateTimer = () => {
      const start = new Date(attendance.clockIn!).getTime();
      const now = Date.now();
      const diffMs = Math.max(0, now - start);
      const diffSec = Math.floor(diffMs / 1000);
      const hrs = Math.floor(diffSec / 3600);
      const mins = Math.floor((diffSec % 3600) / 60);
      setElapsedText(`${String(hrs).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m`);
    };

    updateTimer();
    const timer = setInterval(updateTimer, 60000);
    return () => clearInterval(timer);
  }, [attendance?.clockIn, attendance?.clockOut]);

  const handleClockInOut = async (action: 'CLOCK_IN' | 'CLOCK_OUT') => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/hr/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (res.ok) {
        const json = await res.json();
        setAttendance(json.record || null);
        emitCrmSync('all');
      }
    } catch (err) {
      console.error('Clock in/out failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const isMarkedIn = Boolean(attendance?.clockIn && !attendance?.clockOut);
  const isMarkedOut = Boolean(attendance?.clockIn && attendance?.clockOut);

  const formatTime = (isoString?: string | null) => {
    if (!isoString) return '—';
    try {
      return new Date(isoString).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '—';
    }
  };

  if (compact) {
    return (
      <div
        className={`flex items-center gap-2 p-2 rounded-xl border bg-white shadow-xs ${className}`}
      >
        {isMarkedIn ? (
          <>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="text-xs font-bold text-emerald-800">
              {attendance?.status === 'HALF_DAY' ? 'Half Day' : 'Present'} ({formatTime(attendance?.clockIn)})
            </span>
            {elapsedText && (
              <span className="text-[11px] text-zinc-500 font-mono font-semibold bg-zinc-100 px-1.5 py-0.5 rounded">
                {elapsedText}
              </span>
            )}
            <button
              onClick={() => handleClockInOut('CLOCK_OUT')}
              disabled={submitting}
              className="text-[11px] font-semibold text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-1 rounded-lg transition-colors ml-auto"
            >
              Mark Out
            </button>
          </>
        ) : isMarkedOut ? (
          <>
            <span className="w-2 h-2 rounded-full bg-zinc-400 shrink-0" />
            <span className="text-xs font-semibold text-zinc-700">
              Shift Ended ({attendance?.workHours || 0} hrs)
            </span>
          </>
        ) : (
          <>
            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
            <span className="text-xs text-zinc-600 font-medium">
              {isPast1010 ? 'Late check-in (Half Day)' : 'Not Marked In'}
            </span>
            <button
              onClick={() => handleClockInOut('CLOCK_IN')}
              disabled={submitting || !isMarkInAvailable}
              className="text-[11px] font-bold text-white bg-[#171817] hover:bg-[#B69A63] px-2.5 py-1 rounded-lg transition-colors ml-auto disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isMarkInAvailable ? 'Mark In' : '9:30 AM'}
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border bg-white p-4 shadow-xs transition-all ${
        isMarkedIn
          ? attendance?.status === 'HALF_DAY'
            ? 'border-amber-300 bg-linear-to-r from-amber-50/50 via-white to-white'
            : 'border-emerald-200 bg-linear-to-r from-emerald-50/40 via-white to-white'
          : isMarkedOut
          ? 'border-zinc-200 bg-[#FBFBFA]'
          : 'border-[#E5E5E0] bg-[#FAF9F5]'
      } ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Left Status & Details */}
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
              isMarkedIn
                ? attendance?.status === 'HALF_DAY'
                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                : isMarkedOut
                ? 'bg-zinc-100 text-zinc-600 border-zinc-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}
          >
            {isMarkedIn ? (
              <Clock className="w-5 h-5 animate-pulse" />
            ) : isMarkedOut ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            ) : (
              <Timer className="w-5 h-5" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-bold text-sm text-[#171817]">Daily Shift Attendance</h4>
              {isMarkedIn ? (
                <span
                  className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                    attendance?.status === 'HALF_DAY'
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                  }`}
                >
                  {attendance?.status === 'HALF_DAY' ? 'HALF DAY (LATE CHECK-IN)' : 'PRESENT (FULL DAY)'}
                </span>
              ) : isMarkedOut ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700 border border-zinc-200">
                  SHIFT COMPLETED • {attendance?.status}
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                  NOT MARKED IN
                </span>
              )}
            </div>

            {/* Subtitle / Rules description */}
            {(isMarkedIn || (!isMarkedOut && !isPast1010)) && <p className="text-xs text-[#626560] mt-0.5">
              {isMarkedIn ? (
                <span>
                  Marked In: <strong className="text-[#171817]">{formatTime(attendance?.clockIn)}</strong>
                  {elapsedText && ` • On Duty: ${elapsedText}`} • Auto mark-out at 6:30 PM
                </span>
              ) : isMarkInAvailable ? (
                <span className="text-emerald-800 font-medium flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  Mark in before <strong>10:10 AM</strong> for full day attendance.
                </span>
              ) : (
                <span className="text-amber-800 font-medium flex items-center gap-1">
                  <Timer className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  Daily mark-in opens at <strong>9:30 AM</strong>.
                </span>
              )}
            </p>}
          </div>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          {!isMarkedIn && !isMarkedOut && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => handleClockInOut('CLOCK_IN')}
              isLoading={submitting}
              disabled={!isMarkInAvailable}
              className="px-4 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Clock className="w-3.5 h-3.5 mr-1" />
              {isMarkInAvailable ? 'Mark In Now' : 'Available from 9:30 AM'}
            </Button>
          )}

          {isMarkedIn && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleClockInOut('CLOCK_OUT')}
              isLoading={submitting}
              className="text-rose-700 border-rose-200 hover:bg-rose-50"
            >
              <LogOut className="w-3.5 h-3.5 mr-1" />
              Mark Out (6:30 PM)
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
