'use client';

import React, { useState, useEffect } from 'react';
import {
  CalendarDays,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Filter,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { emitCrmSync, useCrmSync } from '@/lib/sync-event';
import { getFastCache, setFastCache } from '@/lib/fast-data';

interface LeaveRequestItem {
  id: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string;
  status: string;
  reviewComment?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    designation?: string | null;
    department?: string | null;
    team?: { name: string } | null;
  };
  reviewedBy?: {
    id: string;
    name: string;
  } | null;
}

export default function LeaveManagementPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const cacheKey = `crm:hr:leaves:${statusFilter}`;
  const [leaves, setLeaves] = useState<LeaveRequestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    leaveType: 'CASUAL',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    daysCount: '1',
    reason: '',
  });
  const [applyError, setApplyError] = useState<string | null>(null);
  const [submittingLeave, setSubmittingLeave] = useState(false);

  const fetchLeaves = async (isBackground: boolean | unknown = false) => {
    const isBg = isBackground === true;
    const currentKey = `crm:hr:leaves:${statusFilter}`;
    const cached = getFastCache<LeaveRequestItem[]>(currentKey);
    if (!cached && !isBg) {
      setLoading(true);
    }
    try {
      const url = statusFilter ? `/api/hr/leaves?status=${statusFilter}` : '/api/hr/leaves';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const list = data.leaves || [];
        setLeaves(list);
        setFastCache(currentKey, list, 60000);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const cached = getFastCache<LeaveRequestItem[]>(cacheKey);
    if (cached) {
      setLeaves(cached);
      setLoading(false);
      fetchLeaves(true);
    } else {
      fetchLeaves(false);
    }
    const handleFocus = () => fetchLeaves(true);
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [statusFilter, cacheKey]);

  useCrmSync(['hr', 'attendance', 'all'], () => {
    fetchLeaves(true);
  });

  const handleReview = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/hr/leaves/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        emitCrmSync('hr');
        emitCrmSync('attendance');
        fetchLeaves(true);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteLeave = async (id: string) => {
    const confirmed = window.confirm('Delete this leave request? This action cannot be undone.');
    if (!confirmed) return;

    setActionLoading(id);
    try {
      const res = await fetch(`/api/hr/leaves/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        emitCrmSync('hr');
        emitCrmSync('attendance');
        fetchLeaves(true);
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to delete leave request');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingLeave(true);
    setApplyError(null);
    try {
      const res = await fetch('/api/hr/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setIsApplyModalOpen(false);
        setFormData({
          leaveType: 'CASUAL',
          startDate: new Date().toISOString().split('T')[0],
          endDate: new Date().toISOString().split('T')[0],
          daysCount: '1',
          reason: '',
        });
        emitCrmSync('all');
        fetchLeaves();
      } else {
        const err = await res.json();
        setApplyError(err.error || 'Failed to submit leave request');
      }
    } catch (err: unknown) {
      setApplyError(err instanceof Error ? err.message : 'Failed to submit leave request');
    } finally {
      setSubmittingLeave(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E5E0]">
        <div>
          <h2 className="text-xl font-bold text-[#171817] flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-[#B69A63]" /> Leave Management &amp; Approvals
          </h2>
          <p className="text-xs text-[#626560] mt-1">
            Review time-off applications. Approved leaves automatically safeguard sales pipelines by pausing lead assignment.
          </p>
        </div>

        <Button onClick={() => setIsApplyModalOpen(true)} className="flex items-center gap-1.5" variant="primary">
          <Plus className="w-4 h-4" /> Submit Leave Request
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between border-b border-[#E5E5E0] pb-2">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setStatusFilter('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              statusFilter === ''
                ? 'bg-[#111314] text-[#F4F2EC] shadow-xs'
                : 'text-[#626560] hover:text-[#171817] hover:bg-[#F4F4F1]'
            }`}
          >
            All Requests ({leaves.length})
          </button>
          <button
            onClick={() => setStatusFilter('PENDING')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              statusFilter === 'PENDING'
                ? 'bg-[#FAF8F5] text-[#B69A63] border border-[#B69A63]/30 shadow-xs'
                : 'text-[#626560] hover:text-[#B69A63] hover:bg-[#FAF8F5]'
            }`}
          >
            Pending Review
          </button>
          <button
            onClick={() => setStatusFilter('APPROVED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              statusFilter === 'APPROVED'
                ? 'bg-[#F0F7F2] text-[#2D5A3C] border border-[#2D5A3C]/20 shadow-xs'
                : 'text-[#626560] hover:text-[#2D5A3C] hover:bg-[#F0F7F2]'
            }`}
          >
            Approved
          </button>
          <button
            onClick={() => setStatusFilter('REJECTED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              statusFilter === 'REJECTED'
                ? 'bg-[#FDF2F2] text-[#8C3333] border border-[#8C3333]/20 shadow-xs'
                : 'text-[#626560] hover:text-[#8C3333] hover:bg-[#FDF2F2]'
            }`}
          >
            Rejected
          </button>
        </div>

        <Button size="sm" variant="secondary" onClick={fetchLeaves} isLoading={loading}>
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Leaves List */}
      <div className="space-y-3">
        {loading ? (
          <div className="py-12 text-center text-xs text-[#8C908A]">Loading leave requests...</div>
        ) : leaves.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#8C908A]">No leave requests found in this view.</div>
        ) : (
          leaves.map((leave) => (
            <div
              key={leave.id}
              className={`rounded-2xl border p-4 bg-white shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 transition ${
                leave.status === 'PENDING'
                  ? 'border-[#B69A63]/30 hover:border-[#B69A63]'
                  : leave.status === 'APPROVED'
                  ? 'border-[#E5E5E0]'
                  : 'border-[#8C3333]/20 bg-[#FDF2F2]/20'
              }`}
            >
              {/* Left Column: Applicant & Details */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-[#171817]">{leave.user.name}</span>
                  <span className="text-xs text-[#8C908A]">({leave.user.designation || leave.user.role})</span>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                      leave.status === 'PENDING'
                        ? 'bg-[#FAF8F5] text-[#B69A63] border-[#B69A63]/20'
                        : leave.status === 'APPROVED'
                        ? 'bg-[#F0F7F2] text-[#2D5A3C] border-[#2D5A3C]/20'
                        : 'bg-[#FDF2F2] text-[#8C3333] border-[#8C3333]/20'
                    }`}
                  >
                    {leave.status}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-[#626560]">
                  <span className="font-semibold text-[#171817]">{leave.leaveType} Leave</span>
                  <span>•</span>
                  <span className="tabular-nums">
                    {leave.startDate} to {leave.endDate} ({leave.daysCount} {leave.daysCount === 1 ? 'day' : 'days'})
                  </span>
                  {leave.user.department && (
                    <>
                      <span>•</span>
                      <span>{leave.user.department}</span>
                    </>
                  )}
                </div>

                <div className="text-xs text-[#626560] bg-[#F8F8F6] border border-[#E5E5E0] rounded-lg p-2.5 mt-2">
                  <span className="font-semibold text-[#171817]">Reason: </span>
                  {leave.reason}
                </div>

                {leave.reviewComment && (
                  <div className="text-[11px] text-[#8C908A] italic mt-1">
                    HR Note: &ldquo;{leave.reviewComment}&rdquo; by {leave.reviewedBy?.name || 'HR'}
                  </div>
                )}
              </div>

              {/* Right Column: HR Action Buttons */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {leave.status === 'PENDING' && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => handleReview(leave.id, 'APPROVED')}
                      isLoading={actionLoading === leave.id}
                      variant="primary"
                      className="flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleReview(leave.id, 'REJECTED')}
                      isLoading={actionLoading === leave.id}
                      className="hover:bg-[#FDF2F2] hover:text-[#8C3333] hover:border-[#8C3333]/30 flex items-center gap-1"
                    >
                      <XCircle className="w-3.5 h-3.5 text-[#8C3333]" /> Decline
                    </Button>
                  </>
                )}

                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleDeleteLeave(leave.id)}
                  isLoading={actionLoading === leave.id}
                  className="hover:bg-[#FDF2F2] hover:text-[#8C3333] hover:border-[#8C3333]/30 flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Apply Leave Modal */}
      {isApplyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-[#E5E5E0]">
            <h3 className="text-base font-bold text-[#171817] mb-1">Submit Leave Application</h3>
            <p className="text-xs text-[#626560] mb-4">
              Enter dates and reason for time off.
            </p>

            <form onSubmit={handleApplyLeave} className="space-y-3.5">
              {applyError && (
                <div className="p-3 rounded-lg bg-[#FAF0ED] border border-[#F2C5BC] text-[#9A2215] text-xs font-medium">
                  {applyError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#171817] mb-1">Leave Category*</label>
                <select
                  value={formData.leaveType}
                  onChange={(e) => setFormData({ ...formData, leaveType: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                >
                  <option value="CASUAL">Casual Leave (CL)</option>
                  <option value="SICK">Sick Leave (SL)</option>
                  <option value="HALF_DAY">Half Day</option>
                  <option value="UNPAID">Leave Without Pay (LWP)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#171817] mb-1">Start Date*</label>
                  <input
                    type="date"
                    required
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#171817] mb-1">End Date*</label>
                  <input
                    type="date"
                    required
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#171817] mb-1">Number of Days*</label>
                <input
                  type="number"
                  step="0.5"
                  required
                  value={formData.daysCount}
                  onChange={(e) => setFormData({ ...formData, daysCount: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#171817] mb-1">Reason for Leave*</label>
                <textarea
                  required
                  rows={3}
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder="State the reason for time-off..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63] resize-none"
                />
              </div>

              <div className="pt-3 border-t border-[#F4F4F1] flex items-center justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setIsApplyModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary">Submit Request</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
