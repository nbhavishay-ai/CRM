'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  PhoneCall,
  PhoneOff,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  MessageCircle,
  X,
  RotateCcw,
  ChevronRight,
  Zap,
  Timer,
  SkipForward,
} from 'lucide-react';
import { formatTelUrl, formatWhatsAppUrl } from '@/lib/contact';
import { emitCrmSync } from '@/lib/sync-event';
import { Badge, getStatusBadgeVariant } from '../ui/Badge';

export interface AutoDialerLead {
  id: string;
  leadNumber: string;
  clientName: string;
  phone: string;
  source: string;
  currentStatus: string;
  currentCategory: string;
  nextAction?: string | null;
  nextActionAt?: string | Date | null;
  score?: number | null;
  temperature?: string | null;
  currentOwner?: { id: string; name: string } | null;
  updates?: Array<{ remark: string; createdAt: string | Date }>;
}

interface AutoDialerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStop?: (nextIndex: number) => void;
  leads: AutoDialerLead[];
  onLeadUpdated: () => void;
  initialIndex?: number;
}

type AutoDialerMode = 'CALLING' | 'LOGGING' | 'COUNTDOWN' | 'COMPLETED';

interface CallSessionRecord {
  leadNumber: string;
  clientName: string;
  status: string;
  remark: string;
  durationSeconds: number;
}

export const AutoDialerModal: React.FC<AutoDialerModalProps> = ({
  isOpen,
  onClose,
  onStop,
  leads,
  onLeadUpdated,
  initialIndex = 0,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [mode, setMode] = useState<AutoDialerMode>('CALLING');
  const [autoNext, setAutoNext] = useState(true);

  // Call Timer
  const [callSeconds, setCallSeconds] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-next countdown
  const [countdown, setCountdown] = useState(3);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // Completed call session history
  const [sessionHistory, setSessionHistory] = useState<CallSessionRecord[]>([]);

  // Form states for post-call disposition
  const [editableName, setEditableName] = useState('');
  const [status, setStatus] = useState('INTERESTED');
  const [remark, setRemark] = useState('');
  const [nextActionType, setNextActionType] = useState('Call');
  const [customNextAction, setCustomNextAction] = useState('');
  const [nextActionAt, setNextActionAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentLead = leads[currentIndex] || null;

  const handleExit = () => {
    onStop?.(Math.min(currentIndex + 1, Math.max(leads.length - 1, 0)));
    onClose();
  };

  // Sync state on modal open
  useEffect(() => {
    if (isOpen && leads.length > 0) {
      const idx = Math.min(Math.max(0, initialIndex), leads.length - 1);
      setCurrentIndex(idx);
      startCallForLead(leads[idx]);
    } else {
      stopTimer();
      clearCountdown();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Timer runner
  useEffect(() => {
    if (timerActive) {
      timerRef.current = setInterval(() => {
        setCallSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerActive]);

  const stopTimer = () => {
    setTimerActive(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const clearCountdown = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
  };

  const startCallForLead = (lead: AutoDialerLead) => {
    clearCountdown();
    setEditableName(lead.clientName);
    setStatus(lead.currentStatus || 'INTERESTED');
    setRemark('');
    setCustomNextAction('');
    setNextActionAt('');
    setError(null);
    setCallSeconds(0);
    setTimerActive(true);
    setMode('CALLING');

    // Trigger phone dialer
    if (lead.phone) {
      window.location.href = formatTelUrl(lead.phone);
    }
  };

  const handleDialAgain = () => {
    if (currentLead?.phone) {
      window.location.href = formatTelUrl(currentLead.phone);
    }
  };

  const handleOpenWhatsApp = () => {
    if (currentLead?.phone) {
      window.open(formatWhatsAppUrl(currentLead.phone, currentLead.clientName), '_blank');
    }
  };

  const handleCallEnded = () => {
    stopTimer();
    setMode('LOGGING');
  };

  const handleSkipLead = () => {
    stopTimer();
    clearCountdown();
    if (currentIndex < leads.length - 1) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      startCallForLead(leads[nextIdx]);
    } else {
      setMode('COMPLETED');
    }
  };

  // Quick Remark Presets based on Disposition
  const getQuickRemarks = (disposition: string) => {
    switch (disposition) {
      case 'INTERESTED':
        return [
          'Call connected, interested in 3BHK project',
          'Requested property brochure and pricing on WhatsApp',
          'Ready for site visit this weekend',
          'Good budget match, wants layout drawings',
        ];
      case 'FOLLOW_UP':
      case 'CALL_BACK':
        return [
          'Client busy driving, asked to call in evening',
          'Reviewing details with family, follow up tomorrow',
          'In a meeting, asked to call after 5 PM',
          'Salary day next week, will finalize then',
        ];
      case 'MEETING':
      case 'SITE_VISIT':
        return [
          'Office meeting confirmed for tomorrow',
          'Site visit scheduled with family for Saturday',
          'Direct discussion planned with senior closer',
        ];
      case 'NOT_ANSWERING':
        return [
          'Ringing but not answering (1st attempt)',
          'Ringing, no response after multiple rings',
          'Switched off / Out of network coverage',
        ];
      case 'BUSY':
        return [
          'Call disconnected immediately / Busy tone',
          'Line busy on another call, will retry',
        ];
      case 'NOT_INTERESTED':
        return [
          'Already purchased another property',
          'Budget mismatch / Looking in other location',
          'Not planning to invest currently',
        ];
      case 'CLOSED_WON':
        return [
          'Deal closed successfully! Token payment received',
          'Booking form filled and token transferred',
        ];
      default:
        return ['Call completed, updated client notes'];
    }
  };

  const handleQuickRemarkClick = (preset: string) => {
    setRemark((prev) => (prev ? `${prev}. ${preset}` : preset));
  };

  const handleQuickFollowupPreset = (hoursOrDays: string) => {
    const d = new Date();
    if (hoursOrDays === '2h') {
      d.setHours(d.getHours() + 2);
    } else if (hoursOrDays === 'tomorrow_11am') {
      d.setDate(d.getDate() + 1);
      d.setHours(11, 0, 0, 0);
    } else if (hoursOrDays === 'tomorrow_4pm') {
      d.setDate(d.getDate() + 1);
      d.setHours(16, 0, 0, 0);
    } else if (hoursOrDays === '2days') {
      d.setDate(d.getDate() + 2);
      d.setHours(11, 0, 0, 0);
    } else if (hoursOrDays === 'monday') {
      const day = d.getDay();
      const diff = d.getDate() + (day === 0 ? 1 : 8 - day);
      d.setDate(diff);
      d.setHours(11, 0, 0, 0);
    }
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    setNextActionAt(`${year}-${month}-${day}T${hours}:${minutes}`);
    if (status === 'INTERESTED' || status === 'NOT_ANSWERING' || status === 'BUSY') {
      setStatus('FOLLOW_UP');
    }
  };

  const handleSubmitAndNext = async (shouldAutoNext: boolean) => {
    if (!currentLead) return;

    if (!remark.trim()) {
      setError('Please add a brief remark or tap a quick-note chip.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const effectiveNextAction =
      nextActionType === 'Close'
        ? 'Lead Closed'
        : `${nextActionType}: ${customNextAction.trim() || 'Scheduled Touchpoint'}`;

    try {
      const res = await fetch(`/api/leads/${currentLead.id}/updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: editableName.trim() || currentLead.clientName,
          remark: remark.trim(),
          status,
          nextAction: effectiveNextAction,
          nextActionAt: nextActionAt ? new Date(nextActionAt).toISOString() : null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to submit update');
      }

      // Record in session history
      setSessionHistory((prev) => [
        ...prev,
        {
          leadNumber: currentLead.leadNumber,
          clientName: editableName.trim() || currentLead.clientName,
          status,
          remark: remark.trim(),
          durationSeconds: callSeconds,
        },
      ]);

      emitCrmSync('leads');
      emitCrmSync('calling');
      onLeadUpdated();

      if (!shouldAutoNext || currentIndex >= leads.length - 1) {
        setMode('COMPLETED');
      } else {
        // Start 3-second auto-dial countdown
        setMode('COUNTDOWN');
        setCountdown(3);
        const nextIdx = currentIndex + 1;

        let currentCount = 3;
        countdownRef.current = setInterval(() => {
          currentCount -= 1;
          setCountdown(currentCount);
          if (currentCount <= 0) {
            clearCountdown();
            setCurrentIndex(nextIdx);
            startCallForLead(leads[nextIdx]);
          }
        }, 1000);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record call update');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !currentLead) return null;

  const progressPercent = Math.round(((currentIndex + 1) / leads.length) * 100);

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#0B0C0D] text-[#F4F2EC] overflow-hidden"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/* Top Header Bar */}
      <div className="px-4 py-3 bg-[#111314] border-b border-[#252829] flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#1E2021] border border-[#B69A63]/40 flex items-center justify-center">
            <Zap className="w-4 h-4 text-[#D2BE91] animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black tracking-wider text-[#F4F2EC] uppercase">
                AUTO-DIALER POWER MODE
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-[#C6AD7A]/20 text-[#D2BE91] border border-[#B69A63]/30">
                LIVE
              </span>
            </div>
            <p className="text-[11px] text-[#8E918B]">
              Lead <strong className="text-[#F4F2EC]">{currentIndex + 1}</strong> of{' '}
              <strong className="text-[#F4F2EC]">{leads.length}</strong> ({progressPercent}%)
            </p>
          </div>
        </div>

        <button
          onClick={handleExit}
          className="p-2 rounded-xl text-[#8E918B] hover:text-[#F4F2EC] hover:bg-[#1E2021] transition cursor-pointer"
          title="Exit Auto-Dialer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-[#1E2021] h-1.5 shrink-0 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#B69A63] to-[#E5D2A5] transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Main Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-xl mx-auto w-full">
        {mode === 'CALLING' && (
          <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
            {/* Live Call Status & Timer Card */}
            <div className="rounded-2xl bg-[#17191A] border border-[#B69A63]/30 p-6 text-center shadow-lg space-y-3 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-3 opacity-10">
                <PhoneCall className="w-28 h-28 text-[#B69A63]" />
              </div>

              <div className="w-16 h-16 rounded-full bg-[#202324] border-2 border-[#B69A63] text-[#D2BE91] mx-auto flex items-center justify-center shadow-md animate-pulse">
                <PhoneCall className="w-8 h-8 text-[#D2BE91]" />
              </div>

              <div>
                <span className="text-[11px] uppercase tracking-widest text-[#C6AD7A] font-bold">
                  DIALING PROSPECT...
                </span>
                <h2 className="text-2xl font-black text-[#F4F2EC] mt-1 tracking-tight">
                  {currentLead.clientName}
                </h2>
                <p className="text-base font-mono font-bold text-[#D2BE91] mt-1">
                  {currentLead.phone}
                </p>
              </div>

              {/* Live Timer */}
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#0B0C0D] border border-[#2E3133] text-sm font-mono font-black text-[#F4F2EC]">
                <Timer className="w-4 h-4 text-[#B69A63] animate-spin" />
                <span>{formatTimer(callSeconds)}</span>
              </div>
            </div>

            {/* Client Intelligence Card */}
            <div className="rounded-2xl bg-[#141617] border border-[#222527] p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono font-bold text-[#8E918B] bg-[#1E2021] px-2.5 py-1 rounded-md border border-[#2A2D2E]">
                  {currentLead.leadNumber}
                </span>
                <Badge variant={getStatusBadgeVariant(currentLead.currentStatus)}>
                  {currentLead.currentStatus.replace('_', ' ')}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                <div className="p-2.5 rounded-xl bg-[#1A1C1D] border border-[#252829]">
                  <span className="text-[10px] text-[#8E918B]">Lead Source</span>
                  <p className="font-semibold text-[#F4F2EC] mt-0.5 truncate">{currentLead.source || 'Direct'}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-[#1A1C1D] border border-[#252829]">
                  <span className="text-[10px] text-[#8E918B]">Assigned Owner</span>
                  <p className="font-semibold text-[#F4F2EC] mt-0.5 truncate">{currentLead.currentOwner?.name || 'Self'}</p>
                </div>
              </div>

              {/* Previous Note / Action */}
              {currentLead.nextAction && (
                <div className="p-3 rounded-xl bg-[#1E2021] border border-[#2E3133] text-xs space-y-1">
                  <span className="text-[10px] uppercase font-bold text-[#C6AD7A]">Last Scheduled Action</span>
                  <p className="text-[#F4F2EC] font-medium">{currentLead.nextAction}</p>
                </div>
              )}
            </div>

            {/* Quick In-Call Tools */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={handleDialAgain}
                className="py-3 px-4 rounded-xl bg-[#1A1C1D] hover:bg-[#25282A] text-xs font-bold text-[#F4F2EC] border border-[#2A2D2E] flex items-center justify-center gap-2 transition cursor-pointer shadow-xs"
              >
                <RotateCcw className="w-4 h-4 text-[#D2BE91]" />
                Redial Phone
              </button>

              <button
                type="button"
                onClick={handleOpenWhatsApp}
                className="py-3 px-4 rounded-xl bg-[#14261C] hover:bg-[#1C3627] text-xs font-bold text-[#4ADE80] border border-[#235339] flex items-center justify-center gap-2 transition cursor-pointer shadow-xs"
              >
                <MessageCircle className="w-4 h-4 text-[#4ADE80]" />
                WhatsApp Message
              </button>
            </div>
          </div>
        )}

        {mode === 'LOGGING' && (
          <div className="space-y-4 animate-in slide-in-from-bottom-3 duration-200">
            {/* Header: Call Summary */}
            <div className="rounded-2xl bg-[#17191A] border border-[#2A2D2E] p-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#C6AD7A]">
                  Call Ended • {formatTimer(callSeconds)} Duration
                </span>
                <h3 className="text-lg font-bold text-[#F4F2EC]">{editableName || currentLead.clientName}</h3>
              </div>
              <span className="font-mono text-xs text-[#8E918B] bg-[#222527] px-2 py-1 rounded-md">
                {currentLead.leadNumber}
              </span>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-[#3D1412] border border-[#752622] text-[#F87171] text-xs font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Editable Name if Discovered */}
            <div>
              <label className="block text-[11px] font-bold text-[#C6AD7A] uppercase tracking-wide mb-1">
                Client Full Name
              </label>
              <input
                type="text"
                value={editableName}
                onChange={(e) => setEditableName(e.target.value)}
                placeholder="Client Name"
                className="w-full px-3 py-2 text-xs rounded-xl bg-[#17191A] border border-[#2A2D2E] text-[#F4F2EC] placeholder-[#626560] focus:outline-none focus:border-[#B69A63]"
              />
            </div>

            {/* 1-Tap Quick Dispositions Grid */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-[#C6AD7A] uppercase tracking-wide">
                1. Select Call Outcome <span className="text-rose-400">*</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { value: 'INTERESTED', label: 'Interested', color: 'border-emerald-500/50 bg-emerald-950/30 text-emerald-300' },
                  { value: 'FOLLOW_UP', label: 'Follow-up', color: 'border-amber-500/50 bg-amber-950/30 text-amber-300' },
                  { value: 'CALL_BACK', label: 'Call Back', color: 'border-blue-500/50 bg-blue-950/30 text-blue-300' },
                  { value: 'MEETING', label: 'Meeting', color: 'border-purple-500/50 bg-purple-950/30 text-purple-300' },
                  { value: 'NOT_ANSWERING', label: 'Not Answering', color: 'border-rose-500/50 bg-rose-950/30 text-rose-300' },
                  { value: 'BUSY', label: 'Busy / Cut', color: 'border-zinc-500/50 bg-zinc-900/60 text-zinc-300' },
                  { value: 'NOT_INTERESTED', label: 'Not Interested', color: 'border-orange-500/50 bg-orange-950/30 text-orange-300' },
                  { value: 'CLOSED_WON', label: 'Closed Won 🏆', color: 'border-[#B69A63] bg-[#B69A63]/20 text-[#D2BE91]' },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setStatus(item.value)}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition text-center cursor-pointer select-none ${
                      status === item.value
                        ? `${item.color} ring-2 ring-[#B69A63]`
                        : 'border-[#252829] bg-[#141617] text-[#8E918B] hover:text-[#F4F2EC] hover:bg-[#1E2021]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Remark Chips */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-[#C6AD7A] uppercase tracking-wide">
                2. Tap Quick Remarks
              </label>
              <div className="flex flex-wrap gap-1.5">
                {getQuickRemarks(status).map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleQuickRemarkClick(preset)}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-[#1C1E20] hover:bg-[#2A2D30] text-[#D2BE91] border border-[#2E3133] transition cursor-pointer text-left select-none"
                  >
                    + {preset}
                  </button>
                ))}
              </div>

              <textarea
                required
                rows={2}
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="Type or edit call remark notes..."
                className="w-full mt-1.5 px-3 py-2 text-xs rounded-xl bg-[#17191A] border border-[#2A2D2E] text-[#F4F2EC] placeholder-[#626560] focus:outline-none focus:border-[#B69A63] resize-none leading-relaxed"
              />
            </div>

            {/* Next Action & Followup Presets */}
            {status !== 'NOT_INTERESTED' && status !== 'CLOSED_WON' && (
              <div className="p-3.5 rounded-2xl bg-[#141617] border border-[#252829] space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-[#C6AD7A] uppercase tracking-wide">
                    3. Schedule Next Action
                  </label>
                  <span className="text-[10px] text-[#8E918B]">Tap preset time</span>
                </div>

                {/* Quick Time Presets */}
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { key: '2h', label: 'In 2 Hours' },
                    { key: 'tomorrow_11am', label: 'Tmrw 11 AM' },
                    { key: 'tomorrow_4pm', label: 'Tmrw 4 PM' },
                    { key: '2days', label: 'In 2 Days' },
                    { key: 'monday', label: 'Next Monday' },
                  ].map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => handleQuickFollowupPreset(p.key)}
                      className="px-2.5 py-1 rounded-lg bg-[#1E2021] hover:bg-[#2C3033] text-[10px] font-bold text-[#F4F2EC] border border-[#303437] transition cursor-pointer select-none"
                    >
                      🕒 {p.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <select
                    value={nextActionType}
                    onChange={(e) => setNextActionType(e.target.value)}
                    className="px-3 py-2 text-xs rounded-xl bg-[#1A1C1D] border border-[#2A2D2E] text-[#F4F2EC] focus:outline-none focus:border-[#B69A63]"
                  >
                    <option value="Call">Call</option>
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Meeting">Meeting</option>
                    <option value="Site Visit">Site Visit</option>
                    <option value="Quotation">Send Quotation</option>
                  </select>

                  <input
                    type="datetime-local"
                    value={nextActionAt}
                    onChange={(e) => setNextActionAt(e.target.value)}
                    className="px-3 py-2 text-xs rounded-xl bg-[#1A1C1D] border border-[#2A2D2E] text-[#F4F2EC] focus:outline-none focus:border-[#B69A63]"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {mode === 'COUNTDOWN' && (
          <div className="py-12 text-center space-y-4 animate-in zoom-in-95 duration-200">
            <div className="w-24 h-24 rounded-full bg-[#17191A] border-4 border-[#B69A63] text-4xl font-black text-[#D2BE91] mx-auto flex items-center justify-center shadow-2xl animate-bounce">
              {countdown}
            </div>

            <div>
              <span className="text-xs uppercase font-bold text-[#C6AD7A] tracking-widest">
                PREPARING NEXT CALL...
              </span>
              <h3 className="text-xl font-bold text-[#F4F2EC] mt-1">
                {leads[currentIndex + 1]?.clientName || 'Next Lead'}
              </h3>
              <p className="text-sm font-mono text-[#D2BE91]">
                {leads[currentIndex + 1]?.phone}
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  clearCountdown();
                  const nextIdx = currentIndex + 1;
                  setCurrentIndex(nextIdx);
                  startCallForLead(leads[nextIdx]);
                }}
                className="px-6 py-2.5 rounded-xl bg-[#C6AD7A] text-[#111314] font-bold text-xs hover:bg-[#D2BE91] transition cursor-pointer shadow-md"
              >
                📞 Dial Immediately
              </button>
              <button
                type="button"
                onClick={() => {
                  clearCountdown();
                  setMode('LOGGING');
                }}
                className="px-4 py-2.5 rounded-xl bg-[#1E2021] text-[#AEB1AC] font-semibold text-xs border border-[#2E3133] hover:text-[#F4F2EC] cursor-pointer"
              >
                Pause
              </button>
            </div>
          </div>
        )}

        {mode === 'COMPLETED' && (
          <div className="py-8 text-center space-y-6 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-[#14261C] border border-[#235339] text-[#4ADE80] mx-auto flex items-center justify-center shadow-lg">
              <CheckCircle2 className="w-8 h-8 text-[#4ADE80]" />
            </div>

            <div>
              <h3 className="text-xl font-bold text-[#F4F2EC]">Auto-Dialer Session Completed!</h3>
              <p className="text-xs text-[#8E918B] mt-1">
                You logged {sessionHistory.length} calls in this telecalling sprint.
              </p>
            </div>

            {/* Session Summary Table */}
            <div className="rounded-2xl bg-[#141617] border border-[#222527] overflow-hidden text-left text-xs">
              <div className="p-3 bg-[#1A1C1D] border-b border-[#252829] font-bold text-[#C6AD7A] text-[11px] uppercase tracking-wider">
                Calls Logged This Session ({sessionHistory.length})
              </div>
              <div className="max-h-60 overflow-y-auto divide-y divide-[#222527]">
                {sessionHistory.map((s, idx) => (
                  <div key={idx} className="p-3 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-[#F4F2EC]">{s.clientName}</p>
                      <p className="text-[11px] text-[#8E918B] truncate max-w-[200px]">{s.remark}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#1E2021] text-[#D2BE91] border border-[#2E3133]">
                        {s.status.replace('_', ' ')}
                      </span>
                      <span className="block text-[10px] text-[#626560] font-mono mt-0.5">
                        {formatTimer(s.durationSeconds)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-[#C6AD7A] text-[#111314] font-bold text-xs hover:bg-[#D2BE91] transition cursor-pointer shadow-md"
            >
              Close &amp; Return to Calling Data
            </button>
          </div>
        )}
      </div>

      {/* Sticky Bottom Action Bar (Thumb-Optimized for Mobile) */}
      {mode !== 'COMPLETED' && mode !== 'COUNTDOWN' && (
        <div className="p-4 bg-[#111314] border-t border-[#252829] shrink-0 max-w-xl mx-auto w-full">
          {mode === 'CALLING' ? (
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleSkipLead}
                className="px-3.5 py-3 rounded-xl bg-[#1A1C1D] hover:bg-[#25282A] text-xs font-semibold text-[#8E918B] border border-[#2E3133] transition cursor-pointer flex items-center gap-1.5 shrink-0"
              >
                <SkipForward className="w-4 h-4 text-[#8E918B]" />
                Skip
              </button>

              <button
                type="button"
                onClick={handleCallEnded}
                className="flex-1 py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#B69A63] to-[#D2BE91] text-[#111314] text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition active:scale-[0.99] cursor-pointer"
              >
                <PhoneOff className="w-4 h-4 text-[#111314]" />
                Call Cut / End → Log Remark
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-[#8E918B]">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoNext}
                    onChange={(e) => setAutoNext(e.target.checked)}
                    className="rounded text-[#B69A63] accent-[#B69A63]"
                  />
                  <span>Auto-dial next number after save</span>
                </label>
                <span>{leads.length - currentIndex - 1} remaining</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleSubmitAndNext(false)}
                  className="px-4 py-3 rounded-xl bg-[#1E2021] hover:bg-[#2A2D30] text-xs font-semibold text-[#F4F2EC] border border-[#2E3133] transition cursor-pointer"
                >
                  Save Only
                </button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleSubmitAndNext(autoNext)}
                  className="flex-1 py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#B69A63] to-[#D2BE91] text-[#111314] text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition active:scale-[0.99] cursor-pointer"
                >
                  {submitting ? (
                    <span>Saving...</span>
                  ) : autoNext ? (
                    <>
                      <span>Save &amp; Auto-Call Next</span>
                      <ChevronRight className="w-4 h-4 text-[#111314]" />
                    </>
                  ) : (
                    <span>Save Update</span>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
