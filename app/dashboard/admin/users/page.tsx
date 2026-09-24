'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Users,
  Plus,
  UserCheck,
  UserX,
  RefreshCw,
  Trash2,
  AlertTriangle,
  X,
  Edit2,
  Key,
  Phone,
  Mail,
  Building,
  CheckCircle2,
  Search,
  Filter,
  DollarSign,
  Shield,
  Layers,
  Sparkles,
  Eye,
  EyeOff,
  Copy,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { emitCrmSync, useCrmSync } from '@/lib/sync-event';
import {
  mergeUsersWithResilience,
  upsertCachedUser,
  markUsersAsDeleted,
  getCachedUsers,
} from '@/lib/client-cache';

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  phone?: string | null;
  designation?: string | null;
  department?: string | null;
  dateOfJoining?: string | null;
  baseSalary?: number | null;
  emergencyContact?: string | null;
  routingAvailable?: boolean;
  teamId?: string | null;
  team?: { id: string; name: string } | null;
  createdAt: string;
  lastLoginAt?: string | null;
  _count?: {
    ownedLeads?: number;
    callLogs?: number;
    createdMeetings?: number;
  };
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const pendingUserIdsRef = useRef(new Set<string>());
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [resettingPasswordUser, setResettingPasswordUser] = useState<UserItem | null>(null);

  // Multi-select state
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [deletingUser, setDeletingUser] = useState<UserItem | null>(null);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Add User Form State
  const [addForm, setAddForm] = useState({
    name: '',
    email: '',
    password: 'Password@123',
    role: 'EXECUTIVE',
    teamId: '',
    phone: '',
    designation: '',
    department: 'Sales',
    baseSalary: '35000',
    emergencyContact: '',
  });

  // Edit User Form State
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    role: 'EXECUTIVE',
    teamId: '',
    phone: '',
    designation: '',
    department: '',
    baseSalary: '',
    emergencyContact: '',
    routingAvailable: true,
  });

  // Reset Password State
  const [newPassword, setNewPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');

  // Add/Edit Password visibility
  const [showAddPassword, setShowAddPassword] = useState(false);
  const [editPassword, setEditPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);

  // Filter state
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [teamFilter, setTeamFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const usersRequestRef = useRef(0);

  const fetchUsers = async (showLoading = true) => {
    const requestId = ++usersRequestRef.current;
    if (showLoading) setLoading(true);
    try {
      const [usersRes, teamsRes] = await Promise.all([
        fetch(`/api/users?t=${Date.now()}`, { cache: 'no-store' }),
        fetch(`/api/teams?t=${Date.now()}`, { cache: 'no-store' }),
      ]);
      if (requestId !== usersRequestRef.current) return;
      if (usersRes.ok) {
        const data = await usersRes.json();
        const serverUsers = data.users || [];
        serverUsers.forEach((user: UserItem) => pendingUserIdsRef.current.delete(user.id));
        setUsers((prev) => {
          const pendingUsers = prev.filter(
            (user) => pendingUserIdsRef.current.has(user.id) && !serverUsers.some((item: UserItem) => item.id === user.id)
          );
          return mergeUsersWithResilience([...serverUsers, ...pendingUsers], prev);
        });
      }
      if (teamsRes.ok) {
        const tData = await teamsRes.json();
        setTeams(tData.teams || []);
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers(true);
    const interval = setInterval(() => {
      fetchUsers(false);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  useCrmSync(['users', 'all'], () => {
    fetchUsers(false);
  });

  const handleToggleActive = async (user: UserItem) => {
    const updated = !user.active;
    setError(null);
    const optimistic = { ...user, active: updated };
    upsertCachedUser(optimistic);
    setUsers((prev) => prev.map((item) => (item.id === optimistic.id ? { ...item, ...optimistic } : item)));
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, active: updated }),
      });
      if (res.ok) {
        emitCrmSync('all');
        return;
      }
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to update user status');
    } catch (err) {
      upsertCachedUser(user);
      setUsers((prev) => prev.map((item) => (item.id === user.id ? user : item)));
      setError(err instanceof Error ? err.message : 'Failed to update user status');
    }
  };

  const handleToggleRouting = async (user: UserItem) => {
    const updated = !user.routingAvailable;
    setError(null);
    const optimistic = { ...user, routingAvailable: updated };
    upsertCachedUser(optimistic);
    setUsers((prev) => prev.map((item) => (item.id === optimistic.id ? { ...item, ...optimistic } : item)));
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, routingAvailable: updated }),
      });
      if (res.ok) {
        emitCrmSync('all');
        return;
      }
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to update routing availability');
    } catch (err) {
      upsertCachedUser(user);
      setUsers((prev) => prev.map((item) => (item.id === user.id ? user : item)));
      setError(err instanceof Error ? err.message : 'Failed to update routing availability');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...addForm,
          teamId: addForm.teamId || undefined,
          baseSalary: addForm.baseSalary ? parseFloat(addForm.baseSalary) : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create user');
      }

      if (data.user) {
        pendingUserIdsRef.current.add(data.user.id);
        upsertCachedUser(data.user);
        setUsers((prev) => [
          ...prev.filter((user) => user.id !== data.user.id),
          data.user,
        ]);
      }

      setAddForm({
        name: '',
        email: '',
        password: 'Password@123',
        role: 'EXECUTIVE',
        teamId: '',
        phone: '',
        designation: '',
        department: 'Sales',
        baseSalary: '35000',
        emergencyContact: '',
      });
      setIsAddOpen(false);
      emitCrmSync('users', data.user);
      fetchUsers(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error creating user');
    } finally {
      setActionLoading(false);
    }
  };

  const openEditModal = (u: UserItem) => {
    setEditingUser(u);
    setEditPassword('');
    setShowEditPassword(false);
    setEditForm({
      name: u.name,
      email: u.email,
      role: u.role,
      teamId: u.teamId || '',
      phone: u.phone || '',
      designation: u.designation || '',
      department: u.department || 'Sales',
      baseSalary: u.baseSalary ? String(u.baseSalary) : '',
      emergencyContact: u.emergencyContact || '',
      routingAvailable: u.routingAvailable ?? true,
    });
    setError(null);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setActionLoading(true);
    setError(null);
    try {
      const payload: Record<string, any> = {
        id: editingUser.id,
        ...editForm,
        teamId: editForm.teamId || null,
        baseSalary: editForm.baseSalary ? parseFloat(editForm.baseSalary) : null,
      };

      if (editPassword && editPassword.trim().length > 0) {
        payload.password = editPassword.trim();
      }

      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update user');
      }

      if (data.user) {
        upsertCachedUser(data.user);
        setUsers((prev) => prev.map((user) => (user.id === data.user.id ? { ...user, ...data.user } : user)));
      }

      setEditingUser(null);
      setEditPassword('');
      emitCrmSync('users', data.user);
      fetchUsers(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error updating user');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingPasswordUser || !newPassword.trim()) return;
    setActionLoading(true);
    setError(null);
    setPasswordSuccess('');
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: resettingPasswordUser.id,
          password: newPassword.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to reset password');
      }

      setPasswordSuccess('Password successfully reset! Employee can now log in.');
      setTimeout(() => {
        setResettingPasswordUser(null);
        setNewPassword('');
        setPasswordSuccess('');
        setShowResetPassword(false);
      }, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error resetting password');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCopyPassword = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedPassword(true);
    setTimeout(() => setCopiedPassword(false), 2000);
  };

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let pass = 'Orvion@';
    for (let i = 0; i < 6; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(pass);
  };

  const handleDeleteSingleUser = async () => {
    if (!deletingUser) return;
    const targetId = deletingUser.id;
    setActionLoading(true);
    setDeleteError(null);
    try {
      // Mark deleted in persistent client cache & optimistic delete in state
      markUsersAsDeleted([targetId]);
      setUsers((prev) => prev.filter((u) => u.id !== targetId));
      setSelectedUserIds((prev) => prev.filter((id) => id !== targetId));
      setDeletingUser(null);

      const res = await fetch('/api/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: targetId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete user');
      }

      setDeletingUser(null);
      emitCrmSync('users');
      fetchUsers(false);
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Error deleting user');
      fetchUsers(true);
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkDeleteUsers = async () => {
    if (selectedUserIds.length === 0) return;
    const targetIds = [...selectedUserIds];
    setActionLoading(true);
    setDeleteError(null);
    try {
      // Mark deleted in persistent client cache & optimistic delete in state
      markUsersAsDeleted(targetIds);
      setUsers((prev) => prev.filter((u) => !targetIds.includes(u.id)));

      const res = await fetch('/api/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: targetIds }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete selected users');
      }

      setIsBulkDeleteOpen(false);
      setSelectedUserIds([]);
      emitCrmSync('users');
      fetchUsers(false);
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Error deleting selected users');
      fetchUsers(true);
    } finally {
      setActionLoading(false);
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
      if (teamFilter !== 'ALL') {
        if (teamFilter === 'NO_TEAM' && u.teamId) return false;
        if (teamFilter !== 'NO_TEAM' && u.teamId !== teamFilter) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = u.name.toLowerCase().includes(q);
        const matchesEmail = u.email.toLowerCase().includes(q);
        const matchesPhone = u.phone?.toLowerCase().includes(q);
        const matchesDesig = u.designation?.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesPhone && !matchesDesig) return false;
      }
      return true;
    });
  }, [users, roleFilter, teamFilter, searchQuery]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedUserIds(filteredUsers.map((u) => u.id));
    } else {
      setSelectedUserIds([]);
    }
  };

  const handleToggleSelectUser = (id: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const isAllSelected =
    filteredUsers.length > 0 &&
    filteredUsers.every((u) => selectedUserIds.includes(u.id));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E5E0]">
        <div>
          <h2 className="text-xl font-bold text-[#171817] flex items-center gap-2">
            <Users className="w-5 h-5 text-[#B69A63]" /> Staff Directory &amp; User Management
          </h2>
          <p className="text-xs text-[#626560] mt-1">
            Manage roles, compensation, team structures, passwords, and lead routing controls.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button size="sm" variant="secondary" onClick={() => fetchUsers(true)} isLoading={loading}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>
          <Button size="sm" variant="primary" onClick={() => setIsAddOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add New User
          </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-[#E5E5E0] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* Search Input */}
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, email, designation, phone..."
              className="w-full pl-9 pr-3 py-1.5 bg-[#FBFBFA] border border-[#E5E5E0] rounded-xl text-xs text-[#171817] outline-none focus:border-[#B69A63]"
            />
          </div>

          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-1.5 bg-[#FBFBFA] border border-[#E5E5E0] rounded-xl text-xs text-[#171817] outline-none focus:border-[#B69A63]"
          >
            <option value="ALL">All Roles</option>
            <option value="ADMIN">Admin</option>
            <option value="TEAM_LEAD">Team Lead</option>
            <option value="EXECUTIVE">Sales Executive</option>
            <option value="HR">HR Manager</option>
          </select>

          {/* Team Filter */}
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="px-3 py-1.5 bg-[#FBFBFA] border border-[#E5E5E0] rounded-xl text-xs text-[#171817] outline-none focus:border-[#B69A63]"
          >
            <option value="ALL">All Teams</option>
            <option value="NO_TEAM">No Team Assigned</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Selected Counter & Bulk Actions */}
        {selectedUserIds.length > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 px-3 py-1 rounded-xl animate-in fade-in">
            <span className="text-xs font-bold text-amber-900">
              {selectedUserIds.length} Selected
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setIsBulkDeleteOpen(true)}
              className="text-red-600 border-red-200 hover:bg-red-50 text-[11px] py-1 px-2.5 h-auto"
            >
              <Trash2 className="w-3 h-3 mr-1" /> Delete Selected
            </Button>
          </div>
        )}
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-[#E5E5E0] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E5E5E0] bg-[#F7F7F5] text-[#626560] font-bold">
                <th className="p-3.5 pl-4 w-10">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="rounded border-zinc-300 text-[#171817] focus:ring-[#B69A63]"
                  />
                </th>
                <th className="p-3.5">Employee Name &amp; Designation</th>
                <th className="p-3.5">Role</th>
                <th className="p-3.5">Team</th>
                <th className="p-3.5">Workload / Activity</th>
                <th className="p-3.5">Lead Routing</th>
                <th className="p-3.5">Account Status</th>
                <th className="p-3.5 text-right pr-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E5E0]">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-zinc-400">
                    Loading users...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-zinc-400">
                    No users found matching filter.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isSelected = selectedUserIds.includes(u.id);
                  return (
                    <tr
                      key={u.id}
                      className={`hover:bg-zinc-50/80 transition-colors ${
                        isSelected ? 'bg-amber-50/40' : ''
                      }`}
                    >
                      <td className="p-3.5 pl-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectUser(u.id)}
                          className="rounded border-zinc-300 text-[#171817] focus:ring-[#B69A63]"
                        />
                      </td>

                      {/* Name & Contact */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-[#171817] text-[#D2BE91] font-bold text-xs flex items-center justify-center shrink-0">
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-sm text-[#171817] flex items-center gap-1.5">
                              {u.name}
                            </div>
                            <div className="text-[11px] text-zinc-500 font-mono flex items-center gap-2 mt-0.5">
                              <span>{u.email}</span>
                              {u.phone && <span>• {u.phone}</span>}
                            </div>
                            {u.designation && (
                              <span className="text-[10px] text-[#B69A63] font-semibold block mt-0.5">
                                {u.designation} {u.department ? `(${u.department})` : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td className="p-3.5">
                        <span
                          className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                            u.role === 'ADMIN'
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : u.role === 'TEAM_LEAD'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : u.role === 'HR'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-zinc-100 text-zinc-700 border-zinc-200'
                          }`}
                        >
                          {u.role.replace(/_/g, ' ')}
                        </span>
                      </td>

                      {/* Team */}
                      <td className="p-3.5">
                        {u.team ? (
                          <span className="font-semibold text-zinc-800 bg-[#F4F4F0] px-2 py-0.5 rounded-md border border-zinc-200">
                            {u.team.name}
                          </span>
                        ) : (
                          <span className="text-zinc-400 italic">No Team</span>
                        )}
                      </td>

                      {/* Workload / Stats */}
                      <td className="p-3.5">
                        <div className="space-y-0.5 text-[11px] text-zinc-600">
                          <div>
                            <strong className="text-[#171817]">{u._count?.ownedLeads || 0}</strong> Active Leads
                          </div>
                          <div className="text-zinc-400 text-[10px]">
                            {u._count?.callLogs || 0} Calls • {u._count?.createdMeetings || 0} Meetings
                          </div>
                        </div>
                      </td>

                      {/* Lead Routing Toggle */}
                      <td className="p-3.5">
                        {u.role === 'EXECUTIVE' ? (
                          <button
                            onClick={() => handleToggleRouting(u)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border flex items-center gap-1 transition-colors ${
                              u.routingAvailable
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                                : 'bg-zinc-100 text-zinc-600 border-zinc-200 hover:bg-zinc-200'
                            }`}
                            title="Toggle automatic lead allocation in round-robin"
                          >
                            {u.routingAvailable ? (
                              <>
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Active
                              </>
                            ) : (
                              <>
                                <span className="w-2 h-2 rounded-full bg-zinc-400" /> Paused
                              </>
                            )}
                          </button>
                        ) : (
                          <span className="text-zinc-400 text-[11px]">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="p-3.5">
                        <button
                          onClick={() => handleToggleActive(u)}
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                            u.active
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                          }`}
                        >
                          {u.active ? 'Active' : 'Deactivated'}
                        </button>
                      </td>

                      {/* Action Buttons */}
                      <td className="p-3.5 text-right pr-4">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEditModal(u)}
                            className="p-1.5 rounded-lg text-zinc-600 hover:text-[#171817] hover:bg-zinc-100 transition-colors"
                            title="Edit User Profile"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => {
                              setResettingPasswordUser(u);
                              setNewPassword('');
                              setError(null);
                              setPasswordSuccess('');
                            }}
                            className="p-1.5 rounded-lg text-zinc-600 hover:text-[#B69A63] hover:bg-amber-50 transition-colors"
                            title="Reset Password"
                          >
                            <Key className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => {
                              setDeleteError(null);
                              setDeletingUser(u);
                            }}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Delete User"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal 1: Add New User */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Add New Staff Member"
        subtitle="Create an employee account with role, team, and contact details."
      >
        <form onSubmit={handleCreateUser} className="space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 font-medium">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-[#171817] mb-1">Full Name *</label>
              <input
                required
                type="text"
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                placeholder="e.g. Rahul Sharma"
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#E5E5E0] text-[#171817] outline-none focus:border-[#B69A63]"
              />
            </div>

            <div>
              <label className="block font-bold text-[#171817] mb-1">Email Address *</label>
              <input
                required
                type="email"
                value={addForm.email}
                onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                placeholder="rahul@orvion.com"
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#E5E5E0] text-[#171817] outline-none focus:border-[#B69A63]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-[#171817] mb-1">Role *</label>
              <select
                value={addForm.role}
                onChange={(e) => setAddForm({ ...addForm, role: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#E5E5E0] text-[#171817] outline-none focus:border-[#B69A63]"
              >
                <option value="EXECUTIVE">Sales Executive</option>
                <option value="TEAM_LEAD">Team Lead</option>
                <option value="HR">HR Manager</option>
                <option value="ADMIN">Administrator</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-[#171817] mb-1">Assign Team</label>
              <select
                value={addForm.teamId}
                onChange={(e) => setAddForm({ ...addForm, teamId: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#E5E5E0] text-[#171817] outline-none focus:border-[#B69A63]"
              >
                <option value="">No Team (Unassigned)</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-[#171817] mb-1">Phone Number</label>
              <input
                type="text"
                value={addForm.phone}
                onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                placeholder="+91 98765 43210"
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#E5E5E0] text-[#171817] outline-none focus:border-[#B69A63]"
              />
            </div>

            <div>
              <label className="block font-bold text-[#171817] mb-1">Designation</label>
              <input
                type="text"
                value={addForm.designation}
                onChange={(e) => setAddForm({ ...addForm, designation: e.target.value })}
                placeholder="Senior Sales Closer"
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#E5E5E0] text-[#171817] outline-none focus:border-[#B69A63]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-[#171817] mb-1">Base Salary (₹/mo)</label>
              <input
                type="number"
                value={addForm.baseSalary}
                onChange={(e) => setAddForm({ ...addForm, baseSalary: e.target.value })}
                placeholder="35000"
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#E5E5E0] text-[#171817] outline-none focus:border-[#B69A63]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-bold text-[#171817]">Initial Password *</label>
                <button
                  type="button"
                  onClick={() => {
                    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
                    let pass = 'Orvion@';
                    for (let i = 0; i < 6; i++) {
                      pass += chars.charAt(Math.floor(Math.random() * chars.length));
                    }
                    setAddForm((prev) => ({ ...prev, password: pass }));
                  }}
                  className="text-[11px] font-semibold text-[#B69A63] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" /> Auto-Generate
                </button>
              </div>
              <div className="relative">
                <input
                  required
                  type={showAddPassword ? 'text' : 'password'}
                  value={addForm.password}
                  onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                  className="w-full pl-3 pr-10 py-2 rounded-xl bg-white border border-[#E5E5E0] text-[#171817] font-mono outline-none focus:border-[#B69A63]"
                />
                <button
                  type="button"
                  onClick={() => setShowAddPassword(!showAddPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                  title={showAddPassword ? 'Hide password' : 'Show password'}
                >
                  {showAddPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#E5E5E0]">
            <Button type="button" variant="secondary" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={actionLoading}>
              Create User Account
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal 2: Edit User */}
      {editingUser && (
        <Modal
          isOpen={true}
          onClose={() => setEditingUser(null)}
          title={`Edit User: ${editingUser.name}`}
          subtitle="Update profile details, role assignment, and lead routing availability."
        >
          <form onSubmit={handleUpdateUser} className="space-y-4 text-xs">
            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 font-medium">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-[#171817] mb-1">Full Name *</label>
                <input
                  required
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#E5E5E0] text-[#171817] outline-none focus:border-[#B69A63]"
                />
              </div>

              <div>
                <label className="block font-bold text-[#171817] mb-1">Email Address *</label>
                <input
                  required
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#E5E5E0] text-[#171817] outline-none focus:border-[#B69A63]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-[#171817] mb-1">Role *</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#E5E5E0] text-[#171817] outline-none focus:border-[#B69A63]"
                >
                  <option value="EXECUTIVE">Sales Executive</option>
                  <option value="TEAM_LEAD">Team Lead</option>
                  <option value="HR">HR Manager</option>
                  <option value="ADMIN">Administrator</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-[#171817] mb-1">Assign Team</label>
                <select
                  value={editForm.teamId}
                  onChange={(e) => setEditForm({ ...editForm, teamId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#E5E5E0] text-[#171817] outline-none focus:border-[#B69A63]"
                >
                  <option value="">No Team (Unassigned)</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-[#171817] mb-1">Phone Number</label>
                <input
                  type="text"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#E5E5E0] text-[#171817] outline-none focus:border-[#B69A63]"
                />
              </div>

              <div>
                <label className="block font-bold text-[#171817] mb-1">Designation</label>
                <input
                  type="text"
                  value={editForm.designation}
                  onChange={(e) => setEditForm({ ...editForm, designation: e.target.value })}
                  placeholder="e.g. Senior Closer"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#E5E5E0] text-[#171817] outline-none focus:border-[#B69A63]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-[#171817] mb-1">Base Salary (₹/mo)</label>
                <input
                  type="number"
                  value={editForm.baseSalary}
                  onChange={(e) => setEditForm({ ...editForm, baseSalary: e.target.value })}
                  placeholder="35000"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#E5E5E0] text-[#171817] outline-none focus:border-[#B69A63]"
                />
              </div>

              <div>
                <label className="block font-bold text-[#171817] mb-1">Emergency Contact</label>
                <input
                  type="text"
                  value={editForm.emergencyContact}
                  onChange={(e) => setEditForm({ ...editForm, emergencyContact: e.target.value })}
                  placeholder="Relative / Phone"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#E5E5E0] text-[#171817] outline-none focus:border-[#B69A63]"
                />
              </div>
            </div>

            <div className="pt-1">
              <div className="flex items-center justify-between mb-1">
                <label className="block font-bold text-[#171817]">
                  New Password <span className="text-zinc-400 font-normal">(Leave blank to keep unchanged)</span>
                </label>
                {editPassword && (
                  <button
                    type="button"
                    onClick={() => handleCopyPassword(editPassword)}
                    className="text-[11px] font-semibold text-[#B69A63] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    {copiedPassword ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    {copiedPassword ? 'Copied!' : 'Copy Password'}
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type={showEditPassword ? 'text' : 'password'}
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Leave blank unless resetting password..."
                  className="w-full pl-3 pr-10 py-2 rounded-xl bg-white border border-[#E5E5E0] text-[#171817] font-mono outline-none focus:border-[#B69A63]"
                />
                <button
                  type="button"
                  onClick={() => setShowEditPassword(!showEditPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                  title={showEditPassword ? 'Hide password' : 'Show password'}
                >
                  {showEditPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#E5E5E0]">
              <Button type="button" variant="secondary" onClick={() => setEditingUser(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={actionLoading}>
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal 3: Reset Password */}
      {resettingPasswordUser && (
        <Modal
          isOpen={true}
          onClose={() => {
            setResettingPasswordUser(null);
            setShowResetPassword(false);
          }}
          title={`Reset Password: ${resettingPasswordUser.name}`}
          subtitle={`Set a new login password for ${resettingPasswordUser.email}`}
        >
          <form onSubmit={handleResetPassword} className="space-y-4 text-xs">
            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 font-medium">
                {error}
              </div>
            )}
            {passwordSuccess && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {passwordSuccess}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-bold text-[#171817]">New Password *</label>
                <div className="flex items-center gap-3">
                  {newPassword && (
                    <button
                      type="button"
                      onClick={() => handleCopyPassword(newPassword)}
                      className="text-[11px] font-semibold text-zinc-600 hover:text-[#171817] flex items-center gap-1 cursor-pointer"
                    >
                      {copiedPassword ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      {copiedPassword ? 'Copied!' : 'Copy Password'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={generateRandomPassword}
                    className="text-[11px] font-semibold text-[#B69A63] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" /> Generate Secure Password
                  </button>
                </div>
              </div>
              <div className="relative">
                <input
                  required
                  type={showResetPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password..."
                  className="w-full pl-3 pr-10 py-2 rounded-xl bg-white border border-[#E5E5E0] text-[#171817] font-mono outline-none focus:border-[#B69A63]"
                />
                <button
                  type="button"
                  onClick={() => setShowResetPassword(!showResetPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                  title={showResetPassword ? 'Hide password' : 'Show password'}
                >
                  {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#E5E5E0]">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setResettingPasswordUser(null);
                  setShowResetPassword(false);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={actionLoading}>
                Update Password
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal 4: Delete Single User */}
      {deletingUser && (
        <Modal
          isOpen={true}
          onClose={() => setDeletingUser(null)}
          title={`Delete User: ${deletingUser.name}`}
          subtitle="Are you sure you want to permanently delete this user?"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-600" /> Caution
              </p>
              <p>
                Deleting this user will unassign all their owned leads to the unassigned Admin pool
                and reassign audit records to preserve historical integrity.
              </p>
            </div>

            {deleteError && (
              <div className="p-3 rounded-xl bg-red-100 text-red-900 font-medium">
                {deleteError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-[#E5E5E0]">
              <Button variant="secondary" onClick={() => setDeletingUser(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleDeleteSingleUser}
                isLoading={actionLoading}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Confirm Delete
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal 5: Bulk Delete Users */}
      {isBulkDeleteOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsBulkDeleteOpen(false)}
          title={`Bulk Delete ${selectedUserIds.length} Users`}
          subtitle="Permanently remove selected user accounts."
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800">
              <p className="font-bold">Are you sure you want to delete {selectedUserIds.length} users?</p>
              <p className="mt-1">
                Their leads will be safely returned to the Unassigned pool.
              </p>
            </div>

            {deleteError && (
              <div className="p-3 rounded-xl bg-red-100 text-red-900 font-medium">
                {deleteError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-[#E5E5E0]">
              <Button variant="secondary" onClick={() => setIsBulkDeleteOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleBulkDeleteUsers}
                isLoading={actionLoading}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Confirm Bulk Delete
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
