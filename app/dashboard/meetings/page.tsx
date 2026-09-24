'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  RefreshCw,
  CheckCircle2,
  LayoutGrid,
  List,
  ExternalLink,
  Download,
  MapPin,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { MeetingsCalendar, MeetingItem } from '@/components/meetings/MeetingsCalendar';
import { generateICS, downloadICS, buildGoogleCalendarUrl } from '@/lib/calendar-utils';
import { useCrmSync, emitCrmSync } from '@/lib/sync-event';
import { getFastCache, setFastCache } from '@/lib/fast-data';

export default function MeetingsPage() {
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [timeframe, setTimeframe] = useState<'today' | 'week' | 'upcoming' | 'completed'>('week');

  const cacheKey = `crm:meetings:${viewMode}:${timeframe}`;

  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [completingMeeting, setCompletingMeeting] = useState<MeetingItem | null>(null);
  const [outcome, setOutcome] = useState('');
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [submittingOutcome, setSubmittingOutcome] = useState(false);

  const fetchMeetings = useCallback(async (isBackground: boolean | unknown = false) => {
    const isBg = isBackground === true;
    const currentKey = `crm:meetings:${viewMode}:${timeframe}`;
    const cached = getFastCache<MeetingItem[]>(currentKey);
    if (!cached && !isBg) {
      setLoading(true);
    }
    try {
      // Calendar mode uses the weekly schedule so meetings earlier today are not hidden by
      // the upcoming-only filter.
      const url =
        viewMode === 'calendar' ? '/api/meetings?timeframe=week' : `/api/meetings?timeframe=${timeframe}`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        const list = json.meetings || [];
        setMeetings(list);
        setFastCache(currentKey, list, 60000);
      }
    } finally {
      setLoading(false);
    }
  }, [timeframe, viewMode]);

  useEffect(() => {
    const cached = getFastCache<MeetingItem[]>(cacheKey);
    if (cached) {
      setMeetings(cached);
      setLoading(false);
      fetchMeetings(true);
    } else {
      fetchMeetings(false);
    }
    const handleFocus = () => fetchMeetings(true);
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchMeetings, cacheKey]);

  useCrmSync(['leads', 'calling', 'meetings', 'all'], () => {
    fetchMeetings(true);
  });

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completingMeeting || !outcome.trim()) return;

    setSubmittingOutcome(true);
    setCompleteError(null);
    try {
      const res = await fetch('/api/meetings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: completingMeeting.id,
          outcome: outcome.trim(),
        }),
      });

      if (res.ok) {
        emitCrmSync('all');
        emitCrmSync('leads');
        setCompletingMeeting(null);
        setOutcome('');
        fetchMeetings();
      } else {
        const err = await res.json();
        setCompleteError(err.error || 'Failed to complete meeting');
      }
    } catch (err: unknown) {
      setCompleteError(err instanceof Error ? err.message : 'Error completing meeting');
    } finally {
      setSubmittingOutcome(false);
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E5E0]">
        <div>
          <h2 className="text-xl font-bold text-[#171817] flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[#B69A63]" /> Client Meetings &amp; Site Visits
          </h2>
          <p className="text-xs text-[#626560] mt-1">
            Interactive calendar schedule, boardroom appointments, on-site town tours &amp; 1-click Google Calendar sync.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* View Toggle */}
          <div className="flex items-center bg-[#F4F4F0] p-0.5 rounded-lg border border-[#E5E5E0]">
            <button
              onClick={() => setViewMode('calendar')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                viewMode === 'calendar'
                  ? 'bg-white text-[#171817] shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" /> Calendar
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                viewMode === 'list'
                  ? 'bg-white text-[#171817] shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <List className="w-3.5 h-3.5" /> List
            </button>
          </div>

          <Button size="sm" variant="secondary" onClick={fetchMeetings} isLoading={loading}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Calendar View Mode */}
      {viewMode === 'calendar' ? (
        <MeetingsCalendar
          meetings={meetings}
          onCompleteMeeting={(m) => setCompletingMeeting(m)}
          onRefresh={fetchMeetings}
        />
      ) : (
        /* List View Mode */
        <div className="space-y-4">
          {/* Timeframe Filter Tabs */}
          <div className="flex items-center space-x-2 border-b border-[#E5E5E0] pb-2 flex-wrap gap-y-2">
            <button
              onClick={() => setTimeframe('today')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer select-none ${
                timeframe === 'today'
                  ? 'bg-[#111314] text-[#F4F2EC] border border-[#252829] shadow-xs'
                  : 'text-[#626560] hover:text-[#171817] hover:bg-[#F8F8F6]'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setTimeframe('week')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer select-none ${
                timeframe === 'week'
                  ? 'bg-[#111314] text-[#F4F2EC] border border-[#252829] shadow-xs'
                  : 'text-[#626560] hover:text-[#171817] hover:bg-[#F8F8F6]'
              }`}
            >
              This Week
            </button>
            <button
              onClick={() => setTimeframe('upcoming')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer select-none ${
                timeframe === 'upcoming'
                  ? 'bg-[#111314] text-[#F4F2EC] border border-[#252829] shadow-xs'
                  : 'text-[#626560] hover:text-[#171817] hover:bg-[#F8F8F6]'
              }`}
            >
              All Upcoming
            </button>
            <button
              onClick={() => setTimeframe('completed')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer select-none ${
                timeframe === 'completed'
                  ? 'bg-[#EDF5F0] text-[#2D5A3C] border border-[#D3E5D9] shadow-xs'
                  : 'text-[#626560] hover:text-[#2D5A3C] hover:bg-[#EDF5F0]/50'
              }`}
            >
              Completed
            </button>
          </div>

          {/* Meetings List */}
          {meetings.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-white border border-[#E5E5E0] shadow-xs">
              <p className="text-[#626560] text-sm">No meetings found for this timeframe.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {meetings.map((m) => (
                <div
                  key={m.id}
                  className="rounded-2xl bg-white border border-[#E5E5E0] p-5 flex flex-col justify-between space-y-4 shadow-xs hover:border-[#B69A63] transition group"
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#F8F8F6] text-[#171817] border border-[#E5E5E0]">
                        {m.meetingType}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                          m.status === 'COMPLETED'
                            ? 'bg-[#EDF5F0] text-[#2D5A3C] border-[#D3E5D9]'
                            : 'bg-[#FAF5EB] text-[#7A5B28] border-[#E8DCBE]'
                        }`}
                      >
                        {m.status}
                      </span>
                    </div>

                    <div className="mt-3">
                      <h4 className="text-sm font-bold text-[#171817] group-hover:text-[#B69A63] transition-colors">
                        {m.lead.clientName}
                      </h4>
                      <p className="text-[11px] text-[#626560] font-mono font-semibold">
                        {m.lead.leadNumber} • {m.lead.phone}
                      </p>
                    </div>

                    <div className="mt-3 space-y-1 text-xs text-[#626560]">
                      <p className="font-semibold text-[#171817]">
                        📅 {m.date} at {m.time}
                      </p>
                      <p className="text-[#90928E] text-[11px]">
                        📍 {m.location || 'Online'}
                      </p>
                      {m.notes && (
                        <p className="text-[#626560] text-[11px] italic bg-[#F8F8F6] p-2.5 rounded-xl border border-[#E5E5E0] mt-2">
                          &ldquo;{m.notes}&rdquo;
                        </p>
                      )}
                      {m.outcome && (
                        <p className="text-[#2D5A3C] text-[11px] font-medium mt-1 bg-[#EDF5F0] p-2.5 rounded-xl border border-[#D3E5D9]">
                          Outcome: {m.outcome}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[#E5E5E0] space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-[#90928E]">
                      <span>Host: {m.createdBy.name}</span>
                    </div>

                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        onClick={() => handleGoogleCalendar(m)}
                        className="flex-1 text-[11px] font-semibold text-zinc-700 bg-[#FBFBFA] hover:bg-zinc-100 border border-zinc-200 rounded-lg py-1.5 px-2 flex items-center justify-center gap-1 transition-colors"
                        title="Add to Google Calendar"
                      >
                        <ExternalLink className="w-3 h-3 text-blue-600" /> Google Cal
                      </button>

                      <button
                        onClick={() => handleExportICS(m)}
                        className="flex-1 text-[11px] font-semibold text-zinc-700 bg-[#FBFBFA] hover:bg-zinc-100 border border-zinc-200 rounded-lg py-1.5 px-2 flex items-center justify-center gap-1 transition-colors"
                        title="Download iCal file"
                      >
                        <Download className="w-3 h-3 text-zinc-600" /> .ICS
                      </button>

                      {m.status !== 'COMPLETED' && (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => setCompletingMeeting(m)}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-[#D2BE91]" /> Outcome
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Complete Meeting Modal */}
      {completingMeeting && (
        <Modal
          isOpen={true}
          onClose={() => setCompletingMeeting(null)}
          title="Complete Meeting & Record Outcome"
          subtitle={`Meeting with ${completingMeeting.lead.clientName}`}
        >
          <form onSubmit={handleComplete} className="space-y-4">
            {completeError && (
              <div className="p-3 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs">
                {completeError}
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-[#171817] mb-1">
                Meeting Discussion Outcome <span className="text-[#B69A63]">*</span>
              </label>
              <textarea
                required
                rows={3}
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                placeholder="Key agreements reached, next steps agreed, pricing indications..."
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#E5E5E0] text-[#171817] placeholder-[#90928E] focus:outline-none focus:border-[#B69A63] focus:ring-2 focus:ring-[#B69A63]/20"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-[#E5E5E0]">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setCompletingMeeting(null)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={submittingOutcome}>
                Save Outcome &amp; Complete
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
