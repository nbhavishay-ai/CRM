'use client';

import React, { useState } from 'react';
import {
  Trash2,
  RefreshCw,
  Tag,
  Download,
  X,
  AlertTriangle,
  CheckCircle2,
  Users,
  Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { emitCrmSync } from '@/lib/sync-event';
import { invalidateFastCache } from '@/lib/fast-data';
import { generateCSV, downloadCSV, ExportColumn } from '@/lib/export-utils';

export interface BulkActionBarProps {
  selectedIds: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectedLeads?: any[];
  onClearSelection: () => void;
  onSuccess: () => void;
  executives?: Array<{ id: string; name: string }>;
  canDelete?: boolean;
  canReassign?: boolean;
  reassignLabel?: string;
}

export const BulkActionBar: React.FC<BulkActionBarProps> = ({
  selectedIds,
  selectedLeads = [],
  onClearSelection,
  onSuccess,
  executives = [],
  canDelete = true,
  canReassign = true,
  reassignLabel = 'Reassign',
}) => {
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);

  // Reassign form state
  const [newOwnerId, setNewOwnerId] = useState('');
  const [reassignReason, setReassignReason] = useState('Bulk Reassignment');

  // Status form state
  const [newStatus, setNewStatus] = useState('INTERESTED');
  const [statusRemark, setStatusRemark] = useState('');

  // Processing states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (selectedIds.length === 0) return null;

  const count = selectedIds.length;

  const handleBulkDelete = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/leads/bulk-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'DELETE',
          ids: selectedIds,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete leads');
      }

      invalidateFastCache();
      emitCrmSync('leads');
      emitCrmSync('calling');
      emitCrmSync('all');
      setIsDeleteModalOpen(false);
      onClearSelection();
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error deleting leads');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/leads/bulk-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'REASSIGN',
          ids: selectedIds,
          newOwnerId: newOwnerId || null,
          reason: reassignReason,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to reassign leads');
      }

      invalidateFastCache();
      emitCrmSync('leads');
      emitCrmSync('calling');
      emitCrmSync('all');
      setIsReassignModalOpen(false);
      onClearSelection();
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error reassigning leads');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/leads/bulk-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'STATUS_UPDATE',
          ids: selectedIds,
          status: newStatus,
          remark: statusRemark || `Bulk updated to ${newStatus}`,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update lead status');
      }

      invalidateFastCache();
      emitCrmSync('leads');
      emitCrmSync('calling');
      emitCrmSync('all');
      setIsStatusModalOpen(false);
      onClearSelection();
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error updating leads');
    } finally {
      setLoading(false);
    }
  };

  const handleExportSelected = () => {
    if (selectedLeads.length === 0) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const columns: ExportColumn<any>[] = [
      { header: 'Lead Number', accessor: (l) => l.leadNumber },
      { header: 'Client Name', accessor: (l) => l.clientName },
      { header: 'Phone', accessor: (l) => l.phone },
      { header: 'Company', accessor: (l) => l.company || 'N/A' },
      { header: 'Source', accessor: (l) => l.source },
      { header: 'Status', accessor: (l) => l.currentStatus },
      { header: 'Category', accessor: (l) => l.currentCategory },
      { header: 'Owner', accessor: (l) => l.currentOwner?.name || 'Unassigned' },
      { header: 'Next Action', accessor: (l) => l.nextAction || 'None' },
      {
        header: 'Next Action Due',
        accessor: (l) => (l.nextActionAt ? new Date(l.nextActionAt).toLocaleString() : 'None'),
      },
    ];
    const csv = generateCSV(selectedLeads, columns);
    downloadCSV(`orvion_selected_${count}_leads_${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-2xl w-[92%] bg-[#171817]/95 backdrop-blur-md text-white px-4 py-3 rounded-2xl shadow-2xl border border-white/10 flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200">
        <div className="flex items-center gap-2.5">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#B69A63] text-black text-xs font-bold font-mono">
            {count}
          </span>
          <span className="text-xs font-semibold tracking-wide">
            {count} {count === 1 ? 'lead' : 'leads'} selected
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {canDelete && (
            <button
              type="button"
              onClick={() => setIsDeleteModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600/90 hover:bg-red-600 text-white text-xs font-semibold transition cursor-pointer shadow-xs active:scale-95"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          )}

          {canReassign && (
            <button
              type="button"
              onClick={() => setIsReassignModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition cursor-pointer active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#B69A63]" />
              <span>{reassignLabel}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsStatusModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition cursor-pointer active:scale-95"
          >
            <Tag className="w-3.5 h-3.5 text-blue-400" />
            <span>Status</span>
          </button>

          {selectedLeads.length > 0 && (
            <button
              type="button"
              onClick={handleExportSelected}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition cursor-pointer active:scale-95"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Export</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClearSelection}
            className="p-1.5 rounded-xl hover:bg-white/10 text-white/70 hover:text-white transition cursor-pointer ml-1"
            title="Deselect all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Confirm Bulk Deletion"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-900">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-bold text-sm">Permanently delete {count} selected leads?</p>
              <p className="text-red-700">
                This action is permanent and cannot be undone. All call logs, remarks history, and
                timeline events associated with these leads will be deleted.
              </p>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E5E0]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsDeleteModalOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleBulkDelete}
              isLoading={loading}
            >
              <Trash2 className="w-4 h-4 mr-1.5" /> Permanently Delete {count} Leads
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reassign Modal */}
      <Modal
        isOpen={isReassignModalOpen}
        onClose={() => setIsReassignModalOpen(false)}
        title={`${reassignLabel} ${count} Leads`}
      >
        <form onSubmit={handleBulkReassign} className="space-y-4">
          <p className="text-xs text-[#626560]">
            Give all {count} selected leads to an Executive or Team Lead. Assigned leads will enter that user&apos;s Today&apos;s Leads queue.
          </p>

          <div>
            <label className="block text-xs font-semibold text-[#171817] mb-1">
              Select Assignee
            </label>
            <select
              value={newOwnerId}
              onChange={(e) => setNewOwnerId(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-[#E5E5E0] rounded-xl bg-white focus:outline-hidden focus:ring-2 focus:ring-[#B69A63]"
            >
              <option value="">Unassigned (Admin Lead Storage)</option>
              {executives.map((exec) => (
                <option key={exec.id} value={exec.id}>
                  {exec.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#171817] mb-1">
              Assignment Reason
            </label>
            <input
              type="text"
              value={reassignReason}
              onChange={(e) => setReassignReason(e.target.value)}
              placeholder="e.g. Workload redistribution, Campaign lead handover"
              className="w-full text-xs px-3 py-2 border border-[#E5E5E0] rounded-xl bg-white focus:outline-hidden focus:ring-2 focus:ring-[#B69A63]"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E5E0]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsReassignModalOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={loading}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Give {count} Leads
            </Button>
          </div>
        </form>
      </Modal>

      {/* Status Update Modal */}
      <Modal
        isOpen={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        title={`Bulk Update Status (${count} Leads)`}
      >
        <form onSubmit={handleBulkStatusUpdate} className="space-y-4">
          <p className="text-xs text-[#626560]">
            Change the current status for all {count} selected leads simultaneously.
          </p>

          <div>
            <label className="block text-xs font-semibold text-[#171817] mb-1">
              Select New Status
            </label>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-[#E5E5E0] rounded-xl bg-white focus:outline-hidden focus:ring-2 focus:ring-[#B69A63]"
            >
              <option value="NEW">New</option>
              <option value="INTERESTED">Interested</option>
              <option value="FOLLOW_UP">Follow-up Required</option>
              <option value="CALL_BACK">Call Back</option>
              <option value="MEETING">Meeting Scheduled</option>
              <option value="SITE_VISIT">Site Visit</option>
              <option value="QUOTATION">Quotation Sent</option>
              <option value="NEGOTIATION">Negotiation</option>
              <option value="NOT_ANSWERING">Not Answering</option>
              <option value="NOT_INTERESTED">Not Interested</option>
              <option value="CHANNEL_PARTNER">Channel Partner</option>
              <option value="OTHER">Other Category</option>
              <option value="CLOSED_WON">Closed Won</option>
              <option value="CLOSED_LOST">Closed Lost</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#171817] mb-1">
              Update Remark / Note
            </label>
            <input
              type="text"
              value={statusRemark}
              onChange={(e) => setStatusRemark(e.target.value)}
              placeholder="e.g. Mass review, follow-up campaign completed"
              className="w-full text-xs px-3 py-2 border border-[#E5E5E0] rounded-xl bg-white focus:outline-hidden focus:ring-2 focus:ring-[#B69A63]"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E5E0]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsStatusModalOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={loading}>
              <Tag className="w-3.5 h-3.5 mr-1.5" /> Apply Status to {count} Leads
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
};
