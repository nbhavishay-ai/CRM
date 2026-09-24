'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Phone,
  ArrowUpRight,
  Clock,
  UserCheck,
  RefreshCw,
  AlertTriangle,
  MessageCircle,
  FileText,
  Trash2,
} from 'lucide-react';
import { Badge, getStatusBadgeVariant } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { WhatsAppModal } from './WhatsAppModal';
import { LeadTemperatureBadge } from './LeadTemperatureBadge';
import { formatWhatsAppUrl, formatTelUrl } from '@/lib/contact';
import { emitCrmSync } from '@/lib/sync-event';

export interface LeadItem {
  id: string;
  leadNumber: string;
  clientName: string;
  phone: string;
  company?: string | null;
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
  currentOwner?: { id: string; name: string; team?: { id: string; name: string } | null } | null;
  updates?: Array<{ id: string; remark: string; createdAt: string | Date; user?: { name: string } | null }>;
}

interface LeadTableProps {
  leads: LeadItem[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  onUpdate?: (lead: LeadItem) => void;
  onReassign?: (lead: LeadItem) => void;
  onDelete?: (lead: LeadItem) => void;
  onLeadDeleted?: () => void;
  canReassign?: boolean;
  canDelete?: boolean;
  selectable?: boolean;
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: () => void;
}

export const LeadTable: React.FC<LeadTableProps> = ({
  leads,
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onUpdate,
  onReassign,
  onDelete,
  onLeadDeleted,
  canReassign = false,
  canDelete = true,
  selectable = true,
  selectedIds = [],
  onToggleSelect,
  onToggleSelectAll,
}) => {
  const [activeWhatsAppLead, setActiveWhatsAppLead] = useState<LeadItem | null>(null);
  const [deletingLead, setDeletingLead] = useState<LeadItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const totalPages = Math.ceil(total / pageSize);
  const allOnPageSelected =
    leads.length > 0 && leads.every((lead) => selectedIds.includes(lead.id));
  const someOnPageSelected =
    leads.some((lead) => selectedIds.includes(lead.id)) && !allOnPageSelected;

  const handleConfirmSingleDelete = async () => {
    if (!deletingLead) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      if (onDelete) {
        await onDelete(deletingLead);
      } else {
        const res = await fetch(`/api/leads/${deletingLead.id}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to delete lead');
        }
        emitCrmSync('leads');
        emitCrmSync('calling');
        if (onLeadDeleted) onLeadDeleted();
      }
      setDeletingLead(null);
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Error deleting lead');
    } finally {
      setDeleteLoading(false);
    }
  };

  if (leads.length === 0) {
    return (
      <div className="p-12 text-center rounded-2xl bg-white border border-[#E5E5E0] shadow-xs">
        <p className="text-[#626560] text-sm">No leads match the selected criteria.</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl border border-[#E5E5E0] bg-white overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#171817]">
            <thead className="bg-[#F8F8F6] text-[11px] font-bold text-[#626560] uppercase tracking-wider border-b border-[#E5E5E0]">
              <tr>
                {selectable && onToggleSelectAll && (
                  <th className="px-3.5 py-3.5 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someOnPageSelected;
                      }}
                      onChange={onToggleSelectAll}
                      className="w-4 h-4 rounded-md border-[#D1D1CB] text-[#B69A63] focus:ring-[#B69A63] cursor-pointer accent-[#B69A63]"
                      title={allOnPageSelected ? 'Deselect all on this page' : 'Select all on this page'}
                    />
                  </th>
                )}
                <th className="px-4 py-3.5">Lead ID</th>
                <th className="px-4 py-3.5">Client</th>
                <th className="px-4 py-3.5">Phone</th>
                <th className="px-4 py-3.5">Owner &amp; Team</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Latest Note</th>
                <th className="px-4 py-3.5">Next Action</th>
                <th className="px-4 py-3.5">Next Due</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E5E0]">
              {leads.map((lead) => {
                const isOverdue =
                  lead.nextActionAt &&
                  new Date(lead.nextActionAt) < new Date() &&
                  lead.currentCategory === 'ACTIVE';
                const isSelected = selectedIds.includes(lead.id);
                const latestNote = lead.updates?.[0];

                return (
                  <tr
                    key={lead.id}
                    className={`transition-colors ${
                      isSelected ? 'bg-[#FAF6EE] hover:bg-[#F5EEDD]' : 'hover:bg-[#FAF9F5]'
                    }`}
                  >
                    {selectable && onToggleSelect && (
                      <td className="px-3.5 py-3.5 text-center whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => onToggleSelect(lead.id)}
                          className="w-4 h-4 rounded-md border-[#D1D1CB] text-[#B69A63] focus:ring-[#B69A63] cursor-pointer accent-[#B69A63]"
                          title={isSelected ? 'Deselect lead' : 'Select lead'}
                        />
                      </td>

                    )}

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-mono font-bold text-[#171817] bg-[#F8F8F6] px-2 py-0.5 rounded border border-[#E5E5E0]">
                          {lead.leadNumber}
                        </span>
                        {lead.isNewToMe && (
                          <span title="New to Me" className="text-[#B69A63]">
                            <UserCheck className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <div>
                        <Link
                          href={`/dashboard/leads/${lead.id}`}
                          prefetch={true}
                          className="font-semibold text-[#171817] hover:text-[#B69A63] transition"
                        >
                          {lead.clientName}
                        </Link>
                        {lead.company && (
                          <p className="text-[11px] text-[#626560] truncate max-w-[160px]">
                            {lead.company}
                          </p>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <a
                          href={formatTelUrl(lead.phone)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#EDF5F0] hover:bg-[#E3EFE7] text-[#2D5A3C] border border-[#D3E5D9] text-xs font-semibold transition"
                          title="Click to dial directly"
                        >
                          <Phone className="w-3 h-3 text-[#2D5A3C]" /> {lead.phone}
                        </a>
                        <a
                          href={formatWhatsAppUrl(lead.phone, lead.clientName)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#EBF7F0] hover:bg-[#DFEFE6] text-[#1E7E34] border border-[#CDE9D7] text-xs font-semibold transition"
                          title="Connect on WhatsApp directly"
                        >
                          <MessageCircle className="w-3 h-3 text-[#25D366]" /> WhatsApp
                        </a>
                        <button
                          type="button"
                          onClick={() => setActiveWhatsAppLead(lead)}
                          title="Open message templates &amp; SMS"
                          className="p-1 rounded-md bg-[#F8F8F6] text-[#626560] hover:text-[#171817] hover:bg-[#F0EFEB] border border-[#E5E5E0] transition cursor-pointer shadow-2xs"
                        >
                          <FileText className="w-3 h-3 text-[#B69A63]" />
                        </button>
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      {lead.currentOwner ? (
                        <div>
                          <p className="font-medium text-[#171817]">{lead.currentOwner.name}</p>
                          <p className="text-[10px] text-[#626560]">
                            {lead.currentOwner.team?.name || 'No Team'}
                          </p>
                        </div>
                      ) : (
                        <span className="text-[11px] text-[#7A5B28] font-semibold bg-[#FAF5EB] px-2 py-0.5 rounded border border-[#E8DCBE]">
                          Unassigned
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Badge variant={getStatusBadgeVariant(lead.currentStatus)}>
                          {lead.currentStatus.replace('_', ' ')}
                        </Badge>
                        <LeadTemperatureBadge score={lead.score} temperature={lead.temperature} />
                      </div>
                    </td>

                    <td className="px-4 py-3.5 min-w-[220px] max-w-[320px]">
                      {latestNote ? (
                        <div title={latestNote.remark}>
                          <p className="line-clamp-2 text-[11px] text-[#171817]">{latestNote.remark}</p>
                          <p className="mt-1 text-[10px] text-[#8C908A]">
                            {latestNote.user?.name || 'Lead user'} · {new Date(latestNote.createdAt).toLocaleDateString('en-IN')}
                          </p>
                        </div>
                      ) : (
                        <span className="text-[11px] text-[#AEB1AC]">No remark yet</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 max-w-[200px] truncate">
                      {lead.nextAction ? (
                        <span className="text-[#171817] font-medium">{lead.nextAction}</span>
                      ) : (
                        <span className="text-[#90928E] text-[11px] italic">No next action set</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {lead.nextActionAt ? (
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs ${
                            isOverdue
                              ? 'text-[#8C332E] font-bold bg-[#FDF2F0] px-2.5 py-0.5 rounded-full border border-[#F1C7C5] shadow-2xs'
                              : 'text-[#626560]'
                          }`}
                        >
                          {isOverdue && <AlertTriangle className="w-3.5 h-3.5 text-[#8C332E]" />}
                          {!isOverdue && <Clock className="w-3.5 h-3.5 text-[#B69A63]" />}
                          {new Date(lead.nextActionAt).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                          })}{' '}
                          {new Date(lead.nextActionAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      ) : (
                        <span className="text-[#90928E]">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end space-x-1.5">
                        {/* Direct Call Quick Action */}
                        <a
                          href={formatTelUrl(lead.phone)}
                          className="p-1.5 rounded-lg bg-[#EDF5F0] text-[#2D5A3C] hover:bg-[#E3EFE7] border border-[#D3E5D9] transition shadow-2xs"
                          title={`Direct Call: ${lead.phone}`}
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </a>

                        {/* Direct WhatsApp Quick Action */}
                        <a
                          href={formatWhatsAppUrl(lead.phone, lead.clientName)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg bg-[#EBF7F0] text-[#1E7E34] hover:bg-[#DFEFE6] border border-[#CDE9D7] transition shadow-2xs"
                          title={`Connect on WhatsApp directly: ${lead.phone}`}
                        >
                          <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" />
                        </a>

                        {onUpdate && (
                          <Button size="sm" variant="secondary" onClick={() => onUpdate(lead)}>
                            Update
                          </Button>
                        )}
                        {canReassign && onReassign && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onReassign(lead)}
                            title="Reassign lead"
                          >
                            <RefreshCw className="w-3 h-3" />
                          </Button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => setDeletingLead(lead)}
                            className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 transition cursor-pointer"
                            title="Delete Lead"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <Link
                          href={`/dashboard/leads/${lead.id}`}
                          prefetch={true}
                          className="px-2 py-1.5 rounded-lg text-[#626560] hover:text-[#171817] hover:bg-[#F8F8F6] transition inline-flex items-center gap-1 text-[11px] font-semibold"
                          title="View Full Story"
                        >
                          <span>History</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-3.5 bg-[#F8F8F6] border-t border-[#E5E5E0] flex items-center justify-between text-xs text-[#626560]">
          <div className="flex items-center gap-3">
            {onPageSizeChange && (
              <label className="flex items-center gap-1.5 whitespace-nowrap">
                <span>Load</span>
                <select
                  value={pageSize}
                  onChange={(event) => onPageSizeChange(Number(event.target.value))}
                  className="rounded-md border border-[#D1D1CB] bg-white px-2 py-1 text-xs font-semibold text-[#171817] focus:border-[#B69A63] focus:outline-none"
                  aria-label="Leads per page"
                >
                  {[50, 100, 200, 300].map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
                <span>leads</span>
              </label>
            )}
            <span>
            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total} leads
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              Previous
            </Button>
            <span className="px-2 text-[#171817] font-bold">
              Page {page} of {totalPages || 1}
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>

        {activeWhatsAppLead && (
          <WhatsAppModal
            isOpen={Boolean(activeWhatsAppLead)}
            onClose={() => setActiveWhatsAppLead(null)}
            leadId={activeWhatsAppLead.id}
            clientName={activeWhatsAppLead.clientName}
            phone={activeWhatsAppLead.phone}
            onSuccess={() => {
              if (onUpdate) onUpdate(activeWhatsAppLead);
            }}
          />
        )}

        {/* Single Lead Delete Confirmation Modal */}
        <Modal
          isOpen={Boolean(deletingLead)}
          onClose={() => {
            setDeletingLead(null);
            setDeleteError(null);
          }}
          title="Confirm Lead Deletion"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-900">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-bold text-sm">
                  Permanently delete lead {deletingLead?.leadNumber} ({deletingLead?.clientName})?
                </p>
                <p className="text-red-700">
                  This action cannot be undone. All call logs, history remarks, and scheduled
                  follow-ups for this lead will be removed permanently.
                </p>
              </div>
            </div>

            {deleteError && (
              <div className="p-3 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs">
                {deleteError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E5E0]">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setDeletingLead(null);
                  setDeleteError(null);
                }}
                disabled={deleteLoading}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={handleConfirmSingleDelete}
                isLoading={deleteLoading}
              >
                <Trash2 className="w-4 h-4 mr-1.5" /> Permanently Delete Lead
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </>
  );
};
