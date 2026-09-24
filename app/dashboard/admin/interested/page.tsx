'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles, RefreshCw, Search, Clock, AlertTriangle, UserCheck, X, Download } from 'lucide-react';
import { LeadTable } from '@/components/leads/LeadTable';
import { ReassignModal } from '@/components/leads/ReassignModal';
import { LeadUpdateModal } from '@/components/leads/LeadUpdateModal';
import { BulkActionBar } from '@/components/leads/BulkActionBar';
import { Button } from '@/components/ui/Button';
import { generateCSV, downloadCSV, ExportColumn } from '@/lib/export-utils';
import { useCrmSync } from '@/lib/sync-event';
import { getFastCache, setFastCache } from '@/lib/fast-data';
import { useLiveUsers } from '@/lib/use-live-users';

interface LeadItem {
  id: string;
  leadNumber: string;
  clientName: string;
  phone: string;
  company?: string | null;
  source: string;
  currentStatus: string;
  currentCategory: string;
  isNewToMe: boolean;
  nextAction?: string | null;
  nextActionAt?: string | Date | null;
  lastUpdatedAt: string | Date;
  createdAt: string | Date;
  currentOwner?: { id: string; name: string; team?: { id: string; name: string } | null } | null;
}

interface InterestedCachePayload {
  leads: LeadItem[];
  total: number;
}

export default function InterestedLeadsAdminPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [pageSize, setPageSize] = useState(50);

  const cacheKey = `crm:admin:interested:${page}:${pageSize}:${search}:${ownerId}:${overdueOnly}`;

  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(false);
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

  const fetchInterestedLeads = useCallback(async (isBackground: boolean | unknown = false) => {
    const isBg = isBackground === true;
    const currentKey = `crm:admin:interested:${page}:${pageSize}:${search}:${ownerId}:${overdueOnly}`;
    const cached = getFastCache<InterestedCachePayload>(currentKey);
    if (!cached && !isBg) {
      setLoading(true);
    }
    const params = new URLSearchParams();
    params.set('status', 'INTERESTED');
    params.set('page', page.toString());
    params.set('pageSize', pageSize.toString());
    if (search.trim()) params.set('search', search.trim());
    if (ownerId) params.set('ownerId', ownerId);
    if (overdueOnly) params.set('overdue', 'true');

    try {
      const res = await fetch(`/api/leads?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const payload: InterestedCachePayload = {
          leads: data.leads || [],
          total: data.total || 0,
        };
        setLeads(payload.leads);
        setTotal(payload.total);
        setFastCache(currentKey, payload, 60000);
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, ownerId, overdueOnly]);

  useEffect(() => {
    const cached = getFastCache<InterestedCachePayload>(cacheKey);
    if (cached) {
      setLeads(cached.leads);
      setTotal(cached.total);
      setLoading(false);
      fetchInterestedLeads(true);
    } else {
      fetchInterestedLeads(false);
    }
    const handleFocus = () => fetchInterestedLeads(true);
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchInterestedLeads, cacheKey]);

  useCrmSync(['leads', 'calling', 'all'], () => {
    fetchInterestedLeads(true);
  });

  const overdueCount = leads.filter(
    (l) => l.nextActionAt && new Date(l.nextActionAt) < new Date() && l.currentCategory === 'ACTIVE'
  ).length;

  const unassignedCount = leads.filter((l) => !l.currentOwner).length;

  const handleExportCSV = () => {
    const columns: ExportColumn<LeadItem>[] = [
      { header: 'Lead Number', accessor: (l) => l.leadNumber },
      { header: 'Client Name', accessor: (l) => l.clientName },
      { header: 'Phone', accessor: (l) => l.phone },
      { header: 'Company', accessor: (l) => l.company || 'N/A' },
      { header: 'Source', accessor: (l) => l.source },
      { header: 'Status', accessor: (l) => l.currentStatus },
      { header: 'Owner', accessor: (l) => l.currentOwner?.name || 'Unassigned' },
      { header: 'Team', accessor: (l) => l.currentOwner?.team?.name || 'N/A' },
      { header: 'Next Action', accessor: (l) => l.nextAction || 'None' },
      {
        header: 'Next Action Scheduled',
        accessor: (l) => (l.nextActionAt ? new Date(l.nextActionAt).toLocaleString() : 'None'),
      },
      { header: 'Created Date', accessor: (l) => new Date(l.createdAt).toLocaleDateString() },
    ];
    const csv = generateCSV(leads, columns);
    downloadCSV(`orvion_interested_leads_${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E5E0]">
        <div>
          <h2 className="text-xl font-bold text-[#171817] flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#B69A63]" /> Interested Leads Management
          </h2>
          <p className="text-xs text-[#626560] mt-1">
            High-intent qualified prospects across company pipelines. Supervise conversion velocity and ensure rapid next actions.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Button size="sm" variant="outline" onClick={handleExportCSV} disabled={leads.length === 0}>
            <Download className="w-3.5 h-3.5 mr-1 text-[#B69A63]" /> Export CSV / Excel
          </Button>
          <Button size="sm" variant="secondary" onClick={fetchInterestedLeads} isLoading={loading}>
            <RefreshCw className="w-3.5 h-3.5 mr-1 text-[#B69A63]" /> Refresh
          </Button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-white border border-[#E5E5E0] shadow-xs">
          <span className="text-[11px] text-[#626560] font-medium">Total Interested</span>
          <p className="text-2xl font-bold text-[#B69A63] mt-1">{total}</p>
        </div>

        <div className="p-4 rounded-xl bg-white border border-[#E5E5E0] shadow-xs">
          <span className="text-[11px] text-[#626560] font-medium flex items-center gap-1">
            <UserCheck className="w-3.5 h-3.5 text-[#B69A63]" /> Under Active Follow-up
          </span>
          <p className="text-2xl font-bold text-[#171817] mt-1">{total - unassignedCount}</p>
        </div>

        <div className={`p-4 rounded-xl border transition shadow-xs ${
          unassignedCount > 0 ? 'bg-[#FAF8F5] border-[#B69A63]/40' : 'bg-white border-[#E5E5E0]'
        }`}>
          <span className={`text-[11px] font-medium flex items-center gap-1 ${
            unassignedCount > 0 ? 'text-[#B69A63]' : 'text-[#626560]'
          }`}>
            Unassigned (Needs Rep)
          </span>
          <p className={`text-2xl font-bold mt-1 ${
            unassignedCount > 0 ? 'text-[#B69A63]' : 'text-[#171817]'
          }`}>{unassignedCount}</p>
        </div>

        <div className={`p-4 rounded-xl border transition shadow-xs ${
          overdueCount > 0 ? 'bg-[#FAF0ED] border-[#F2C5BC]' : 'bg-white border-[#E5E5E0]'
        }`}>
          <span className={`text-[11px] font-medium flex items-center gap-1 ${
            overdueCount > 0 ? 'text-[#9A2215]' : 'text-[#626560]'
          }`}>
            <AlertTriangle className={`w-3.5 h-3.5 ${overdueCount > 0 ? 'text-[#B83220]' : 'text-[#AEB1AC]'}`} />
            Overdue Follow-ups
          </span>
          <p className={`text-2xl font-bold mt-1 ${
            overdueCount > 0 ? 'text-[#9A2215]' : 'text-[#171817]'
          }`}>{overdueCount}</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-xl bg-white border border-[#E5E5E0] shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Search Box */}
          <div className="relative sm:col-span-2">
            <Search className="w-4 h-4 text-[#AEB1AC] absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by Lead ID (ORV-...), Client Name, Phone..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-white border border-[#E5E5E0] text-[#171817] placeholder-[#AEB1AC] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/30"
            />
          </div>

          {/* Executive Filter */}
          <div>
            <select
              value={ownerId}
              onChange={(e) => {
                setOwnerId(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-xs rounded-lg bg-white border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/30"
            >
              <option value="">All Executives</option>
              {executives.map((exec) => (
                <option key={exec.id} value={exec.id}>
                  {exec.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick Toggles */}
        <div className="flex items-center space-x-2 pt-1 flex-wrap gap-y-2">
          <button
            onClick={() => setOverdueOnly(!overdueOnly)}
            className={`text-xs px-2.5 py-1 rounded-lg border transition cursor-pointer ${
              overdueOnly
                ? 'bg-[#FAF0ED] border-[#F2C5BC] text-[#9A2215] font-medium shadow-xs'
                : 'bg-[#F8F8F6] border-[#E5E5E0] text-[#626560] hover:text-[#171817] hover:border-[#B69A63]/40'
            }`}
          >
            Overdue Only
          </button>

          {(search || ownerId || overdueOnly) && (
            <button
              onClick={() => {
                setSearch('');
                setOwnerId('');
                setOverdueOnly(false);
                setPage(1);
              }}
              className="text-xs text-[#8C9089] hover:text-[#171817] flex items-center gap-1 ml-auto transition font-medium cursor-pointer"
            >
              <X className="w-3.5 h-3.5" /> Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Main Table */}
      <LeadTable
        leads={leads}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        onPageChange={(p) => setPage(p)}
        onUpdate={(lead) => setSelectedLeadForUpdate(lead)}
        onReassign={(lead) => setSelectedLeadForReassign(lead)}
        onLeadDeleted={fetchInterestedLeads}
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
          fetchInterestedLeads();
        }}
        executives={executives}
        canDelete={true}
        canReassign={true}
      />

      {/* Modals */}
      {selectedLeadForUpdate && (
        <LeadUpdateModal
          isOpen={true}
          onClose={() => setSelectedLeadForUpdate(null)}
          leadId={selectedLeadForUpdate.id}
          leadNumber={selectedLeadForUpdate.leadNumber}
          clientName={selectedLeadForUpdate.clientName}
          currentStatus={selectedLeadForUpdate.currentStatus}
          onSuccess={fetchInterestedLeads}
        />
      )}

      {selectedLeadForReassign && (
        <ReassignModal
          isOpen={true}
          onClose={() => setSelectedLeadForReassign(null)}
          leadId={selectedLeadForReassign.id}
          leadNumber={selectedLeadForReassign.leadNumber}
          clientName={selectedLeadForReassign.clientName}
          currentOwnerName={selectedLeadForReassign.currentOwner?.name}
          onSuccess={fetchInterestedLeads}
        />
      )}
    </div>
  );
}
