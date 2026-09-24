'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { UserX, RefreshCw } from 'lucide-react';
import { LeadTable } from '@/components/leads/LeadTable';
import { ReassignModal } from '@/components/leads/ReassignModal';
import { LeadUpdateModal } from '@/components/leads/LeadUpdateModal';
import { BulkActionBar } from '@/components/leads/BulkActionBar';
import { Button } from '@/components/ui/Button';
import { useCrmSync } from '@/lib/sync-event';
import { useLiveUsers } from '@/lib/use-live-users';

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
}

export default function NotInterestedQueuePage() {
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const { users: executives } = useLiveUsers('EXECUTIVE');

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [selectedLeadForReassign, setSelectedLeadForReassign] = useState<LeadItem | null>(null);
  const [selectedLeadForUpdate, setSelectedLeadForUpdate] = useState<LeadItem | null>(null);

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    const pageIds = leads.map((l) => l.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const fetchNILeads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leads?category=NOT_INTERESTED&page=${page}&pageSize=${pageSize}`);
      if (res.ok) {
        const data = await res.json();
        setLeads(data.leads || []);
        setTotal(data.total || 0);
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    fetchNILeads();
  }, [fetchNILeads]);

  useCrmSync(['leads', 'calling', 'all'], () => {
    fetchNILeads();
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between pb-4 border-b border-[#E5E5E0]">
        <div>
          <h2 className="text-xl font-bold text-[#171817] flex items-center gap-2">
            <UserX className="w-5 h-5 text-[#8C908A]" /> Not Interested (NI) Queue
          </h2>
          <p className="text-xs text-[#626560] mt-1">
            Leads marked as not interested by executives. Preserves all client objections, notes, and permits reassignment if propositions change.
          </p>
        </div>

        <Button size="sm" variant="secondary" onClick={fetchNILeads} isLoading={loading}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
        </Button>
      </div>

      <LeadTable
        leads={leads}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        onPageChange={(p) => setPage(p)}
        onUpdate={(lead) => setSelectedLeadForUpdate(lead)}
        onReassign={(lead) => setSelectedLeadForReassign(lead)}
        onLeadDeleted={fetchNILeads}
        canReassign={true}
        canDelete={true}
        selectable={true}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onToggleSelectAll={handleToggleSelectAll}
      />

      {/* Bulk Action Bar */}
      <BulkActionBar
        selectedIds={selectedIds}
        selectedLeads={leads.filter((l) => selectedIds.includes(l.id))}
        onClearSelection={() => setSelectedIds([])}
        onSuccess={() => {
          setSelectedIds([]);
          fetchNILeads();
        }}
        executives={executives}
        canDelete={true}
        canReassign={true}
      />

      {selectedLeadForReassign && (
        <ReassignModal
          isOpen={true}
          onClose={() => setSelectedLeadForReassign(null)}
          leadId={selectedLeadForReassign.id}
          leadNumber={selectedLeadForReassign.leadNumber}
          clientName={selectedLeadForReassign.clientName}
          currentOwnerName={selectedLeadForReassign.currentOwner?.name}
          onSuccess={fetchNILeads}
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
          onSuccess={fetchNILeads}
        />
      )}
    </div>
  );
}
