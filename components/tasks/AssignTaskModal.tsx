'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  Users,
  User,
  AlertCircle,
  Clock,
  Calendar,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface AssignTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface ExecutiveUser {
  id: string;
  name: string;
  email: string;
  designation?: string | null;
}

export const AssignTaskModal: React.FC<AssignTaskModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [target, setTarget] = useState<'ALL' | 'SPECIFIC'>('ALL');
  const [executives, setExecutives] = useState<ExecutiveUser[]>([]);
  const [selectedExecutiveId, setSelectedExecutiveId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'HIGH' | 'NORMAL' | 'LOW'>('NORMAL');

  const todayStr = new Date().toISOString().split('T')[0];
  const [dueDate, setDueDate] = useState(todayStr);
  const [dueTime, setDueTime] = useState('18:00');

  const [loading, setLoading] = useState(false);
  const [fetchingUsers, setFetchingUsers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSuccessMsg(null);
      // Fetch active executives
      setFetchingUsers(true);
      fetch('/api/users?role=EXECUTIVE')
        .then((res) => res.json())
        .then((data) => {
          if (data.users && Array.isArray(data.users)) {
            setExecutives(data.users);
            if (data.users.length > 0 && !selectedExecutiveId) {
              setSelectedExecutiveId(data.users[0].id);
            }
          }
        })
        .catch((err) => console.error('Error fetching executives:', err))
        .finally(() => setFetchingUsers(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!title.trim()) {
      setError('Please enter a task title');
      return;
    }

    if (target === 'SPECIFIC' && !selectedExecutiveId) {
      setError('Please select an executive');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          target,
          assigneeId: target === 'SPECIFIC' ? selectedExecutiveId : undefined,
          dueDate,
          dueTime,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to assign task');
      }

      setSuccessMsg(
        target === 'ALL'
          ? `Daily task broadcasted to ${data.count || 'all'} active executives!`
          : `Task successfully assigned!`
      );

      setTimeout(() => {
        setTitle('');
        setDescription('');
        setPriority('NORMAL');
        setDueDate(todayStr);
        setDueTime('18:00');
        onSuccess?.();
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'An error occurred while creating task');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Surface */}
      <div className="relative w-full max-w-lg rounded-2xl bg-white border border-[#E5E5E0] p-6 shadow-2xl transition-all z-10 text-[#171817]">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-[#E5E5E0]">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#B69A63]" />
              <h3 className="text-lg font-bold text-[#171817]">Assign Executive Task</h3>
            </div>
            <p className="text-xs text-[#626560] mt-0.5">
              Broadcast a directive to all executives or assign to a specific individual.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#90928E] hover:text-[#171817] hover:bg-[#F4F4F1] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Alerts */}
        {error && (
          <div className="mt-4 p-3 rounded-xl bg-[#FFF1F0] border border-[#FECDCA] text-xs font-medium text-[#B42318] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mt-4 p-3 rounded-xl bg-[#EDF5F0] border border-[#D3E5D9] text-xs font-medium text-[#2D5A3C] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Target Selector: All vs Specific */}
          <div>
            <label className="block text-xs font-semibold text-[#171817] mb-1.5">
              Assignment Scope
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-[#F4F4F1] rounded-xl border border-[#E5E5E0]">
              <button
                type="button"
                onClick={() => setTarget('ALL')}
                className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                  target === 'ALL'
                    ? 'bg-[#111314] text-[#F4F2EC] shadow-xs'
                    : 'text-[#626560] hover:text-[#171817]'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                All Executives (Broadcast)
              </button>
              <button
                type="button"
                onClick={() => setTarget('SPECIFIC')}
                className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                  target === 'SPECIFIC'
                    ? 'bg-[#111314] text-[#F4F2EC] shadow-xs'
                    : 'text-[#626560] hover:text-[#171817]'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                Specific Executive
              </button>
            </div>
          </div>

          {/* Specific Executive Dropdown */}
          {target === 'SPECIFIC' && (
            <div>
              <label className="block text-xs font-semibold text-[#171817] mb-1.5">
                Select Executive
              </label>
              <select
                value={selectedExecutiveId}
                onChange={(e) => setSelectedExecutiveId(e.target.value)}
                disabled={fetchingUsers}
                className="w-full text-xs font-medium px-3.5 py-2.5 rounded-xl border border-[#E5E5E0] bg-white text-[#171817] focus:outline-hidden focus:ring-1 focus:ring-[#B69A63] focus:border-[#B69A63]"
              >
                {executives.map((exec) => (
                  <option key={exec.id} value={exec.id}>
                    {exec.name} ({exec.email})
                  </option>
                ))}
              </select>
              {executives.length === 0 && !fetchingUsers && (
                <p className="text-[11px] text-[#B42318] mt-1">No active executives found in system.</p>
              )}
            </div>
          )}

          {/* Task Title */}
          <div>
            <label className="block text-xs font-semibold text-[#171817] mb-1.5">
              Task Directive / Title <span className="text-[#B42318]">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Complete 50 client outreach calls today"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-xs font-medium px-3.5 py-2.5 rounded-xl border border-[#E5E5E0] bg-white text-[#171817] placeholder:text-[#90928E] focus:outline-hidden focus:ring-1 focus:ring-[#B69A63] focus:border-[#B69A63]"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-[#171817] mb-1.5">
              Instructions / Description (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="Provide context, required logs, or specific targets..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full text-xs font-medium px-3.5 py-2.5 rounded-xl border border-[#E5E5E0] bg-white text-[#171817] placeholder:text-[#90928E] focus:outline-hidden focus:ring-1 focus:ring-[#B69A63] focus:border-[#B69A63] resize-none"
            />
          </div>

          {/* Priority & Deadline Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Priority */}
            <div>
              <label className="block text-xs font-semibold text-[#171817] mb-1.5">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-[#E5E5E0] bg-white text-[#171817] focus:outline-hidden focus:ring-1 focus:ring-[#B69A63]"
              >
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High Priority 🔥</option>
                <option value="LOW">Low</option>
              </select>
            </div>

            {/* Due Date */}
            <div>
              <label className="block text-xs font-semibold text-[#171817] mb-1.5 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-[#626560]" /> Due Date
              </label>
              <input
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-[#E5E5E0] bg-white text-[#171817] focus:outline-hidden focus:ring-1 focus:ring-[#B69A63]"
              />
            </div>

            {/* Due Time */}
            <div>
              <label className="block text-xs font-semibold text-[#171817] mb-1.5 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-[#B69A63]" /> Deadline Time
              </label>
              <input
                type="time"
                required
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-[#E5E5E0] bg-white text-[#171817] focus:outline-hidden focus:ring-1 focus:ring-[#B69A63]"
              />
            </div>
          </div>

          {/* Target Note */}
          <div className="p-3 rounded-xl bg-[#F8F8F6] border border-[#E5E5E0] text-[11px] text-[#626560] flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-[#B69A63] shrink-0" />
            <span>
              {target === 'ALL'
                ? `Will broadcast to all active executives. Each executive gets their own independent completion tracker on their dashboard.`
                : `Will be assigned exclusively to the selected executive with real-time deadline monitoring.`}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[#E5E5E0]">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="text-xs px-4 py-2 border-[#E5E5E0] text-[#626560] hover:bg-[#F4F4F1]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || (target === 'SPECIFIC' && !selectedExecutiveId)}
              className="text-xs px-5 py-2 bg-[#111314] hover:bg-[#1E2021] text-[#F4F2EC] border border-[#252829] font-semibold transition cursor-pointer"
            >
              {loading ? 'Assigning...' : target === 'ALL' ? 'Broadcast to All' : 'Assign Task'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
