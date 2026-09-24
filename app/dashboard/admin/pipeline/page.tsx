'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { LayoutGrid, RefreshCw, Plus, Sparkles, Filter } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { KanbanBoard, PipelineLead } from '@/components/pipeline/KanbanBoard';
import { NewLeadModal } from '@/components/leads/NewLeadModal';
import { useCrmSync } from '@/lib/sync-event';

export default function PipelinePage() {
  const [leads, setLeads] = useState<PipelineLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNewLeadOpen, setIsNewLeadOpen] = useState(false);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/leads?limit=500');
      if (res.ok) {
        const json = await res.json();
        setLeads(json.leads || []);
      }
    } catch (err) {
      console.error('Failed to load pipeline leads:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  useCrmSync(['leads', 'all'], () => {
    fetchLeads();
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E5E0]">
        <div>
          <h2 className="text-xl font-bold text-[#171817] flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-[#B69A63]" /> Deals Pipeline
          </h2>
          <p className="text-xs text-[#626560] mt-1">
            Visual funnel overview with live stage values, instant deal progression, and executive filtering.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            size="sm"
            variant="secondary"
            onClick={fetchLeads}
            isLoading={loading}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>

          <Button
            size="sm"
            variant="primary"
            onClick={() => setIsNewLeadOpen(true)}
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> New Lead
          </Button>
        </div>
      </div>

      {/* Main Board */}
      {loading && leads.length === 0 ? (
        <div className="p-16 text-center text-sm text-zinc-400 flex items-center justify-center gap-3">
          <div className="w-5 h-5 border-2 border-[#B69A63] border-t-transparent rounded-full animate-spin" />
          Loading pipeline deals...
        </div>
      ) : (
        <KanbanBoard leads={leads} onRefresh={fetchLeads} isAdmin={true} />
      )}

      {/* New Lead Modal */}
      <NewLeadModal
        isOpen={isNewLeadOpen}
        onClose={() => setIsNewLeadOpen(false)}
        onSuccess={fetchLeads}
      />
    </div>
  );
}
