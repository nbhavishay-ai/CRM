'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { FolderKanban, RefreshCw } from 'lucide-react';
import { LeadCard } from '@/components/leads/LeadCard';
import { LeadUpdateModal } from '@/components/leads/LeadUpdateModal';
import { Button } from '@/components/ui/Button';
import { useCrmSync } from '@/lib/sync-event';

interface LeadItem {
  id: string;
  leadNumber: string;
  clientName: string;
  phone: string;
  source: string;
  currentStatus: string;
  currentCategory: string;
  isNewToMe: boolean;
  nextAction?: string | null;
  nextActionAt?: string | Date | null;
  lastUpdatedAt: string | Date;
  createdAt: string | Date;
  currentOwner?: { id: string; name: string } | null;
  updates?: Array<{ remark: string; createdAt: string | Date }>;
}

const STAGES = [
  { id: 'ALL', label: 'All Active' },
  { id: 'INTERESTED', label: 'Interested' },
  { id: 'FOLLOW_UP', label: 'Follow-up' },
  { id: 'CALL_BACK', label: 'Call Back' },
  { id: 'MEETING', label: 'Meeting' },
  { id: 'SITE_VISIT', label: 'Site Visit' },
  { id: 'QUOTATION', label: 'Quotation' },
  { id: 'NEGOTIATION', label: 'Negotiation' },
  { id: 'NOT_ANSWERING', label: 'Not Answering' },
  { id: 'NOT_INTERESTED', label: 'Not Interested' },
];

import { getFastCache, setFastCache } from '@/lib/fast-data';

export default function LeadsWorkspacePage() {
  const [selectedStage, setSelectedStage] = useState('ALL');
  const cacheKey = `crm:executive:workspace:${selectedStage}`;
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLeadForUpdate, setSelectedLeadForUpdate] = useState<LeadItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestSequenceRef = React.useRef(0);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  const fetchWorkspaceLeads = useCallback(async (isBackground: boolean | unknown = false) => {
    const requestSequence = ++requestSequenceRef.current;
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const params = new URLSearchParams();
    params.set('_t', Date.now().toString());
    params.set('pageSize', '5000');
    params.set('ownerId', 'me');
    params.set('excludeCallingData', 'true');
    if (selectedStage !== 'ALL') {
      params.set('status', selectedStage);
    }

    try {
      setError(null);
      const res = await fetch(`/api/leads?${params.toString()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
        signal: abortController.signal,
      });
      if (res.ok) {
        const json = await res.json();
        const freshLeads: LeadItem[] = json.leads || [];
        if (requestSequence !== requestSequenceRef.current) return;
        setLeads((prev) => {
          if (
            prev.length === freshLeads.length &&
            prev.map((l) => `${l.id}:${l.lastUpdatedAt}:${l.currentStatus}`).join('|') ===
              freshLeads.map((l) => `${l.id}:${l.lastUpdatedAt}:${l.currentStatus}`).join('|')
          ) {
            return prev;
          }
          return freshLeads;
        });
        setFastCache(`crm:executive:workspace:${selectedStage}`, freshLeads, 30000);
      } else {
        const json = await res.json().catch(() => ({}));
        setError(json.error || 'Unable to load your assigned leads.');
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('Error fetching workspace leads:', err);
      setError('Unable to load your assigned leads. Please refresh.');
    } finally {
      if (requestSequence === requestSequenceRef.current) setLoading(false);
    }
  }, [selectedStage]);

  useEffect(() => {
    const cached = getFastCache<LeadItem[]>(cacheKey);
    if (cached) {
      setLeads(cached);
    } else {
      setLoading(true);
    }

    fetchWorkspaceLeads(true);

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && !document.hidden) {
        fetchWorkspaceLeads(true);
      }
    }, 4000);

    const handleFocus = () => fetchWorkspaceLeads(true);
    window.addEventListener('focus', handleFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      abortControllerRef.current?.abort();
    };
  }, [fetchWorkspaceLeads, cacheKey]);

  // Instant 0ms cross-tab and local sync
  useCrmSync(['leads', 'calling', 'all'], () => {
    fetchWorkspaceLeads(true);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E5E0]">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-[#171817] flex items-center gap-2">
              <FolderKanban className="w-5 h-5 text-[#B69A63]" /> Active Leads Workspace
            </h2>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FAF9F5] border border-[#B69A63]/30 text-[11px] font-semibold text-[#7A5B28] shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="hidden sm:inline">Live Workspace Stream</span>
              <span className="sm:hidden">Live</span>
            </div>
          </div>
          <p className="text-xs text-[#626560] mt-1">
            Manage all of your assigned active leads organized by pipeline stage.
          </p>
          {error && (
            <p role="alert" className="mt-2 text-xs font-semibold text-[#8C332E]">{error}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={fetchWorkspaceLeads} isLoading={loading}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Stage Filter Pills */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-2">
        {STAGES.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelectedStage(s.id)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer select-none ${
              selectedStage === s.id
                ? 'bg-[#111314] text-[#F4F2EC] border border-[#252829] shadow-xs font-bold'
                : 'bg-white text-[#626560] border border-[#E5E5E0] hover:border-[#B69A63] hover:text-[#171817]'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Leads Grid */}
      {leads.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-white border border-[#E5E5E0] shadow-xs">
          <p className="text-[#626560] text-sm">
            No leads currently in stage: <strong className="text-[#171817]">{selectedStage}</strong>
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onUpdate={() => setSelectedLeadForUpdate(lead)}
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
          onSuccess={fetchWorkspaceLeads}
        />
      )}
    </div>
  );
}
