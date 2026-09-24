'use client';

import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { emitCrmSync } from '@/lib/sync-event';

interface MeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadId?: string;
  leadNumber?: string;
  clientName?: string;
  onSuccess: () => void;
}

export const MeetingModal: React.FC<MeetingModalProps> = ({
  isOpen,
  onClose,
  leadId,
  leadNumber,
  clientName,
  onSuccess,
}) => {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('14:00');
  const [meetingType, setMeetingType] = useState('Online');
  const [location, setLocation] = useState('Google Meet');
  const [notes, setNotes] = useState('');
  const [reminder, setReminder] = useState('30 mins before');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadId) {
      setError('A lead must be associated with the meeting.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          date,
          time,
          meetingType,
          location,
          notes,
          reminder,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to schedule meeting');
      }

      emitCrmSync('meetings');
      emitCrmSync('all');
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error creating meeting');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Schedule Client Meeting"
      subtitle={clientName ? `${clientName} (${leadNumber})` : undefined}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-[#FAF0ED] border border-[#F2C5BC] text-[#9A2215] text-xs font-medium">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#171817] mb-1">
              Meeting Date <span className="text-[#B69A63]">*</span>
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-white border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/30"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#171817] mb-1">
              Time <span className="text-[#B69A63]">*</span>
            </label>
            <input
              type="time"
              required
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-white border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/30"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#171817] mb-1">Meeting Type</label>
            <select
              value={meetingType}
              onChange={(e) => {
                setMeetingType(e.target.value);
                if (e.target.value === 'Online') setLocation('Google Meet');
                else if (e.target.value === 'Office Visit') setLocation('Orvion HQ Executive Lounge');
                else if (e.target.value === 'Site Visit') setLocation('Dholera SIR TP Plot');
                else setLocation('');
              }}
              className="w-full px-3 py-2 text-xs rounded-lg bg-white border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/30"
            >
              <option value="Online">Online (Google Meet / Zoom)</option>
              <option value="Office Visit">Office Visit</option>
              <option value="Site Visit">Site Visit</option>
              <option value="Client Location">Client Location</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#171817] mb-1">Location / Link</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Google Meet or Room 3"
              className="w-full px-3 py-2 text-xs rounded-lg bg-white border border-[#E5E5E0] text-[#171817] placeholder-[#AEB1AC] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/30"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#171817] mb-1">Agenda / Meeting Notes</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Key discussion points, presentation topics, commercial negotiation goals..."
            className="w-full px-3 py-2 text-xs rounded-lg bg-white border border-[#E5E5E0] text-[#171817] placeholder-[#AEB1AC] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/30 resize-none font-sans"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[#171817] mb-1">Reminder</label>
          <select
            value={reminder}
            onChange={(e) => setReminder(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-lg bg-white border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/30"
          >
            <option value="15 mins before">15 mins before</option>
            <option value="30 mins before">30 mins before</option>
            <option value="1 hour before">1 hour before</option>
            <option value="1 day before">1 day before</option>
          </select>
        </div>

        <div className="flex justify-end space-x-2 pt-3 border-t border-[#E5E5E0]">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={loading}>
            Schedule Meeting
          </Button>
        </div>
      </form>
    </Modal>
  );
};
