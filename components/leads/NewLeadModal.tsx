'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface NewLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const NewLeadModal: React.FC<NewLeadModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [clientName, setClientName] = useState('');
  const [phone, setPhone] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [source, setSource] = useState('Website Form');
  const [assignToId, setAssignToId] = useState('');
  const [notes, setNotes] = useState('');
  const [nextAction, setNextAction] = useState('Initial Call & Qualification');
  const [nextActionAt, setNextActionAt] = useState('');
  const [executives, setExecutives] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Set default nextActionAt to 2 hours from now
      const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      setNextActionAt(d.toISOString().slice(0, 16));

      // Fetch active executives
      fetch('/api/users?role=EXECUTIVE')
        .then((res) => res.json())
        .then((data) => setExecutives(data.users || []))
        .catch(() => {});
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName,
          phone,
          alternatePhone: alternatePhone || undefined,
          email: email || undefined,
          company: company || undefined,
          location: location || undefined,
          source,
          assignToId: assignToId || undefined,
          notes: notes || undefined,
          nextAction,
          nextActionAt: nextActionAt ? new Date(nextActionAt).toISOString() : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create lead');
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error creating lead');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Enterprise Lead" maxWidth="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-[#FAF0ED] border border-[#F2C5BC] text-[#9A2215] text-xs font-medium">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#171817] mb-1">
              Client Name <span className="text-[#B69A63]">*</span>
            </label>
            <input
              type="text"
              required
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="e.g. Sanjay Godrej"
              className="w-full px-3 py-2 text-xs rounded-lg bg-white border border-[#E5E5E0] text-[#171817] placeholder-[#AEB1AC] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/30"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#171817] mb-1">
              Primary Phone <span className="text-[#B69A63]">*</span>
            </label>
            <input
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +91 98200 11223"
              className="w-full px-3 py-2 text-xs rounded-lg bg-white border border-[#E5E5E0] text-[#171817] placeholder-[#AEB1AC] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/30"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#171817] mb-1">Alternate Phone</label>
            <input
              type="text"
              value={alternatePhone}
              onChange={(e) => setAlternatePhone(e.target.value)}
              placeholder="e.g. +91 98200 99887"
              className="w-full px-3 py-2 text-xs rounded-lg bg-white border border-[#E5E5E0] text-[#171817] placeholder-[#AEB1AC] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/30"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#171817] mb-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="client@company.com"
              className="w-full px-3 py-2 text-xs rounded-lg bg-white border border-[#E5E5E0] text-[#171817] placeholder-[#AEB1AC] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/30"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#171817] mb-1">Company / Organization</label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Godrej Global"
              className="w-full px-3 py-2 text-xs rounded-lg bg-white border border-[#E5E5E0] text-[#171817] placeholder-[#AEB1AC] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/30"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#171817] mb-1">Location / City</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Mumbai / Ahmedabad"
              className="w-full px-3 py-2 text-xs rounded-lg bg-white border border-[#E5E5E0] text-[#171817] placeholder-[#AEB1AC] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/30"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#171817] mb-1">Lead Source</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-white border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/30"
            >
              <option value="Website Form">Website Form</option>
              <option value="Direct HNI Referral">Direct HNI Referral</option>
              <option value="LinkedIn Campaign">LinkedIn Campaign</option>
              <option value="Facebook Ad">Facebook Ad</option>
              <option value="Google Search">Google Search</option>
              <option value="Cold Call">Cold Call</option>
              <option value="Channel Partner">Channel Partner</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#171817] mb-1">Assign to Executive</label>
            <select
              value={assignToId}
              onChange={(e) => setAssignToId(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-white border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/30"
            >
              <option value="">Leave Unassigned (Admin Queue)</option>
              {executives.map((exec) => (
                <option key={exec.id} value={exec.id}>
                  {exec.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#171817] mb-1">Initial Client Requirement / Notes</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Property requirements, budget, timeline, land parcel sizes..."
            className="w-full px-3 py-2 text-xs rounded-lg bg-white border border-[#E5E5E0] text-[#171817] placeholder-[#AEB1AC] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/30"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-[#E5E5E0]">
          <div>
            <label className="block text-xs font-semibold text-[#B69A63] mb-1">
              Next Action <span className="text-[#171817]">*</span>
            </label>
            <input
              type="text"
              required
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              placeholder="e.g. Call to discuss TP2 zoning"
              className="w-full px-3 py-2 text-xs rounded-lg bg-[#FAF8F5] border border-[#B69A63]/40 text-[#171817] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/30"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#B69A63] mb-1">
              Next Action Due Date & Time <span className="text-[#171817]">*</span>
            </label>
            <input
              type="datetime-local"
              required
              value={nextActionAt}
              onChange={(e) => setNextActionAt(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-[#FAF8F5] border border-[#B69A63]/40 text-[#171817] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/30"
            />
          </div>
        </div>

        <div className="flex justify-end space-x-2 pt-3 border-t border-[#E5E5E0]">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={loading}>
            Create Lead
          </Button>
        </div>
      </form>
    </Modal>
  );
};
