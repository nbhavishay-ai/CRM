'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Clock, RefreshCw, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { LeadCard } from '@/components/leads/LeadCard';
import { LeadItem } from '@/components/leads/LeadTable';
import { ReassignModal } from '@/components/leads/ReassignModal';
import { LeadUpdateModal } from '@/components/leads/LeadUpdateModal';
import { useCrmSync } from '@/lib/sync-event';

export default function TeamLeadTodayPage() {
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<LeadItem | null>(null);
  const [selectedLeadForUpdate, setSelectedLeadForUpdate] = useState<LeadItem | null>(null);
  const previousLeadCountRef = React.useRef<number | null>(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/leads?today=true&page=1&pageSize=5000&_t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      const freshLeads = data.leads || [];
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E5E5E0]">
        <div>
          <h2 className="text-xl font-bold text-[#171817] flex items-center gap-2"><Clock className="w-5 h-5 text-[#B69A63]" /> Today&apos;s Leads</h2>
          <p className="text-xs text-[#626560] mt-1 flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Your active non-calling leads assigned by admin.</p>
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
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={fetchLeads} isLoading={loading}><RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh</Button>
        </div>
      </div>
      {leads.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-white border border-[#E5E5E0] shadow-xs">
          <p className="text-[#626560] text-sm">No leads match today&apos;s queue.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
      )}
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
          isOpen={true}
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
