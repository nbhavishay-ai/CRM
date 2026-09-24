'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Search, RefreshCw, X, UploadCloud } from 'lucide-react';
import { LeadTable } from '@/components/leads/LeadTable';
import { LeadUpdateModal } from '@/components/leads/LeadUpdateModal';
import { ReassignModal } from '@/components/leads/ReassignModal';
import { BulkActionBar } from '@/components/leads/BulkActionBar';
import { Button } from '@/components/ui/Button';
import { useCrmSync } from '@/lib/sync-event';
import { getFastCache, setFastCache } from '@/lib/fast-data';
import { useLiveUsers } from '@/lib/use-live-users';
import { useSearchParams } from 'next/navigation';

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
  currentOwner?: {
    id: string;
    name: string;
    team?: { id: string; name: string } | null;
  } | null;
}

interface LeadsCachePayload {
  leads: LeadItem[];
  total: number;
}

export default function AdminAllLeadsPage() {
  const searchParams = useSearchParams();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(() => searchParams.get('overdue') === 'true');
  const [withoutNextAction, setWithoutNextAction] = useState(
    () => searchParams.get('withoutNextAction') === 'true'
  );
  const [unassignedOnly, setUnassignedOnly] = useState(
    () => searchParams.get('unassigned') === 'true'
  );

  const cacheKey = `crm:admin:leads:${page}:${pageSize}:${search}:${status}:${category}:${ownerId}:${overdueOnly}:${withoutNextAction}:${unassignedOnly}`;

  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const { users: assignableUsers } = useLiveUsers();
  const executives = assignableUsers.filter(
    (user) => (user.role === 'EXECUTIVE' || user.role === 'TEAM_LEAD') && user.active !== false
  );
  const [loading, setLoading] = useState(false);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Modals state
  const [selectedLeadForUpdate, setSelectedLeadForUpdate] = useState<LeadItem | null>(null);
  const [selectedLeadForReassign, setSelectedLeadForReassign] = useState<LeadItem | null>(null);
  const [storageAssignCount, setStorageAssignCount] = useState('');
  const [storageAssignOwnerId, setStorageAssignOwnerId] = useState('');
  const [storageAssigning, setStorageAssigning] = useState(false);
  const [storageAssignError, setStorageAssignError] = useState<string | null>(null);

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

  const fetchLeads = useCallback(async (isBackground: boolean | unknown = false) => {
    const isBg = isBackground === true;
    const currentKey = `crm:admin:leads:${page}:${search}:${status}:${category}:${ownerId}:${overdueOnly}:${withoutNextAction}:${unassignedOnly}`;
    const cached = getFastCache<LeadsCachePayload>(currentKey);
    if (!cached && !isBg) {
      setLoading(true);
    }

    const params = new URLSearchParams();
    params.set('_t', Date.now().toString());
    params.set('page', page.toString());
    params.set('pageSize', pageSize.toString());
    params.set('excludeCallingData', 'true');
    if (search.trim()) params.set('search', search.trim());
    if (status) params.set('status', status);
    if (category) params.set('category', category);
    if (ownerId) params.set('ownerId', ownerId);
    if (overdueOnly) params.set('overdue', 'true');
    if (withoutNextAction) params.set('withoutNextAction', 'true');
    if (unassignedOnly) params.set('ownerId', 'null');

    try {
      const res = await fetch(`/api/leads?${params.toString()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (res.ok) {
        const data = await res.json();
        const payload: LeadsCachePayload = {
          leads: data.leads || [],
          total: data.total || 0,
        };
        setLeads(payload.leads);
        setTotal(payload.total);
        setFastCache(currentKey, payload, 60000);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, status, category, ownerId, overdueOnly, withoutNextAction, unassignedOnly]);

  useEffect(() => {
    const cached = getFastCache<LeadsCachePayload>(cacheKey);
    if (cached) {
      setLeads(cached.leads);
      setTotal(cached.total);
      setLoading(false);
      fetchLeads(true);
    } else {
      fetchLeads(false);
    }
    const handleFocus = () => fetchLeads(true);
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchLeads, cacheKey]);

  // Instant 0ms cross-tab and local sync
  useCrmSync(['leads', 'calling', 'all'], () => {
    fetchLeads(true);
  });

  const clearFilters = () => {
    setSearch('');
    setStatus('');
    setCategory('');
    setOwnerId('');
    setOverdueOnly(false);
    setWithoutNextAction(false);
    setUnassignedOnly(false);
    setPage(1);
  };

  const assignFromStorage = async () => {
    const count = Number(storageAssignCount);
    if (!Number.isInteger(count) || count < 1) {
      setStorageAssignError('Enter a whole number of leads to assign.');
      return;
    }
    if (count > total) {
      setStorageAssignError(`Only ${total} stored lead${total === 1 ? '' : 's'} available.`);
      return;
    }
    if (!storageAssignOwnerId) {
      setStorageAssignError('Select an Executive or Team Lead.');
      return;
    }

    setStorageAssigning(true);
    setStorageAssignError(null);
    try {
      const params = new URLSearchParams({
        ownerId: 'null',
        page: '1',
        pageSize: String(count),
        excludeCallingData: 'true',
        _t: Date.now().toString(),
      });
      const storedResponse = await fetch(`/api/leads?${params.toString()}`, { cache: 'no-store' });
      const storedData = await storedResponse.json();
      if (!storedResponse.ok) {
        throw new Error(storedData.error || 'Unable to load stored leads.');
      }
      const ids = (storedData.leads || []).slice(0, count).map((lead: LeadItem) => lead.id);
      if (ids.length !== count) {
        throw new Error(`Only ${ids.length} stored leads are available.`);
      }

      const response = await fetch('/api/leads/bulk-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'REASSIGN',
          ids,
          newOwnerId: storageAssignOwnerId,
          reason: 'Assigned from Admin Lead Storage',
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to assign stored leads.');
      }

      setStorageAssignCount('');
      setStorageAssignOwnerId('');
      invalidateFastCache();
      emitCrmSync('leads');
      emitCrmSync('all');
      await fetchLeads();
    } catch (error: unknown) {
      setStorageAssignError(error instanceof Error ? error.message : 'Unable to assign stored leads.');
    } finally {
      setStorageAssigning(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E8E8E3]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] uppercase font-mono tracking-widest text-[#B69A63] font-semibold">
              Master Lead Registry
            </span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[#F4F4F1] border border-[#E8E8E3] text-[#626560] tabular-nums">
              {total} Total
            </span>
          </div>
          <h2 className="text-xl font-serif font-bold text-[#171817] tracking-tight">All Company Leads</h2>
          <p className="text-xs text-[#626560] mt-0.5 font-sans">
            Centralized enterprise registry with direct filtering, executive and team-lead reassignment, and status triage.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/admin/bulk-upload"
            className="px-3.5 py-2 rounded-lg bg-[#111314] hover:bg-[#1C1E20] text-[#F4F2EC] text-xs font-semibold inline-flex items-center gap-1.5 transition border border-[#232628] shadow-xs"
          >
            <UploadCloud className="w-3.5 h-3.5 text-[#B69A63]" /> Bulk Upload
          </Link>
          <Button size="sm" variant="secondary" onClick={fetchLeads} isLoading={loading}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-xl bg-white border border-[#E8E8E3] shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search Box */}
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 text-[#8C9089] absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by Lead ID (ORV-...), Client Name, Phone..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-[#F8F8F6] border border-[#E8E8E3] text-[#171817] placeholder-[#8C9089] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63] transition font-sans"
            />
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-xs rounded-lg bg-[#F8F8F6] border border-[#E8E8E3] text-[#171817] focus:outline-none focus:border-[#B69A63] font-sans"
            >
              <option value="">All Statuses</option>
              <option value="NEW">New</option>
              <option value="INTERESTED">Interested</option>
              <option value="FOLLOW_UP">Follow-up</option>
              <option value="CALL_BACK">Call Back</option>
              <option value="MEETING">Meeting</option>
              <option value="SITE_VISIT">Site Visit</option>
              <option value="QUOTATION">Quotation</option>
              <option value="NEGOTIATION">Negotiation</option>
              <option value="NOT_ANSWERING">Not Answering</option>
              <option value="NOT_INTERESTED">Not Interested</option>
              <option value="CLOSED_WON">Closed (Won)</option>
              <option value="CLOSED_LOST">Closed (Lost)</option>
            </select>
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-xs rounded-lg bg-[#F8F8F6] border border-[#E8E8E3] text-[#171817] focus:outline-none focus:border-[#B69A63] font-sans"
            >
              <option value="">All Categories</option>
              <option value="ACTIVE">Active Pipeline</option>
              <option value="NOT_ANSWERING">Not Answering Queue</option>
              <option value="NOT_INTERESTED">Not Interested Queue</option>
              <option value="CHANNEL_PARTNER">Channel Partner</option>
              <option value="OTHER">Other</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>

          {/* Executive Owner */}
          <div>
            <select
              value={ownerId}
              onChange={(e) => {
                setOwnerId(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-xs rounded-lg bg-[#F8F8F6] border border-[#E8E8E3] text-[#171817] focus:outline-none focus:border-[#B69A63] font-sans"
            >
              <option value="">All Executives &amp; Team Leads</option>
              {executives.map((exec) => (
                <option key={exec.id} value={exec.id}>
                  {exec.name} ({exec.role === 'TEAM_LEAD' ? 'Team Lead' : 'Executive'})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick Toggles */}
        <div className="flex items-center space-x-2 pt-1 flex-wrap gap-y-2">
          <button
            onClick={() => {
              if (status === 'INTERESTED') {
                setStatus('');
              } else {
                setStatus('INTERESTED');
              }
              setPage(1);
            }}
            className={`text-xs px-2.5 py-1 rounded-lg border transition font-medium ${
              status === 'INTERESTED'
                ? 'bg-[#111314] border-[#B69A63] text-[#B69A63] font-semibold shadow-xs'
                : 'bg-[#F8F8F6] border-[#E8E8E3] text-[#626560] hover:text-[#171817] hover:border-[#D8D8D3]'
            }`}
          >
            ★ Interested
          </button>

          <button
            onClick={() => setOverdueOnly(!overdueOnly)}
            className={`text-xs px-2.5 py-1 rounded-lg border transition ${
              overdueOnly
                ? 'bg-[#111314] border-[#232628] text-[#F4F2EC] font-semibold shadow-xs'
                : 'bg-[#F8F8F6] border-[#E8E8E3] text-[#626560] hover:text-[#171817] hover:border-[#D8D8D3]'
            }`}
          >
            Overdue Follow-ups
          </button>

          <button
            onClick={() => setWithoutNextAction(!withoutNextAction)}
            className={`text-xs px-2.5 py-1 rounded-lg border transition ${
              withoutNextAction
                ? 'bg-[#111314] border-[#232628] text-[#F4F2EC] font-semibold shadow-xs'
                : 'bg-[#F8F8F6] border-[#E8E8E3] text-[#626560] hover:text-[#171817] hover:border-[#D8D8D3]'
            }`}
          >
            Without Next Action
          </button>

          <button
            onClick={() => setUnassignedOnly(!unassignedOnly)}
            className={`text-xs px-2.5 py-1 rounded-lg border transition ${
              unassignedOnly
                ? 'bg-[#111314] border-[#232628] text-[#F4F2EC] font-semibold shadow-xs'
                : 'bg-[#F8F8F6] border-[#E8E8E3] text-[#626560] hover:text-[#171817] hover:border-[#D8D8D3]'
            }`}
          >
            Lead Storage
          </button>

          {(search || status || category || ownerId || overdueOnly || withoutNextAction || unassignedOnly) && (
            <button
              onClick={clearFilters}
              className="text-xs text-[#8C9089] hover:text-[#171817] flex items-center gap-1 ml-auto transition font-medium"
            >
              <X className="w-3.5 h-3.5" /> Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Master Leads Table */}
      {unassignedOnly && (
        <div className="space-y-3 rounded-xl border border-[#B69A63]/30 bg-[#FAF8F5] px-4 py-3">
          <div>
            <p className="text-xs font-bold text-[#171817]">Admin Lead Storage</p>
            <p className="mt-0.5 text-[11px] text-[#626560]">
              Choose how many stored leads to give to a specific Executive or Team Lead. They will enter that person&apos;s Today&apos;s Leads queue.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="text-[11px] font-semibold text-[#626560]">
              Number of leads
              <input
                type="number"
                min="1"
                max={total}
                value={storageAssignCount}
                onChange={(event) => setStorageAssignCount(event.target.value)}
                placeholder={`1-${total}`}
                className="mt-1 block w-full rounded-lg border border-[#E5E5E0] bg-white px-3 py-2 text-xs text-[#171817] sm:w-32"
                disabled={storageAssigning || total === 0}
              />
            </label>
            <label className="text-[11px] font-semibold text-[#626560]">
              Give to
              <select
                value={storageAssignOwnerId}
                onChange={(event) => setStorageAssignOwnerId(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-[#E5E5E0] bg-white px-3 py-2 text-xs text-[#171817] sm:w-64"
                disabled={storageAssigning || total === 0}
              >
                <option value="">Select Executive or Team Lead</option>
                {executives.map((exec) => (
                  <option key={exec.id} value={exec.id}>
                    {exec.name} ({exec.role === 'TEAM_LEAD' ? 'Team Lead' : 'Executive'})
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              size="sm"
              variant="primary"
              onClick={assignFromStorage}
              isLoading={storageAssigning}
              disabled={total === 0}
            >
              Give Leads
            </Button>
            <span className="pb-2 text-[11px] font-semibold text-[#7A5B28]">
              {total} stored
            </span>
          </div>
          {storageAssignError && (
            <p role="alert" className="text-[11px] font-semibold text-[#8C332E]">{storageAssignError}</p>
          )}
        </div>
      )}

      <LeadTable
        leads={leads}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        onPageChange={(p) => setPage(p)}
        onUpdate={(lead) => setSelectedLeadForUpdate(lead)}
        onReassign={(lead) => setSelectedLeadForReassign(lead)}
        onLeadDeleted={fetchLeads}
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
          fetchLeads();
        }}
        executives={executives}
        canDelete={true}
        canReassign={true}
        reassignLabel={unassignedOnly ? 'Give to Executive' : 'Reassign'}
      />

      {/* Update Modal */}
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

      {/* Reassign Modal */}
      {selectedLeadForReassign && (
        <ReassignModal
          isOpen={true}
          onClose={() => setSelectedLeadForReassign(null)}
          leadId={selectedLeadForReassign.id}
          leadNumber={selectedLeadForReassign.leadNumber}
          clientName={selectedLeadForReassign.clientName}
          currentOwnerName={selectedLeadForReassign.currentOwner?.name}
          onSuccess={fetchLeads}
        />
      )}
    </div>
  );
}
