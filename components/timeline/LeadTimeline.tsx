'use client';

import React from 'react';
import {
  Sparkles,
  RefreshCw,
  MessageSquare,
  Clock,
  Calendar,
  ShieldAlert,
} from 'lucide-react';

export interface TimelineEvent {
  id: string;
  type:
    | 'CREATED'
    | 'ASSIGNED'
    | 'REASSIGNED'
    | 'UPDATE'
    | 'STATUS_CHANGE'
    | 'FOLLOWUP_SCHEDULED'
    | 'FOLLOWUP_COMPLETED'
    | 'MEETING_SCHEDULED'
    | 'MEETING_COMPLETED';
  title: string;
  description?: string | null;
  actorName: string;
  actorRole?: string | null;
  timestamp: string | Date;
  metadata?: Record<string, unknown> | null;
}

interface LeadTimelineProps {
  events: TimelineEvent[];
}

export const LeadTimeline: React.FC<LeadTimelineProps> = ({ events }) => {
  const [playingId, setPlayingId] = React.useState<string | null>(null);

  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-xs text-gray-500">
        No recorded timeline events for this lead.
      </div>
    );
  }

  // Sort newest first
  const sorted = [...events].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const getEventIcon = (type: TimelineEvent['type']) => {
    switch (type) {
      case 'CREATED':
        return <Sparkles className="w-3.5 h-3.5 text-[#B69A63]" />;
      case 'REASSIGNED':
      case 'ASSIGNED':
        return <RefreshCw className="w-3.5 h-3.5 text-[#626560]" />;
      case 'STATUS_CHANGE':
        return <ShieldAlert className="w-3.5 h-3.5 text-[#2D5A3C]" />;
      case 'FOLLOWUP_SCHEDULED':
        return <Clock className="w-3.5 h-3.5 text-[#7A5B28]" />;
      case 'FOLLOWUP_COMPLETED':
        return <Clock className="w-3.5 h-3.5 text-[#2D5A3C]" />;
      case 'MEETING_SCHEDULED':
        return <Calendar className="w-3.5 h-3.5 text-[#626560]" />;
      case 'MEETING_COMPLETED':
        return <Calendar className="w-3.5 h-3.5 text-[#2D5A3C]" />;
      case 'UPDATE':
      default:
        return <MessageSquare className="w-3.5 h-3.5 text-[#171817]" />;
    }
  };

  const getBadgeStyle = (type: TimelineEvent['type']) => {
    switch (type) {
      case 'CREATED':
        return 'border-[#B69A63]/30 bg-[#FAF5EB] text-[#7A5B28]';
      case 'REASSIGNED':
      case 'ASSIGNED':
        return 'border-[#E5E5E0] bg-[#F8F8F6] text-[#626560]';
      case 'STATUS_CHANGE':
        return 'border-[#D8EADB] bg-[#EDF5F0] text-[#2D5A3C]';
      case 'FOLLOWUP_SCHEDULED':
        return 'border-[#E8DCBE] bg-[#FAF5EB] text-[#7A5B28]';
      case 'FOLLOWUP_COMPLETED':
        return 'border-[#D8EADB] bg-[#EDF5F0] text-[#2D5A3C]';
      case 'MEETING_SCHEDULED':
        return 'border-[#E5E5E0] bg-[#F8F8F6] text-[#171817]';
      case 'MEETING_COMPLETED':
        return 'border-[#D8EADB] bg-[#EDF5F0] text-[#2D5A3C]';
      case 'UPDATE':
      default:
        return 'border-[#E5E5E0] bg-[#F8F8F6] text-[#171817]';
    }
  };

  const getBorderAccent = (type: TimelineEvent['type']) => {
    switch (type) {
      case 'CREATED':
        return 'border-l-2 border-l-[#B69A63]';
      case 'REASSIGNED':
      case 'ASSIGNED':
        return 'border-l-2 border-l-[#626560]';
      case 'STATUS_CHANGE':
        return 'border-l-2 border-l-[#2D5A3C]';
      case 'FOLLOWUP_SCHEDULED':
        return 'border-l-2 border-l-[#7A5B28]';
      case 'FOLLOWUP_COMPLETED':
        return 'border-l-2 border-l-[#2D5A3C]';
      case 'MEETING_SCHEDULED':
        return 'border-l-2 border-l-[#626560]';
      case 'MEETING_COMPLETED':
        return 'border-l-2 border-l-[#2D5A3C]';
      case 'UPDATE':
      default:
        return 'border-l-2 border-l-[#B69A63]/40';
    }
  };

  return (
    <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-[2px] before:bg-[#E5E5E0]">
      {sorted.map((ev) => {
        const dateObj = new Date(ev.timestamp);
        const formattedDate = dateObj.toLocaleDateString([], {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        const formattedTime = dateObj.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });

        const isCallEvent =
          ev.description?.includes('[CALL LOGGED') || ev.description?.includes('[CALL RECORDED');
        const isPlaying = playingId === ev.id;

        return (
          <div key={ev.id} className="relative group">
            {/* Timeline node icon */}
            <div className="absolute -left-6 top-1 w-5 h-5 rounded-full bg-white border-2 border-[#E5E5E0] group-hover:border-[#B69A63] flex items-center justify-center transition-colors shadow-2xs">
              {getEventIcon(ev.type)}
            </div>

            {/* Event card */}
            <div
              className={`rounded-xl bg-white border border-[#E5E5E0] p-4 shadow-2xs hover:border-[#D2BE91] transition-all ${getBorderAccent(
                ev.type
              )}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${getBadgeStyle(
                      ev.type
                    )}`}
                  >
                    {ev.title}
                  </span>
                  <span className="text-xs text-[#626560] font-medium">
                    by <strong className="text-[#171817]">{ev.actorName}</strong>
                    {ev.actorRole && (
                      <span className="text-[10px] text-[#90928E] ml-1">
                        ({ev.actorRole.replace('_', ' ')})
                      </span>
                    )}
                  </span>
                </div>

                <span className="text-[11px] text-[#90928E] font-mono whitespace-nowrap">
                  {formattedDate} • {formattedTime}
                </span>
              </div>

              {ev.description && (
                <p className="mt-2.5 text-xs text-[#171817] leading-relaxed bg-[#F8F8F6] p-3 rounded-xl border border-[#E5E5E0]">
                  {ev.description}
                </p>
              )}

              {/* Embedded Audio Playback Widget for logged calls */}
              {isCallEvent && (
                <div className="mt-3 p-3 rounded-xl bg-[#111314] text-[#F4F2EC] border border-[#1E2021] flex items-center justify-between gap-4 shadow-md">
                  <div className="flex items-center space-x-3">
                    <button
                      type="button"
                      onClick={() => setPlayingId(isPlaying ? null : ev.id)}
                      className="w-8 h-8 rounded-lg bg-[#B69A63] hover:bg-[#C6AD7A] text-[#171817] flex items-center justify-center transition cursor-pointer shrink-0 font-bold"
                    >
                      {isPlaying ? (
                        <div className="flex gap-0.5 items-center justify-center">
                          <span className="w-1 h-3 bg-[#171817] rounded-xs animate-pulse" />
                          <span className="w-1 h-3 bg-[#171817] rounded-xs animate-pulse" />
                        </div>
                      ) : (
                        <div className="w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-l-[8px] border-l-[#171817] ml-0.5" />
                      )}
                    </button>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#F4F2EC]">Call Audio Recording</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#1E2021] text-[#D2BE91] border border-[#B69A63]/30 font-mono">
                          CTI Logged
                        </span>
                      </div>
                      <p className="text-[10px] text-[#AEB1AC] font-mono">
                        {isPlaying ? 'Playing back verified audio...' : 'Recorded call talk time'}
                      </p>
                    </div>
                  </div>

                  {/* Simulated Waveform Visualizer */}
                  <div className="flex items-center space-x-1">
                    {[12, 24, 18, 28, 14, 22, 16, 26, 20, 10].map((h, i) => (
                      <span
                        key={i}
                        style={{ height: isPlaying ? `${Math.max(6, (h * (i % 2 === 0 ? 1.2 : 0.8))) }px` : `${h / 2}px` }}
                        className={`w-1 rounded-full transition-all duration-200 ${
                          isPlaying ? 'bg-[#D2BE91]' : 'bg-[#252829]'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
