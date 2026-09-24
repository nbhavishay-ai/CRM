'use client';

import React, { useState, useEffect } from 'react';
import {
  Building2,
  Users,
  Plus,
  RefreshCw,
  Crown,
  UserCheck,
  UserX,
  ArrowRightLeft,
  Mail,
  CheckCircle2,
  Trash2,
  Star,
  ShieldAlert,
  Key,
  Eye,
  EyeOff,
  Sparkles,
  Copy,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { emitCrmSync, useCrmSync } from '@/lib/sync-event';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  _count: {
    ownedLeads: number;
  };
}

interface TeamItem {
  id: string;
  name: string;
  description?: string | null;
  members: TeamMember[];
}

interface AvailableUser {
  id: string;
  name: string;
  email: string;
  role: string;
  teamId?: string | null;
  team?: { id: string; name: string } | null;
}

export default function AdminTeamsPage() {
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Create Team Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Manage Modals State
  const [activeTeam, setActiveTeam] = useState<TeamItem | null>(null);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isChangeLeadOpen, setIsChangeLeadOpen] = useState(false);
  const [selectedUserToAdd, setSelectedUserToAdd] = useState('');
  const [selectedNewLead, setSelectedNewLead] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [addMemberError, setAddMemberError] = useState<string | null>(null);
  const [changeLeadError, setChangeLeadError] = useState<string | null>(null);

  // Delete Team State
  const [deletingTeam, setDeletingTeam] = useState<TeamItem | null>(null);
  const [deleteTeamLoading, setDeleteTeamLoading] = useState(false);
  const [deleteTeamError, setDeleteTeamError] = useState<string | null>(null);

  // Remove Member State
  const [memberToRemove, setMemberToRemove] = useState<{ teamId: string; userId: string; name: string } | null>(null);
  const [removeMemberLoading, setRemoveMemberLoading] = useState(false);
  const [removeMemberError, setRemoveMemberError] = useState<string | null>(null);

  // Reset Password State
  const [resettingPasswordUser, setResettingPasswordUser] = useState<{ id: string; name: string; email: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingPasswordUser || !newPassword.trim()) return;
    setPasswordLoading(true);
    setPasswordError(null);
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
      setPasswordError(err instanceof Error ? err.message : 'Error resetting password');
    } finally {
      setPasswordLoading(false);
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

  const fetchTeams = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/teams');
      if (res.ok) {
        const data = await res.json();
        setTeams(data.teams || []);
        setAvailableUsers(data.availableUsers || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeams();
  }, []);

  useCrmSync(['users', 'all'], () => {
    fetchTeams();
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;
    setSubmitting(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: teamName.trim(),
          description: description.trim() || undefined,
          teamLeadId: selectedLeadId || undefined,
          memberIds: selectedMemberIds,
        }),
      });

      if (res.ok) {
        setIsCreateOpen(false);
        setTeamName('');
        setDescription('');
        setSelectedLeadId('');
        setSelectedMemberIds([]);
        emitCrmSync('all');
        fetchTeams();
      } else {
        const err = await res.json();
        setCreateError(err.error || 'Failed to create team');
      }
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create team');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTeam || !selectedUserToAdd) return;
    setActionLoading(true);
    setAddMemberError(null);
    try {
      const res = await fetch(`/api/teams/${activeTeam.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUserToAdd }),
      });
      if (res.ok) {
        setIsAddMemberOpen(false);
        setSelectedUserToAdd('');
        emitCrmSync('all');
        fetchTeams();
      } else {
        const err = await res.json();
        setAddMemberError(err.error || 'Failed to add member to team');
      }
    } catch (err: unknown) {
      setAddMemberError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveMember = async (teamId: string, userId: string, memberName: string) => {
    if (!confirm(`Are you sure you want to remove ${memberName} from this team?`)) return;
    try {
      const res = await fetch(`/api/teams/${teamId}/members`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        emitCrmSync('all');
        fetchTeams();
      } else {
        const err = await res.json();
        console.error('Failed to remove member:', err.error);
      }
    } catch (err) {
      console.error('Failed to remove member:', err);
    }
  };

  const handleConfirmRemoveMember = async () => {
    if (!memberToRemove) return;
    setRemoveMemberLoading(true);
    setRemoveMemberError(null);
    try {
      const res = await fetch(`/api/teams/${memberToRemove.teamId}/members`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: memberToRemove.userId }),
      });
      if (res.ok) {
        emitCrmSync('all');
        setMemberToRemove(null);
        fetchTeams();
      } else {
        const err = await res.json();
        setRemoveMemberError(err.error || 'Failed to remove member');
      }
    } catch (err: unknown) {
      setRemoveMemberError(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setRemoveMemberLoading(false);
    }
  };

  const handleChangeLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTeam || !selectedNewLead) return;
    setActionLoading(true);
    setChangeLeadError(null);
    try {
      const res = await fetch(`/api/teams/${activeTeam.id}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamLeadId: selectedNewLead,
          demotePreviousLead: true,
        }),
      });
      if (res.ok) {
        setIsChangeLeadOpen(false);
        setSelectedNewLead('');
        emitCrmSync('all');
        fetchTeams();
      } else {
        const err = await res.json();
        setChangeLeadError(err.error || 'Failed to change team lead');
      }
    } catch (err: unknown) {
      setChangeLeadError(err instanceof Error ? err.message : 'Failed to change team lead');
    } finally {
      setActionLoading(false);
    }
  };

  const toggleMemberSelection = (userId: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleDeleteTeam = async () => {
    if (!deletingTeam) return;
    setDeleteTeamLoading(true);
    setDeleteTeamError(null);
    try {
      const res = await fetch(`/api/teams/${deletingTeam.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to delete team');
      }
      emitCrmSync('all');
      setDeletingTeam(null);
      fetchTeams();
    } catch (err: unknown) {
      setDeleteTeamError(err instanceof Error ? err.message : 'Error deleting team');
    } finally {
      setDeleteTeamLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[#E5E5E0]">
        <div>
          <h2 className="text-xl font-bold text-[#171817] flex items-center gap-2">
            <Users className="w-5 h-5 text-[#B69A63]" /> Sales Teams & Territory Structure
          </h2>
          <p className="text-xs text-[#626560] mt-1">
            Organize sales teams, assign Team Leads, and allocate executives to dedicated pipeline queues.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Button size="sm" variant="secondary" onClick={fetchTeams} isLoading={loading}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>
          <Button size="sm" variant="primary" onClick={() => setIsCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Create Team
          </Button>
        </div>
      </div>

      {/* Policy Callout */}
      <div className="flex items-center gap-3 p-3.5 rounded-xl border border-[#B69A63]/30 bg-[#FAF8F5] text-xs text-[#171817]">
        <ShieldAlert className="w-5 h-5 text-[#B69A63] shrink-0" />
        <div>
          <span className="font-semibold">Team Lead Allocation Rule:</span> Each Team Lead can only be assigned to lead exactly <span className="font-semibold underline">one team</span> at a time. Active Team Leads cannot be assigned or transferred to lead other teams without first stepping down or being reassigned.
        </div>
      </div>

      {/* Teams Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {teams.map((team) => {
          const teamLead = team.members.find((m) => m.role === 'TEAM_LEAD');
          const executives = team.members.filter((m) => m.role !== 'TEAM_LEAD');

          return (
            <div
              key={team.id}
              className="rounded-2xl bg-white border border-[#E5E5E0] p-6 shadow-xs space-y-5 flex flex-col justify-between hover:border-[#B69A63]/50 transition"
            >
              <div className="space-y-4">
                {/* Team Top Info */}
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-bold text-[#171817] flex items-center gap-2">
                      {team.name}
                    </h3>
                    {team.description && (
                      <p className="text-xs text-[#626560] mt-1">{team.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[#F8F8F6] text-[#626560] border border-[#E5E5E0] flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-[#B69A63]" /> {team.members.length} members
                    </span>
                    <button
                      type="button"
                      onClick={() => setDeletingTeam(team)}
                      className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 transition cursor-pointer"
                      title={`Delete Team ${team.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>


                {/* Team Lead Card */}
                <div className="rounded-xl border border-[#B69A63]/25 bg-[#FAF8F5] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold text-[#B69A63] uppercase tracking-wider flex items-center gap-1.5">
                      <Crown className="w-4 h-4 text-[#B69A63]" /> Team Lead
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTeam(team);
                        setSelectedNewLead(teamLead?.id || '');
                        setIsChangeLeadOpen(true);
                      }}
                      className="text-[11px] font-medium text-[#B69A63] hover:text-[#C6AD7A] hover:underline cursor-pointer"
                    >
                      {teamLead ? 'Change Team Lead' : 'Assign Team Lead'}
                    </button>
                  </div>

                  {teamLead ? (
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-[#171817]">{teamLead.name}</div>
                        <div className="text-xs text-[#626560] font-mono mt-0.5">{teamLead.email}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-[#B69A63] bg-white px-2.5 py-1 rounded-lg border border-[#E5E5E0] shadow-2xs">
                          {teamLead._count.ownedLeads} active leads
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setResettingPasswordUser(teamLead);
                            setNewPassword('');
                            setPasswordSuccess('');
                            setPasswordError(null);
                            setShowResetPassword(false);
                          }}
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-[#B69A63] hover:bg-amber-50 border border-[#E5E5E0] bg-white transition cursor-pointer"
                          title={`Reset Password for ${teamLead.name}`}
                        >
                          <Key className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="py-2 text-center text-xs text-[#8C9089]">
                      No Team Lead assigned yet. Click above to designate a lead.
                    </div>
                  )}
                </div>

                {/* Executives List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[11px] font-semibold text-[#8C9089] uppercase tracking-wider">
                      Executives ({executives.length})
                    </h4>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTeam(team);
                        setSelectedUserToAdd('');
                        setIsAddMemberOpen(true);
                      }}
                      className="text-xs font-semibold text-[#B69A63] hover:text-[#C6AD7A] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Executive
                    </button>
                  </div>

                  {executives.length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-[#E5E5E0] text-center text-xs text-[#AEB1AC]">
                      No executives in this team. Click &ldquo;Add Executive&rdquo; to assign members.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {executives.map((member) => (
                        <div
                          key={member.id}
                          className="p-3 rounded-xl bg-[#F8F8F6] border border-[#E5E5E0] flex items-center justify-between text-xs hover:bg-[#FAF9F5] transition"
                        >
                          <div>
                            <div className="font-semibold text-[#171817]">{member.name}</div>
                            <div className="text-[11px] text-[#8C9089] font-mono">{member.email}</div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-[#626560] bg-white px-2 py-0.5 rounded border border-[#E5E5E0]">
                              {member._count.ownedLeads} leads
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setResettingPasswordUser(member);
                                setNewPassword('');
                                setPasswordSuccess('');
                                setPasswordError(null);
                                setShowResetPassword(false);
                              }}
                              className="p-1 rounded text-[#8C9089] hover:text-[#B69A63] hover:bg-[#FAF8F5] transition cursor-pointer"
                              title={`Reset Password for ${member.name}`}
                            >
                              <Key className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Remove from team"
                              onClick={() => setMemberToRemove({ teamId: team.id, userId: member.id, name: member.name })}
                              className="p-1 rounded text-[#8C9089] hover:text-[#9A2215] hover:bg-[#FAF0ED] transition cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* CREATE NEW TEAM MODAL */}
      <Modal isOpen={isCreateOpen} onClose={() => { setIsCreateOpen(false); setCreateError(null); }} title="Create New Sales Team">
        <form onSubmit={handleCreate} className="space-y-4">
          {createError && (
            <div className="p-3 rounded-lg bg-[#FAF0ED] border border-[#F2C5BC] text-[#9A2215] text-xs font-medium">
              {createError}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#171817] mb-1">
              Team Name <span className="text-[#B69A63]">*</span>
            </label>
            <input
              type="text"
              required
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="e.g. Gamma Industrial Corridors"
              className="w-full px-3 py-2 text-xs rounded-lg bg-white border border-[#E5E5E0] text-[#171817] placeholder-[#AEB1AC] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/30"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#171817] mb-1">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Focus area, zoning assignments, or target client personas..."
              className="w-full px-3 py-2 text-xs rounded-lg bg-white border border-[#E5E5E0] text-[#171817] placeholder-[#AEB1AC] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/30 resize-none"
            />
          </div>

          {/* Select Team Lead */}
          <div>
            <label className="block text-xs font-medium text-[#171817] mb-1">
              Designate Team Lead (Optional)
            </label>
            <select
              value={selectedLeadId}
              onChange={(e) => setSelectedLeadId(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-white border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/30"
            >
              <option value="">-- Select Team Lead --</option>
              {availableUsers.map((u) => {
                const isLeadElsewhere = u.role === 'TEAM_LEAD' && Boolean(u.teamId);
                return (
                  <option key={u.id} value={u.id} disabled={isLeadElsewhere}>
                    {u.name} {isLeadElsewhere ? `(⛔ Active Lead of ${u.team?.name || 'team'} - Ineligible)` : u.team ? `(Executive in ${u.team.name})` : '[Unassigned]'}
                  </option>
                );
              })}
            </select>
            <p className="text-[11px] text-[#8C9089] mt-1">
              Selecting an executive here will promote them to Team Lead. Each Team Lead can only lead 1 team.
            </p>
          </div>

          {/* Assign Executives */}
          <div>
            <label className="block text-xs font-medium text-[#171817] mb-1">
              Assign Initial Executives
            </label>
            <div className="max-h-40 overflow-y-auto border border-[#E5E5E0] rounded-lg p-2 space-y-1 bg-[#F8F8F6]">
              {availableUsers
                .filter((u) => u.id !== selectedLeadId)
                .map((u) => {
                  const isLeadElsewhere = u.role === 'TEAM_LEAD' && Boolean(u.teamId);
                  return (
                    <label
                      key={u.id}
                      className={`flex items-center gap-2 p-1.5 rounded text-xs ${
                        isLeadElsewhere
                          ? 'opacity-40 cursor-not-allowed bg-[#E5E5E0]/40'
                          : 'hover:bg-white text-[#171817] cursor-pointer'
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={isLeadElsewhere}
                        checked={selectedMemberIds.includes(u.id)}
                        onChange={() => !isLeadElsewhere && toggleMemberSelection(u.id)}
                        className="rounded border-[#E5E5E0] text-[#B69A63] focus:ring-[#B69A63]"
                      />
                      <span className="font-semibold text-[#171817]">{u.name}</span>
                      <span className="text-[11px] text-[#626560]">
                        ({u.email}) {isLeadElsewhere ? `• ⛔ Active Lead of ${u.team?.name || 'team'} (Ineligible)` : u.team ? `• ${u.team.name}` : '• Unassigned'}
                      </span>
                    </label>
                  );
                })}
            </div>
            <p className="text-[11px] text-[#8C9089] mt-1">
              Selected executives will be assigned to this team immediately upon creation.
            </p>
          </div>

          <div className="flex justify-end space-x-2 pt-3 border-t border-[#E5E5E0]">
            <Button type="button" variant="secondary" onClick={() => { setIsCreateOpen(false); setCreateError(null); }}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={submitting}>
              Create Team & Assign Members
            </Button>
          </div>
        </form>
      </Modal>

      {/* ADD EXECUTIVE TO TEAM MODAL */}
      <Modal
        isOpen={isAddMemberOpen}
        onClose={() => { setIsAddMemberOpen(false); setAddMemberError(null); }}
        title={`Add Executive to ${activeTeam?.name || 'Team'}`}
      >
        <form onSubmit={handleAddMember} className="space-y-4">
          {addMemberError && (
            <div className="p-3 rounded-lg bg-[#FAF0ED] border border-[#F2C5BC] text-[#9A2215] text-xs font-medium">
              {addMemberError}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#171817] mb-1">
              Select Executive to Assign
            </label>
            <select
              required
              value={selectedUserToAdd}
              onChange={(e) => setSelectedUserToAdd(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-white border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/30"
            >
              <option value="">-- Choose Executive --</option>
              {availableUsers
                .filter((u) => u.teamId !== activeTeam?.id)
                .map((u) => {
                  const isLeadElsewhere = u.role === 'TEAM_LEAD' && Boolean(u.teamId);
                  return (
                    <option key={u.id} value={u.id} disabled={isLeadElsewhere}>
                      {u.name} ({u.email}) {isLeadElsewhere ? `[⛔ Active Lead of ${u.team?.name || 'team'} - Ineligible]` : u.team ? `[Transfer from ${u.team.name}]` : '[Unassigned]'}
                    </option>
                  );
                })}
            </select>
            <p className="text-[11px] text-[#8C9089] mt-1">
              The selected executive will be added to this team&apos;s lead distribution and dashboard.
            </p>
          </div>

          <div className="flex justify-end space-x-2 pt-3 border-t border-[#E5E5E0]">
            <Button type="button" variant="secondary" onClick={() => { setIsAddMemberOpen(false); setAddMemberError(null); }}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={actionLoading}>
              Add to Team
            </Button>
          </div>
        </form>
      </Modal>

      {/* ASSIGN / CHANGE TEAM LEAD MODAL */}
      <Modal
        isOpen={isChangeLeadOpen}
        onClose={() => { setIsChangeLeadOpen(false); setChangeLeadError(null); }}
        title={`Designate Team Lead for ${activeTeam?.name || 'Team'}`}
      >
        <form onSubmit={handleChangeLead} className="space-y-4">
          {changeLeadError && (
            <div className="p-3 rounded-lg bg-[#FAF0ED] border border-[#F2C5BC] text-[#9A2215] text-xs font-medium">
              {changeLeadError}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#171817] mb-1">
              Select New Team Lead
            </label>
            <select
              required
              value={selectedNewLead}
              onChange={(e) => setSelectedNewLead(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-white border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/30"
            >
              <option value="">-- Choose Team Lead --</option>
              {availableUsers.map((u) => {
                const isLeadOfOtherTeam = u.role === 'TEAM_LEAD' && Boolean(u.teamId) && u.teamId !== activeTeam?.id;
                const isCurrentLead = u.role === 'TEAM_LEAD' && u.teamId === activeTeam?.id;
                return (
                  <option key={u.id} value={u.id} disabled={isLeadOfOtherTeam}>
                    {u.name} {isCurrentLead ? '(Current Team Lead)' : isLeadOfOtherTeam ? `(⛔ Active Lead of ${u.team?.name || 'team'} - Ineligible)` : u.team ? `[Member of ${u.team.name}]` : '[Unassigned]'}
                  </option>
                );
              })}
            </select>
            <p className="text-[11px] text-[#8C9089] mt-1">
              Promotes this user to Team Lead and assigns them to {activeTeam?.name}. Each Team Lead can only lead 1 team.
            </p>
          </div>

          <div className="flex justify-end space-x-2 pt-3 border-t border-[#E5E5E0]">
            <Button type="button" variant="secondary" onClick={() => { setIsChangeLeadOpen(false); setChangeLeadError(null); }}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={actionLoading}>
              Confirm Team Lead
            </Button>
          </div>
        </form>
      </Modal>

      {/* DELETE TEAM MODAL */}
      <Modal
        isOpen={Boolean(deletingTeam)}
        onClose={() => {
          setDeletingTeam(null);
          setDeleteTeamError(null);
        }}
        title={`Confirm Team Deletion (${deletingTeam?.name})`}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-900">
            <Trash2 className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-bold text-sm">Permanently delete team &ldquo;{deletingTeam?.name}&rdquo;?</p>
              <p className="text-red-700">
                All {deletingTeam?.members.length || 0} members will be unlinked and restored to
                unassigned status. No employee records or leads will be deleted.
              </p>
            </div>
          </div>

          {deleteTeamError && (
            <div className="p-3 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs">
              {deleteTeamError}
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-3 border-t border-[#E5E5E0]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setDeletingTeam(null);
                setDeleteTeamError(null);
              }}
              disabled={deleteTeamLoading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleDeleteTeam}
              isLoading={deleteTeamLoading}
            >
              <Trash2 className="w-4 h-4 mr-1.5" /> Delete Team
            </Button>
          </div>
        </div>
      </Modal>

      {/* REMOVE MEMBER CONFIRMATION MODAL */}
      <Modal
        isOpen={Boolean(memberToRemove)}
        onClose={() => {
          setMemberToRemove(null);
          setRemoveMemberError(null);
        }}
        title={`Remove Member from Team`}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-900">
            <Trash2 className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-bold text-sm">
                Remove <strong className="text-red-950">{memberToRemove?.name}</strong> from this team?
              </p>
              <p className="text-red-700">
                The executive will become unassigned from this team. Their user account and assigned leads remain intact.
              </p>
            </div>
          </div>

          {removeMemberError && (
            <div className="p-3 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs">
              {removeMemberError}
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-3 border-t border-[#E5E5E0]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setMemberToRemove(null);
                setRemoveMemberError(null);
              }}
              disabled={removeMemberLoading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleConfirmRemoveMember}
              isLoading={removeMemberLoading}
            >
              <Trash2 className="w-4 h-4 mr-1.5" /> Remove from Team
            </Button>
          </div>
        </div>
      </Modal>

      {/* RESET PASSWORD MODAL */}
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
            {passwordError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 font-medium">
                {passwordError}
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
              <Button type="submit" variant="primary" isLoading={passwordLoading}>
                Update Password
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

