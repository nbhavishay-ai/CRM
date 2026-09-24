'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { BriefcaseBusiness, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { LeadCard } from '@/components/leads/LeadCard';
import { LeadItem } from '@/components/leads/LeadTable';
import { LeadUpdateModal } from '@/components/leads/LeadUpdateModal';
import { ReassignModal } from '@/components/leads/ReassignModal';
import { useCrmSync } from '@/lib/sync-event';

export default function TeamLeadMyLeadsPage() {
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<LeadItem | null>(null);
  const [selectedLeadForUpdate, setSelectedLeadForUpdate] = useState<LeadItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/leads?ownerId=me&excludeCallingData=true&page=1&pageSize=5000&_t=' + Date.now(), {
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || 'Unable to load your leads.');
        return;
      }
      setLeads(data.leads || []);
    } catch {
      setError('Unable to load your leads. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  useCrmSync(['leads', 'users', 'all'], fetchLeads);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-[#E5E5E0] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-[#171817]">
            <BriefcaseBusiness className="h-5 w-5 text-[#B69A63]" /> My Leads &amp; Remarks Workspace
          </h2>
          <p className="mt-1 text-xs text-[#626560]">
            Manage all of your assigned leads, add remarks, update status, and schedule follow-ups.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={fetchLeads} isLoading={loading}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-[#E7C8C5] bg-[#FDF3F2] px-4 py-3 text-xs font-semibold text-[#8C332E]">
          {error}
        </div>
      )}

      {!loading && !error && leads.length === 0 && (
        <div className="rounded-2xl border border-[#E5E5E0] bg-white p-12 text-center shadow-xs">
          <p className="text-sm text-[#626560]">No leads are currently assigned to you.</p>
          <p className="mt-1 text-xs text-[#90928E]">Leads assigned by Admin will appear here.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {leads.map((lead) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            onUpdate={() => setSelectedLeadForUpdate(lead)}
            onReassign={() => setSelectedLead(lead)}
            canReassign
            showStory
          />
        ))}
      </div>

      {selectedLead && (
        <ReassignModal
          isOpen
          onClose={() => setSelectedLead(null)}
          leadId={selectedLead.id}
          leadNumber={selectedLead.leadNumber}
          clientName={selectedLead.clientName}
          currentOwnerName={selectedLead.currentOwner?.name}
          onSuccess={fetchLeads}
        />
      )}
      {selectedLeadForUpdate && (
        <LeadUpdateModal
          isOpen
          onClose={() => setSelectedLeadForUpdate(null)}
          leadId={selectedLeadForUpdate.id}
          leadNumber={selectedLeadForUpdate.leadNumber}
          clientName={selectedLeadForUpdate.clientName}
          currentStatus={selectedLeadForUpdate.currentStatus}
          onSuccess={fetchLeads}
        />
      )}
    </div>
  );
}
