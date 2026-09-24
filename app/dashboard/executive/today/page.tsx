'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Clock, Sparkles, RefreshCw } from 'lucide-react';
import { LeadCard } from '@/components/leads/LeadCard';
import { LeadUpdateModal } from '@/components/leads/LeadUpdateModal';
import { ReassignModal } from '@/components/leads/ReassignModal';
import { Button } from '@/components/ui/Button';
import { useCrmSync } from '@/lib/sync-event';
import { getFastCache, setFastCache } from '@/lib/fast-data';

interface LeadItem {
  id: string;
  leadNumber: string;
  clientName: string;
  phone: string;
  source: string;
  currentStatus: string;
  currentCategory: string;
  isNewToMe: boolean;
  score?: number | null;
  temperature?: string | null;
  nextAction?: string | null;
  nextActionAt?: string | Date | null;
  lastUpdatedAt: string | Date;
  createdAt: string | Date;
  currentOwner?: { id: string; name: string } | null;
  updates?: Array<{ remark: string; createdAt: string | Date }>;
}

export default function ExecutiveTodayLeadsPage() {
  const cacheKey = 'crm:executive:today_leads';
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [selectedLeadForUpdate, setSelectedLeadForUpdate] = useState<LeadItem | null>(null);
  const [selectedLeadForReassign, setSelectedLeadForReassign] = useState<LeadItem | null>(null);
  const previousLeadCountRef = React.useRef<number | null>(null);
  const requestSequenceRef = React.useRef(0);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  const fetchTodayLeads = useCallback(async (isBackground: boolean | unknown = false) => {
    const requestSequence = ++requestSequenceRef.current;
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    const isBg = isBackground === true;
    const cached = getFastCache<LeadItem[]>(cacheKey);
    if (!cached && !isBg) {
      setLoading(true);
    }

    try {
      const res = await fetch(`/api/leads?today=true&pageSize=50000&_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
        signal: abortController.signal,
      });
      if (res.ok) {
        const json = await res.json();
        const freshLeads: LeadItem[] = json.leads || [];
        if (requestSequence !== requestSequenceRef.current) return;
        if (
          previousLeadCountRef.current !== null &&
          freshLeads.length > previousLeadCountRef.current
        ) {
          const added = freshLeads.length - previousLeadCountRef.current;
          setUploadNotice(
            `${added} new lead${added === 1 ? '' : 's'} uploaded or assigned to your Today’s Leads queue.`
          );
          window.setTimeout(() => setUploadNotice(null), 6000);
        }
        previousLeadCountRef.current = freshLeads.length;
        setLeads(freshLeads);
        setFastCache(cacheKey, freshLeads, 15000);
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        console.error('Error fetching today leads:', err);
      }
    } finally {
      if (requestSequence === requestSequenceRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = getFastCache<LeadItem[]>(cacheKey);
    if (cached) {
      setLeads(cached);
      setLoading(false);
      fetchTodayLeads(true);
    } else {
      fetchTodayLeads(false);
    }

    // High-speed real-time polling interval (every 3 seconds)
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && !document.hidden) {
        fetchTodayLeads(true);
      }
    }, 3000);

    const handleFocus = () => fetchTodayLeads(true);
    window.addEventListener('focus', handleFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      abortControllerRef.current?.abort();
    };
  }, [fetchTodayLeads]);

  // Instant 0ms cross-tab and local sync
  useCrmSync(['leads', 'calling', 'all'], () => {
    fetchTodayLeads(true);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E5E0]">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-[#171817] flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#B69A63]" /> Today&apos;s Leads
            </h2>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FAF9F5] border border-[#B69A63]/30 text-[11px] font-semibold text-[#7A5B28] shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="hidden sm:inline">Live Leads Stream</span>
              <span className="sm:hidden">Live</span>
            </div>

            {uploadNotice && (
              <div
                role="status"
                className="flex items-center justify-between gap-3 rounded-xl border border-[#D3E5D9] bg-[#EDF5F0] px-4 py-3 text-xs font-semibold text-[#2D5A3C]"
              >
                <span>{uploadNotice}</span>
                <button
                  type="button"
                  onClick={() => setUploadNotice(null)}
                  className="text-[#2D5A3C] hover:underline"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
          <p className="text-xs text-[#626560] mt-1">
            High-priority feed of leads newly created, newly assigned, or handed over to you today ({leads.length}).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => fetchTodayLeads(false)} isLoading={loading}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {leads.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-white border border-[#E5E5E0] shadow-xs">
          <Sparkles className="w-8 h-8 text-[#B69A63] mx-auto mb-2" />
          <p className="text-[#171817] text-sm font-semibold">No new leads received today yet.</p>
          <p className="text-xs text-[#626560] mt-1">
            Incoming inquiries and management reassignments will land here instantly in real time.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onUpdate={() => setSelectedLeadForUpdate(lead)}
              onReassign={() => setSelectedLeadForReassign(lead)}
              canReassign
              showStory
            />
          ))}
        </div>
      )}

      {selectedLeadForUpdate && (
        <LeadUpdateModal
          isOpen={true}
          onClose={() => setSelectedLeadForUpdate(null)}
          leadId={selectedLeadForUpdate.id}
          leadNumber={selectedLeadForUpdate.leadNumber}
          clientName={selectedLeadForUpdate.clientName}
          currentStatus={selectedLeadForUpdate.currentStatus}
          onSuccess={() => fetchTodayLeads(true)}
        />
      )}
      {selectedLeadForReassign && (
        <ReassignModal
          isOpen
          onClose={() => setSelectedLeadForReassign(null)}
          leadId={selectedLeadForReassign.id}
          leadNumber={selectedLeadForReassign.leadNumber}
          clientName={selectedLeadForReassign.clientName}
          currentOwnerName={selectedLeadForReassign.currentOwner?.name}
          onSuccess={() => fetchTodayLeads(true)}
        />
      )}
    </div>
  );
}
