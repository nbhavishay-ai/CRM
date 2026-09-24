'use client';

import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  User,
  Phone,
  Video,
  Building2,
  CheckCircle2,
  Download,
  Share2,
  ExternalLink,
  Plus,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { generateICS, downloadICS, buildGoogleCalendarUrl } from '@/lib/calendar-utils';

export interface MeetingItem {
  id: string;
  leadId: string;
  scheduledAt: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  meetingType: string;
  location?: string | null;
  notes?: string | null;
  status: string;
  outcome?: string | null;
  lead: {
    id: string;
    leadNumber: string;
    clientName: string;
    phone: string;
    currentStatus: string;
  };
  createdBy: {
    id: string;
    name: string;
    email: string;
    team?: { id: string; name: string } | null;
  };
}

interface MeetingsCalendarProps {
  meetings: MeetingItem[];
  onCompleteMeeting: (meeting: MeetingItem) => void;
  onRefresh: () => void;
}

function formatCalendarDate(dateString: string): string {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export const MeetingsCalendar: React.FC<MeetingsCalendarProps> = ({
  meetings,
  onCompleteMeeting,
  onRefresh,
}) => {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  // Month navigation
  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const jumpToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDateStr(today.toISOString().split('T')[0]);
  };

  // Group meetings by date string (YYYY-MM-DD)
  const meetingsByDate = useMemo(() => {
    const map = new Map<string, MeetingItem[]>();
    meetings.forEach((m) => {
      const existing = map.get(m.date) || [];
      existing.push(m);
      map.set(m.date, existing);
    });
    return map;
  }, [meetings]);

  // Generate calendar grid days
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sun
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDaysCount = new Date(year, month, 0).getDate();

    const days: {
      dateStr: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      meetings: MeetingItem[];
    }[] = [];

    const todayStr = new Date().toISOString().split('T')[0];

    // Previous month padding days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = prevMonthDaysCount - i;
      const prevDate = new Date(year, month - 1, d);
      const dStr = prevDate.toISOString().split('T')[0];
      days.push({
        dateStr: dStr,
        dayNumber: d,
        isCurrentMonth: false,
        isToday: dStr === todayStr,
        meetings: meetingsByDate.get(dStr) || [],
      });
    }

    // Current month days
    for (let i = 1; i <= totalDaysInMonth; i++) {
      const curDate = new Date(year, month, i);
      // Format as YYYY-MM-DD local
      const monthStr = String(month + 1).padStart(2, '0');
      const dayStr = String(i).padStart(2, '0');
      const dStr = `${year}-${monthStr}-${dayStr}`;

      days.push({
        dateStr: dStr,
        dayNumber: i,
        isCurrentMonth: true,
        isToday: dStr === todayStr,
        meetings: meetingsByDate.get(dStr) || [],
      });
    }

    // Next month padding days to complete 35 or 42 grid cells
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const nextDate = new Date(year, month + 1, i);
      const nextMonthStr = String(month + 2 > 12 ? 1 : month + 2).padStart(2, '0');
      const nextYear = month + 2 > 12 ? year + 1 : year;
      const dayStr = String(i).padStart(2, '0');
      const dStr = `${nextYear}-${nextMonthStr}-${dayStr}`;
      days.push({
        dateStr: dStr,
        dayNumber: i,
        isCurrentMonth: false,
        isToday: dStr === todayStr,
        meetings: meetingsByDate.get(dStr) || [],
      });
    }

    return days;
  }, [year, month, meetingsByDate]);

  // Selected date meetings
  const selectedDayMeetings = useMemo(() => {
    return meetingsByDate.get(selectedDateStr) || [];
  }, [selectedDateStr, meetingsByDate]);

  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  const getMeetingTypeBadge = (type: string) => {
    switch (type.toLowerCase()) {
      case 'site visit':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'office visit':
      case 'boardroom':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'online':
      case 'video presentation':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      default:
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
  };

  const handleExportICS = (m: MeetingItem) => {
    const ics = generateICS({
      title: `${m.meetingType}: ${m.lead.clientName}`,
      description: `Client: ${m.lead.clientName} (${m.lead.phone})\nScheduled by: ${m.createdBy.name}\nNotes: ${m.notes || 'N/A'}`,
      location: m.location || 'ORVION Sales Gallery',
      startDate: m.date,
      startTime: m.time,
      durationMinutes: 45,
      clientName: m.lead.clientName,
      clientPhone: m.lead.phone,
    });
    downloadICS(`meeting-${m.lead.clientName.replace(/\s+/g, '_')}-${m.date}.ics`, ics);
  };

  const handleGoogleCalendar = (m: MeetingItem) => {
    const url = buildGoogleCalendarUrl({
      title: `${m.meetingType}: ${m.lead.clientName} (${m.lead.leadNumber})`,
      description: `Client: ${m.lead.clientName}\nPhone: ${m.lead.phone}\nScheduled by: ${m.createdBy.name}\nNotes: ${m.notes || 'None'}`,
      location: m.location || 'ORVION Sales Gallery',
      startDate: m.date,
      startTime: m.time,
      durationMinutes: 45,
    });
    window.open(url, '_blank');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Calendar Grid (8 cols on large screens) */}
      <div className="lg:col-span-8 bg-white rounded-2xl border border-[#E5E5E0] shadow-sm overflow-hidden flex flex-col">
        {/* Month Toolbar */}
        <div className="p-4 border-b border-[#E5E5E0] flex items-center justify-between bg-[#FBFBFA]">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-bold text-[#171817] tracking-tight">{monthName}</h3>
            <span className="text-xs bg-[#F4F4F0] text-[#626560] px-2.5 py-0.5 rounded-full font-semibold border border-[#E5E5E0]">
              {meetings.length} Total Meetings
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={jumpToToday}>
              Today
            </Button>
            <div className="flex items-center border border-[#E5E5E0] rounded-lg bg-white overflow-hidden">
              <button
                onClick={prevMonth}
                className="p-1.5 hover:bg-zinc-100 text-zinc-600 transition-colors"
                title="Previous Month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="w-px h-5 bg-zinc-200" />
              <button
                onClick={nextMonth}
                className="p-1.5 hover:bg-zinc-100 text-zinc-600 transition-colors"
                title="Next Month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Days of Week Header */}
        <div className="grid grid-cols-7 border-b border-[#E5E5E0] bg-[#F7F7F5] text-center text-[11px] font-bold text-[#626560] py-2">
          <span>SUN</span>
          <span>MON</span>
          <span>TUE</span>
          <span>WED</span>
          <span>THU</span>
          <span>FRI</span>
          <span>SAT</span>
        </div>

        {/* Month Grid Cells */}
        <div className="grid grid-cols-7 auto-rows-fr bg-[#E5E5E0] gap-px flex-1">
          {calendarDays.map((day, idx) => {
            const isSelected = day.dateStr === selectedDateStr;
            const hasMeetings = day.meetings.length > 0;

            return (
              <div
                key={`${day.dateStr}-${idx}`}
                onClick={() => setSelectedDateStr(day.dateStr)}
                className={`min-h-[85px] p-2 transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-[#FAF8F5] ring-2 ring-[#B69A63] ring-inset z-10'
                    : day.isCurrentMonth
                    ? 'bg-white hover:bg-zinc-50/80'
                    : 'bg-[#FBFBFA] text-zinc-400'
                }`}
              >
                {/* Cell Header */}
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-semibold rounded-full w-6 h-6 flex items-center justify-center ${
                      day.isToday
                        ? 'bg-[#171817] text-white'
                        : isSelected
                        ? 'text-[#B69A63] font-bold'
                        : day.isCurrentMonth
                        ? 'text-zinc-700'
                        : 'text-zinc-400'
                    }`}
                  >
                    {day.dayNumber}
                  </span>

                  {hasMeetings && (
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800">
                      {day.meetings.length}
                    </span>
                  )}
                </div>

                {/* Meeting Pills Preview */}
                <div className="space-y-1 mt-1 overflow-hidden">
                  {day.meetings.slice(0, 2).map((m) => (
                    <div
                      key={m.id}
                      className={`text-[10px] px-1.5 py-0.5 rounded truncate font-medium border ${getMeetingTypeBadge(
                        m.meetingType
                      )}`}
                      title={`${m.time} - ${m.lead.clientName} (${m.meetingType})`}
                    >
                      {m.time} {m.lead.clientName}
                    </div>
                  ))}
                  {day.meetings.length > 2 && (
                    <div className="text-[9px] font-semibold text-zinc-500 pl-1">
                      +{day.meetings.length - 2} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Day Agenda Panel (4 cols on large screens) */}
      <div className="lg:col-span-4 bg-white rounded-2xl border border-[#E5E5E0] shadow-sm p-4 flex flex-col">
        <div className="pb-3 border-b border-[#E5E5E0] flex items-center justify-between">
          <div>
            <h4 className="font-bold text-sm text-[#171817] flex items-center gap-1.5">
              <CalendarIcon className="w-4 h-4 text-[#B69A63]" /> Daily Schedule
            </h4>
            <p className="text-xs text-[#626560] mt-0.5">
              {formatCalendarDate(selectedDateStr)}
            </p>
          </div>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#F4F4F0] text-zinc-700">
            {selectedDayMeetings.length} Scheduled
          </span>
        </div>

        {/* Selected Day Meetings List */}
        <div className="mt-3 space-y-3 overflow-y-auto flex-1 max-h-[500px]">
          {selectedDayMeetings.length === 0 ? (
            <div className="py-12 text-center text-zinc-400 text-xs">
              <Clock className="w-8 h-8 mx-auto text-zinc-300 mb-2" />
              <p className="font-semibold text-zinc-600">No meetings for this day</p>
              <p className="text-zinc-400 mt-0.5">Select another date on the calendar</p>
            </div>
          ) : (
            selectedDayMeetings.map((m) => (
              <div
                key={m.id}
                className="p-3.5 rounded-xl border border-[#E5E5E0] bg-[#FBFBFA] space-y-2.5 hover:border-[#B69A63]/50 transition-all shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getMeetingTypeBadge(
                        m.meetingType
                      )}`}
                    >
                      {m.meetingType}
                    </span>
                    <h5 className="font-bold text-sm text-[#171817] mt-1.5">
                      {m.lead.clientName}
                    </h5>
                    <div className="text-xs text-zinc-500 font-mono mt-0.5">
                      {m.lead.leadNumber} • {m.lead.phone}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-bold text-[#B69A63] bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      {m.time}
                    </span>
                    <span className="block text-[10px] text-zinc-400 mt-1 uppercase font-semibold">
                      {m.status}
                    </span>
                  </div>
                </div>

                {m.location && (
                  <div className="text-xs text-zinc-600 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span className="truncate">{m.location}</span>
                  </div>
                )}

                {m.notes && (
                  <div className="text-xs text-zinc-500 bg-white p-2 rounded-lg border border-zinc-200 italic">
                    "{m.notes}"
                  </div>
                )}

                <div className="text-[11px] text-zinc-400 pt-1 border-t border-zinc-200 flex items-center justify-between">
                  <span>Host: {m.createdBy.name}</span>
                </div>

                {/* Action Buttons */}
                <div className="pt-2 border-t border-zinc-200 flex items-center gap-2">
                  <button
                    onClick={() => handleGoogleCalendar(m)}
                    className="flex-1 text-[11px] font-semibold text-zinc-700 bg-white hover:bg-zinc-100 border border-zinc-200 rounded-lg py-1.5 px-2 flex items-center justify-center gap-1 transition-colors"
                    title="Add to Google Calendar"
                  >
                    <ExternalLink className="w-3 h-3 text-blue-600" /> Google Cal
                  </button>

                  <button
                    onClick={() => handleExportICS(m)}
                    className="flex-1 text-[11px] font-semibold text-zinc-700 bg-white hover:bg-zinc-100 border border-zinc-200 rounded-lg py-1.5 px-2 flex items-center justify-center gap-1 transition-colors"
                    title="Download iCal file"
                  >
                    <Download className="w-3 h-3 text-zinc-600" /> .ICS
                  </button>

                  {m.status === 'UPCOMING' && (
                    <button
                      onClick={() => onCompleteMeeting(m)}
                      className="text-[11px] font-semibold text-white bg-[#171817] hover:bg-[#B69A63] rounded-lg py-1.5 px-2.5 flex items-center justify-center gap-1 transition-colors"
                    >
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Outcome
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
