'use client';

import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { emitCrmSync } from '@/lib/sync-event';
import { invalidateFastCache } from '@/lib/fast-data';

interface LeadUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadId: string;
  leadNumber: string;
  clientName: string;
  currentStatus: string;
  onSuccess: () => void;
  discardOnNegativeStatus?: boolean;
}

export const LeadUpdateModal: React.FC<LeadUpdateModalProps> = ({
  isOpen,
  onClose,
  leadId,
  leadNumber,
  clientName,
  currentStatus,
  onSuccess,
  discardOnNegativeStatus = false,
}) => {
  const [editableName, setEditableName] = useState(clientName);
  const [remark, setRemark] = useState('');
  const [status, setStatus] = useState(currentStatus);
  const [nextActionType, setNextActionType] = useState('Call');
  const [customNextAction, setCustomNextAction] = useState('');
  const [nextActionAt, setNextActionAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setStatus(currentStatus);
      setError(null);
    }
  }, [isOpen, clientName, currentStatus]);

  const nextActionOptions = [
    'Call',
    'WhatsApp',
    'Meeting',
    'Site Visit',
    'Send Quotation',
    'Follow-up Later',
    'Other',
    'Close',
  ];

  const statusOptions = [
    { value: 'NEW', label: 'New' },
    { value: 'INTERESTED', label: 'Interested' },
    { value: 'FOLLOW_UP', label: 'Follow-up' },
    { value: 'CALL_BACK', label: 'Call Back' },
    { value: 'MEETING', label: 'Meeting' },
    { value: 'SITE_VISIT', label: 'Site Visit' },
    { value: 'QUOTATION', label: 'Quotation' },
    { value: 'NEGOTIATION', label: 'Negotiation' },
    { value: 'NOT_ANSWERING', label: 'Not Answering' },
    { value: 'NOT_INTERESTED', label: 'Not Interested' },
    { value: 'CHANNEL_PARTNER', label: 'Channel Partner' },
    { value: 'OTHER', label: 'Other' },
    { value: 'CLOSED_WON', label: 'Closed (Won)' },
    { value: 'CLOSED_LOST', label: 'Closed (Lost)' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remark.trim()) {
      setError('Please provide a remark describing what happened.');
      return;
    }

    setLoading(true);
    setError(null);

    const effectiveNextAction =
      nextActionType === 'Other'
        ? customNextAction.trim() || 'Follow-up'
        : nextActionType === 'Close'
        ? 'Lead Closed'
        : `${nextActionType}: ${customNextAction.trim() || 'Next step'}`;

    try {
      const res = await fetch(`/api/leads/${leadId}/updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          remark: remark.trim(),
          status,
          nextAction: nextActionType === 'Close' ? null : effectiveNextAction,
          nextActionAt: nextActionAt ? new Date(nextActionAt).toISOString() : null,
          discardOnNegativeStatus,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to record update');
      }

      setRemark('');
      invalidateFastCache();
      emitCrmSync('leads');
      emitCrmSync('calling');
      emitCrmSync('all');
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error updating lead');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Log Update: ${leadNumber}`}
      subtitle={clientName}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-[#FAF0ED] border border-[#F2C5BC] text-[#9A2215] text-xs font-medium">
            {error}
          </div>
        )}

        {/* Client identity */}
        <div>
          <label className="block text-xs font-semibold text-[#B69A63] tracking-wide uppercase mb-1.5">
            Lead / Client Name
          </label>
          <input
            type="text"
            value={editableName}
            onChange={(e) => setEditableName(e.target.value)}
            placeholder="Enter client's full name"
            className="w-full px-3 py-2 text-xs rounded-lg bg-white border border-[#E5E5E0] text-[#171817] placeholder-[#AEB1AC] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/30 font-semibold"
          />
          <p className="text-[10px] text-[#8C908A] mt-1">
            Update the name when the client identity is confirmed or corrected. Phone number changes require an administrator.
          </p>
        </div>

        {/* 1. WHAT HAPPENED? */}
        <div>
          <label className="block text-xs font-semibold text-[#B69A63] tracking-wide uppercase mb-1.5">
            1. What Happened? <span className="text-[#171817]">*</span>
          </label>
          <textarea
            required
            rows={3}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="Document discussion summary, client feedback, pricing discussed, or objections..."
            className="w-full px-3 py-2.5 text-xs rounded-lg bg-white border border-[#E5E5E0] text-[#171817] placeholder-[#AEB1AC] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/30 resize-none font-sans leading-relaxed"
          />
        </div>

        {/* Current Lead Status */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#171817] mb-1">Update Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-white border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/30"
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#171817] mb-1">Action Type</label>
            <select
              value={nextActionType}
              onChange={(e) => setNextActionType(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-white border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/30"
            >
              {nextActionOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 2. WHAT'S NEXT? & 3. WHEN? */}
        {nextActionType !== 'Close' && (
          <div className="p-3.5 rounded-lg bg-[#FAF8F5] border border-[#B69A63]/25 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-[#B69A63] tracking-wide uppercase mb-1">
                2. What&apos;s Next?
              </label>
              <input
                type="text"
                value={customNextAction}
                onChange={(e) => setCustomNextAction(e.target.value)}
                placeholder={`Details for ${nextActionType} (e.g. Discuss TP3 parcel layout)`}
                className="w-full px-3 py-2 text-xs rounded-lg bg-white border border-[#E5E5E0] text-[#171817] placeholder-[#AEB1AC] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/30"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#B69A63] tracking-wide uppercase mb-1">
                3. When? (Due Date & Time)
              </label>
              <input
                type="datetime-local"
                value={nextActionAt}
                onChange={(e) => setNextActionAt(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg bg-white border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/30"
              />
            </div>
          </div>
        )}

        <div className="flex justify-end space-x-2 pt-3 border-t border-[#E5E5E0]">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={loading}>
            Save Lead Update
          </Button>
        </div>
      </form>
    </Modal>
  );
};
