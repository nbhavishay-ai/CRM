'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { emitCrmSync } from '@/lib/sync-event';
import { invalidateFastCache } from '@/lib/fast-data';

interface ReassignModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadId: string;
  leadNumber: string;
  clientName: string;
  currentOwnerName?: string;
  onSuccess: () => void;
}

export const ReassignModal: React.FC<ReassignModalProps> = ({
  isOpen,
  onClose,
  leadId,
  leadNumber,
  clientName,
  currentOwnerName = 'Unassigned',
  onSuccess,
}) => {
  const [newOwnerId, setNewOwnerId] = useState('');
  const [reason, setReason] = useState('');
  const [executives, setExecutives] = useState<Array<{ id: string; name: string; role?: string; team?: { name: string } }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/users')
        .then((res) => res.json())
        .then((data) => {
          const assignable = (data.users || []).filter(
            (u: { role: string; active?: boolean }) =>
              u.role !== 'HR' && u.role !== 'ADMIN' && u.active !== false
          );
          setExecutives(assignable);
        })
        .catch(() => {});
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOwnerId) {
      setError('Please select a target executive for reassignment.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/leads/${leadId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newOwnerId,
          reason: reason.trim() || 'Management operational reassignment',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to reassign lead');
      }

      invalidateFastCache();
      emitCrmSync('leads');
      emitCrmSync('calling');
      emitCrmSync('all');
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error reassigning lead');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Reassign Lead: ${leadNumber}`}
      subtitle={`Client: ${clientName} | Current: ${currentOwnerName}`}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-[#FAF0ED] border border-[#F2C5BC] text-[#9A2215] text-xs font-medium">
            {error}
          </div>
        )}

        <div className="p-3.5 rounded-lg bg-[#FAF8F5] border border-[#B69A63]/30 text-xs text-[#626560] leading-relaxed">
          <p className="text-[#B69A63] font-semibold mb-0.5">Atomic Reassignment Guarantee</p>
          Reassigning will preserve the permanent ID ({leadNumber}), maintain all previous remarks and timeline events, and immediately flag this lead as <strong className="text-[#171817] font-semibold">&ldquo;NEW TO ME&rdquo;</strong> in the recipient&apos;s active workspace.
        </div>

        <div>
          <label className="block text-xs font-medium text-[#171817] mb-1">
            Target Assignee <span className="text-[#B69A63]">*</span>
          </label>
          <select
            required
            value={newOwnerId}
            onChange={(e) => setNewOwnerId(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/30 shadow-2xs"
          >
            <option value="">-- Select Target Assignee --</option>
            {executives.map((exec) => (
              <option key={exec.id} value={exec.id}>
                {exec.name} ({exec.role === 'TEAM_LEAD' ? 'Team Lead' : 'Sales Executive'}{exec.team ? ` • ${exec.team.name}` : ''})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#171817] mb-1">
            Reason for Reassignment
          </label>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Executive on leave / Client requested commercial zoning specialist / Overdue escalation"
            className="w-full px-3 py-2 text-xs rounded-lg bg-white border border-[#E5E5E0] text-[#171817] placeholder-[#AEB1AC] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/30"
          />
        </div>

        <div className="flex justify-end space-x-2 pt-3 border-t border-[#E5E5E0]">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={loading}>
            Confirm Reassignment
          </Button>
        </div>
      </form>
    </Modal>
  );
};
