'use client';

import React, { useState } from 'react';
import {
  User,
  Shield,
  Key,
  Mail,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Lock,
  Calendar,
  Plus,
  TrendingUp,
  Clock,
  PhoneCall,
  Flame,
  Eye,
  EyeOff,
  Smartphone,
  Download,
  X,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { AttendanceWidget } from '@/components/attendance/AttendanceWidget';
import { emitCrmSync } from '@/lib/sync-event';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  phone?: string | null;
  designation?: string | null;
  department?: string | null;
  dateOfJoining?: string | null;
  emergencyContact?: string | null;
  routingAvailable: boolean;
  teamId?: string | null;
  team?: { id: string; name: string } | null;
  leaveRequests?: Array<{
    id: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    daysCount: number;
    reason: string;
    status: string;
    reviewComment?: string | null;
    createdAt: string | Date;
  }>;
  teamStats?: {
    membersCount: number;
    activeLeadsCount: number;
    upcomingMeetingsCount: number;
  } | null;
  createdAt: string | Date;
  lastLoginAt?: string | Date | null;
  _count?: {
    ownedLeads: number;
    createdMeetings: number;
  };
}

interface ProfileClientProps {
  initialProfile: UserProfile | null;
}

export default function ProfileClient({ initialProfile }: ProfileClientProps) {
  const [profile, setProfile] = useState<UserProfile | null>(initialProfile);
  const [loading, setLoading] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [canInstallPwa, setCanInstallPwa] = useState(false);
  const [showIosInstallGuide, setShowIosInstallGuide] = useState(false);
  const [isIosDevice, setIsIosDevice] = useState(false);

  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  }

  // Profile Edit Form
  const [name, setName] = useState(initialProfile?.name || '');
  const [phone, setPhone] = useState(initialProfile?.phone || '');
  const [emergencyContact, setEmergencyContact] = useState(initialProfile?.emergencyContact || '');
  const [routingAvailable, setRoutingAvailable] = useState(initialProfile?.routingAvailable ?? true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');

  // Password Edit Form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Quick Leave Modal Form
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [leaveType, setLeaveType] = useState('CASUAL');
  const [leaveStartDate, setLeaveStartDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [leaveEndDate, setLeaveEndDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [leaveDays, setLeaveDays] = useState('1');
  const [leaveReason, setLeaveReason] = useState('');
  const [submittingLeave, setSubmittingLeave] = useState(false);
  const [leaveSuccess, setLeaveSuccess] = useState('');
  const [leaveError, setLeaveError] = useState('');

  const leaveStatusClass = (status: string) => {
    if (status === 'APPROVED') return 'text-[#2D5A3C] bg-[#EEF7F0] border-[#B8D9BE]';
    if (status === 'REJECTED') return 'text-[#9A2215] bg-[#FAF0ED] border-[#F2C5BC]';
    if (status === 'CANCELLED') return 'text-[#626560] bg-[#F4F4F1] border-[#E5E5E0]';
    return 'text-[#7A5B28] bg-[#FAF8F5] border-[#DCC99D]';
  };

  React.useEffect(() => {
    if (!initialProfile) {
      fetchProfile();
    }
  }, [initialProfile]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const userAgent = window.navigator.userAgent.toLowerCase();
    setIsIosDevice(/iphone|ipad|ipod/.test(userAgent));

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setCanInstallPwa(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallPwa = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setCanInstallPwa(false);
      }
      setDeferredPrompt(null);
      return;
    }

    if (isIosDevice) {
      setShowIosInstallGuide(true);
      return;
    }

    setShowIosInstallGuide(false);
  };

  const fetchProfile = async () => {
    setLoading(true);
    setProfileError('');
    try {
      const res = await fetch('/api/profile');
      if (res.ok) {
        const data = await res.json();
        const u: UserProfile = data.user;
        setProfile(u);
        setName(u.name || '');
        setPhone(u.phone || '');
        setEmergencyContact(u.emergencyContact || '');
        setRoutingAvailable(u.routingAvailable ?? true);
      } else {
        const data = await res.json();
        setProfileError(data.error || 'Failed to refresh profile.');
      }
    } catch {
      setProfileError('Network error while refreshing profile.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileSuccess('');
    setProfileError('');

    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone,
          emergencyContact,
          routingAvailable,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update profile.');
      }

      setProfileSuccess('Profile details saved successfully.');
      if (data.user) {
        setProfile(data.user);
      }
      emitCrmSync('all');
    } catch (err: unknown) {
      setProfileError(err instanceof Error ? err.message : 'Error updating profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordSuccess('');
    setPasswordError('');

    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.');
      return;
    }

    setSavingPassword(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update password.');
      }

      setPasswordSuccess('Password successfully changed.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      setPasswordError(err instanceof Error ? err.message : 'Error updating password.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingLeave(true);
    setLeaveError('');
    setLeaveSuccess('');
    try {
      const res = await fetch('/api/hr/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leaveType,
          startDate: leaveStartDate,
          endDate: leaveEndDate,
          daysCount: parseFloat(leaveDays) || 1,
          reason: leaveReason.trim(),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to submit leave request');
      }

      setLeaveSuccess('Leave request submitted to admin for approval!');
      setTimeout(() => {
        setIsLeaveModalOpen(false);
        setLeaveReason('');
        setLeaveSuccess('');
      }, 1500);
      emitCrmSync('all');
    } catch (err: unknown) {
      setLeaveError(err instanceof Error ? err.message : 'Error applying for leave');
    } finally {
      setSubmittingLeave(false);
    }
  };

  if (!profile) {
    return (
      <div className="p-8 text-center rounded-2xl bg-white border border-[#E5E5E0] shadow-xs space-y-3">
        <p className="text-sm text-[#626560]">Unable to load profile data.</p>
        <Button variant="secondary" size="sm" onClick={fetchProfile}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Banner Card */}
      <div className="rounded-2xl bg-white border border-[#E5E5E0] p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16 rounded-2xl bg-[#111314] text-[#C6AD7A] font-serif font-black text-2xl flex items-center justify-center shadow-xs border border-[#26282B] shrink-0">
            {profile.name ? profile.name.charAt(0).toUpperCase() : 'U'}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-[#171817] tracking-tight">{profile.name}</h1>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-[#111314] text-[#F4F2EC] border border-[#26282B]">
                {profile.role.replace('_', ' ')}
              </span>
              {profile.team && (
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-md bg-[#F4F4F1] text-[#171817] border border-[#E5E5E0]">
                  {profile.team.name}
                </span>
              )}
            </div>
            <p className="text-xs text-[#626560] mt-1.5 flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 text-[#8C908A]" /> {profile.email}
              {profile.designation && <span>• {profile.designation}</span>}
            </p>
          </div>
        </div>

        {/* Quick Actions & KPIs */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end md:gap-6 border-t md:border-t-0 md:border-l border-[#E5E5E0] pt-4 md:pt-0 md:pl-6 text-xs">
          <div className="flex flex-wrap items-center gap-4 md:gap-6">
            {profile.role === 'TEAM_LEAD' ? (
              <>
                <div>
                  <span className="text-[#8C908A] text-[11px] block font-medium">Supervised Execs</span>
                  <span className="text-lg font-extrabold text-[#171817] tabular-nums">
                    {profile.teamStats?.membersCount ?? 0}
                  </span>
                </div>
                <div>
                  <span className="text-[#8C908A] text-[11px] block font-medium">Team Pipeline</span>
                  <span className="text-lg font-extrabold text-[#171817] tabular-nums">
                    {profile.teamStats?.activeLeadsCount ?? 0}
                  </span>
                </div>
                <div>
                  <span className="text-[#8C908A] text-[11px] block font-medium">Upcoming Meetings</span>
                  <span className="text-lg font-extrabold text-[#171817] tabular-nums">
                    {profile.teamStats?.upcomingMeetingsCount ?? 0}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div>
                  <span className="text-[#8C908A] text-[11px] block font-medium">Pipeline Leads</span>
                  <span className="text-lg font-extrabold text-[#171817] tabular-nums">
                    {profile._count?.ownedLeads || 0}
                  </span>
                </div>
                <div>
                  <span className="text-[#8C908A] text-[11px] block font-medium">Meetings</span>
                  <span className="text-lg font-extrabold text-[#171817] tabular-nums">
                    {profile._count?.createdMeetings || 0}
                  </span>
                </div>
                <div>
                  <span className="text-[#8C908A] text-[11px] block font-medium">Routing State</span>
                  <span
                    className={`text-xs font-bold inline-flex items-center gap-1 ${
                      routingAvailable ? 'text-[#2D5A3C]' : 'text-[#8C908A]'
                    }`}
                  >
                    {routingAvailable ? '● Active' : '○ Paused'}
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 md:ml-2">
            {(canInstallPwa || isIosDevice) && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={handleInstallPwa}
                className="text-xs"
              >
                <Download className="w-3.5 h-3.5 mr-1 text-[#B69A63]" /> Install App
              </Button>
            )}

            {/* Quick Leave Application Button */}
            {profile.role !== 'ADMIN' && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setIsLeaveModalOpen(true)}
                className="text-xs"
              >
                <Calendar className="w-3.5 h-3.5 mr-1 text-[#B69A63]" /> Apply Leave
              </Button>
            )}
          </div>
        </div>
      </div>

      {showIosInstallGuide && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-[#111314] border border-[#B69A63]/40 p-6 text-[#F4F2EC] shadow-2xl animate-page-enter">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#D2BE91]" />
                <h3 className="text-sm font-bold">Install on iPhone / iPad</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowIosInstallGuide(false)}
                className="text-[#727570] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <ol className="space-y-3 text-xs text-[#AEB1AC]">
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#1E2021] border border-[#B69A63]/30 text-[#D2BE91] flex items-center justify-center font-bold text-[10px] shrink-0">
                  1
                </span>
                <span>
                  Tap the <strong className="text-white">Share</strong> button at the bottom of Safari (box with arrow).
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#1E2021] border border-[#B69A63]/30 text-[#D2BE91] flex items-center justify-center font-bold text-[10px] shrink-0">
                  2
                </span>
                <span>
                  Scroll down and select <strong className="text-white">Add to Home Screen</strong>.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#1E2021] border border-[#B69A63]/30 text-[#D2BE91] flex items-center justify-center font-bold text-[10px] shrink-0">
                  3
                </span>
                <span>
                  Tap <strong className="text-white">Add</strong> in the top right to launch ORVION in full-screen standalone mode.
                </span>
              </li>
            </ol>

            <button
              type="button"
              onClick={() => setShowIosInstallGuide(false)}
              className="w-full mt-5 py-2.5 rounded-xl bg-[#1E2021] hover:bg-[#2A2D2E] border border-[#26282B] text-xs font-semibold text-[#F4F2EC] transition"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Dedicated attendance controls */}
      {profile.role !== 'ADMIN' && (
        <section className="rounded-2xl border border-[#E5E5E0] bg-white p-5 shadow-xs">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold text-[#171817]">
                <Clock className="h-4 w-4 text-[#B69A63]" /> Attendance &amp; Shift Controls
              </h2>
              <p className="mt-1 text-xs text-[#626560]">
                Mark in, mark out, and request calling access corrections from this profile section.
              </p>
            </div>
            <span className="hidden rounded-full border border-[#E8DCBE] bg-[#FAF5EB] px-2.5 py-1 text-[10px] font-bold text-[#7A5B28] sm:inline-flex">
              Daily controls
            </span>
          </div>
          <AttendanceWidget />
        </section>
      )}

      {/* Dedicated Team Lead Action Banner */}
      {profile.role === 'TEAM_LEAD' && (
        <div className="rounded-2xl bg-[#111314] text-[#F4F2EC] p-5 shadow-sm border border-[#252829] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#D2BE91]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#D2BE91]">
                Team Lead Supervision Active ({profile.team?.name || 'Assigned Team'})
              </h3>
            </div>
            <p className="text-xs text-[#AEB1AC]">
              You are leading {profile.teamStats?.membersCount ?? 0} active executives supervising{' '}
              {profile.teamStats?.activeLeadsCount ?? 0} active pipeline leads.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <a
              href="/dashboard/team-lead/workflow"
              className="px-3.5 py-2 rounded-xl bg-[#1E2021] hover:bg-[#2A2D2E] text-xs font-semibold text-[#F4F2EC] border border-[#363A3C] transition cursor-pointer"
            >
              Inspect Workflows →
            </a>
            <a
              href="/dashboard/team-lead/dashboard"
              className="px-3.5 py-2 rounded-xl bg-[#C6AD7A] hover:bg-[#D2BE91] text-xs font-bold text-[#111314] transition cursor-pointer shadow-xs"
            >
              Team Dashboard
            </a>
          </div>
        </div>
      )}

      {/* Grid Layout: Left Details, Right Security */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Personal Info (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Personal Info Form */}
          <div className="rounded-2xl bg-white border border-[#E5E5E0] p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#F4F4F1]">
              <h2 className="text-sm font-bold text-[#171817] flex items-center gap-2">
                <User className="w-4 h-4 text-[#B69A63]" /> Personal &amp; Contact Details
              </h2>
              <span className="text-[11px] text-[#8C908A]">Editable by user</span>
            </div>

            {profileSuccess && (
              <div className="p-3 rounded-xl bg-[#F0F7F2] border border-[#2D5A3C]/20 text-xs text-[#2D5A3C] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#2D5A3C] shrink-0" />
                {profileSuccess}
              </div>
            )}

            {profileError && (
              <div className="p-3 rounded-xl bg-[#FDF2F2] border border-[#8C3333]/20 text-xs text-[#8C3333] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[#8C3333] shrink-0" />
                {profileError}
              </div>
            )}

            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#171817] mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/20"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#171817] mb-1">Direct Phone</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98000 00000"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#171817] mb-1">
                    Emergency Contact
                  </label>
                  <input
                    type="tel"
                    value={emergencyContact}
                    onChange={(e) => setEmergencyContact(e.target.value)}
                    placeholder="Name &amp; Contact"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/20"
                  />
                </div>
              </div>

              {/* Readonly company properties */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-[#8C908A] mb-1">Official Email</label>
                  <input
                    type="email"
                    disabled
                    value={profile.email}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-[#F8F8F6] border border-[#E5E5E0] text-[#626560] cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#8C908A] mb-1">
                    Assigned Department
                  </label>
                  <input
                    type="text"
                    disabled
                    value={profile.department || 'Operations'}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-[#F8F8F6] border border-[#E5E5E0] text-[#626560] cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Lead Routing Availability Switch */}
              <div className="pt-3 border-t border-[#F4F4F1]">
                <label className="flex items-start gap-3 p-3.5 rounded-xl border border-[#E5E5E0] bg-[#F8F8F6]/50 hover:bg-[#F8F8F6] transition cursor-pointer">
                  <input
                    type="checkbox"
                    checked={routingAvailable}
                    onChange={(e) => setRoutingAvailable(e.target.checked)}
                    className="mt-0.5 rounded text-[#111314] focus:ring-[#B69A63] accent-[#111314]"
                  />
                  <div>
                    <div className="text-xs font-bold text-[#171817]">Available for Round-Robin Lead Routing</div>
                    <p className="text-[11px] text-[#626560] mt-0.5">
                      When enabled, newly ingested or reassigned leads can be allocated directly to your queue. Uncheck when on leave or out of station.
                    </p>
                  </div>
                </label>
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit" variant="primary" isLoading={savingProfile}>
                  Save Profile Changes
                </Button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Column: Security & Password (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Password Change Card */}
          <div className="rounded-2xl bg-white border border-[#E5E5E0] p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#F4F4F1]">
              <h2 className="text-sm font-bold text-[#171817] flex items-center gap-2">
                <Key className="w-4 h-4 text-[#B69A63]" /> Security &amp; Password
              </h2>
              <Lock className="w-3.5 h-3.5 text-[#8C908A]" />
            </div>

            {passwordSuccess && (
              <div className="p-3 rounded-xl bg-[#F0F7F2] border border-[#2D5A3C]/20 text-xs text-[#2D5A3C] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#2D5A3C] shrink-0" />
                {passwordSuccess}
              </div>
            )}

            {passwordError && (
              <div className="p-3 rounded-xl bg-[#FDF2F2] border border-[#8C3333]/20 text-xs text-[#8C3333] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[#8C3333] shrink-0" />
                {passwordError}
              </div>
            )}

            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#171817] mb-1">
                  Current Password <span className="text-[#8C3333]">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPw ? 'text' : 'password'}
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter existing password"
                    className="w-full pl-3 pr-10 py-2 text-xs rounded-xl bg-white border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPw(!showCurrentPw)}
                    className="absolute right-2.5 top-2 p-0.5 rounded text-[#8C9089] hover:text-[#171817] transition-colors focus:outline-none cursor-pointer"
                    title={showCurrentPw ? 'Hide password' : 'Show password'}
                  >
                    {showCurrentPw ? <EyeOff className="w-3.5 h-3.5 text-[#7A5B28]" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#171817] mb-1">
                  New Password <span className="text-[#8C3333]">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full pl-3 pr-10 py-2 text-xs rounded-xl bg-white border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw(!showNewPw)}
                    className="absolute right-2.5 top-2 p-0.5 rounded text-[#8C9089] hover:text-[#171817] transition-colors focus:outline-none cursor-pointer"
                    title={showNewPw ? 'Hide password' : 'Show password'}
                  >
                    {showNewPw ? <EyeOff className="w-3.5 h-3.5 text-[#7A5B28]" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#171817] mb-1">
                  Confirm New Password <span className="text-[#8C3333]">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPw ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-type new password"
                    className="w-full pl-3 pr-10 py-2 text-xs rounded-xl bg-white border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPw(!showConfirmPw)}
                    className="absolute right-2.5 top-2 p-0.5 rounded text-[#8C9089] hover:text-[#171817] transition-colors focus:outline-none cursor-pointer"
                    title={showConfirmPw ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPw ? <EyeOff className="w-3.5 h-3.5 text-[#7A5B28]" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <Button type="submit" variant="secondary" className="w-full" isLoading={savingPassword}>
                  Update Password
                </Button>
              </div>
            </form>
          </div>

          {/* Account Details Card */}
          <div className="rounded-2xl bg-[#F8F8F6] border border-[#E5E5E0] p-5 space-y-3 text-xs">
            <h3 className="font-bold text-[#171817] flex items-center gap-1.5 uppercase tracking-wide text-[11px]">
              <Shield className="w-3.5 h-3.5 text-[#B69A63]" /> Account Governance
            </h3>
            <div className="space-y-2 text-[#626560]">
              <div className="flex justify-between py-1 border-b border-[#E5E5E0]">
                <span>Account Role</span>
                <span className="font-bold text-[#171817]">{profile.role}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E5E5E0]">
                <span>Team Supervision</span>
                <span className="font-bold text-[#171817]">{profile.team?.name || 'Company Wide'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E5E5E0]">
                <span>Member Since</span>
                <span className="font-bold text-[#171817]">
                  {new Intl.DateTimeFormat('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    timeZone: 'UTC',
                  }).format(new Date(profile.createdAt))}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span>Last Session Recorded</span>
                <span className="font-bold text-[#171817]">
                  {profile.lastLoginAt
                    ? new Intl.DateTimeFormat('en-US', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                        timeZone: 'UTC',
                      }).format(new Date(profile.lastLoginAt))
                    : 'Active Now'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="w-full min-w-0 lg:col-span-12 rounded-[28px] bg-[#f2f0ee] border border-[#dfe0dc] p-5 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.015)] overflow-hidden">
          <div className="flex items-start justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-8 h-8 rounded-lg bg-[#111314] text-[#d2be91] flex items-center justify-center border border-[#26282b] shrink-0">
                <Calendar className="w-4 h-4" />
              </div>
              <h3 className="font-black text-[#171817] uppercase tracking-[-0.04em] text-[20px] sm:text-[22px] leading-[0.95] break-words">
                My Leave<br />Requests
              </h3>
            </div>
            <div className="pt-1 text-right shrink-0">
              <div className="text-[11px] text-[#626560] font-medium">Requests</div>
              <div className="text-[28px] leading-none font-bold text-[#171817] tabular-nums">
                {profile.leaveRequests?.length || 0}
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-4 text-[#171817]">
            <p className="max-w-full sm:max-w-[18rem] text-[17px] leading-[1.2] text-[#171817] font-medium break-words">
              Track your submitted leave applications and HR decisions.
            </p>

            {profile.leaveRequests?.length ? (
              <div className="space-y-2 pt-1">
                {profile.leaveRequests.map((leave) => (
                  <div key={leave.id} className="rounded-xl border border-[#E5E5E0] bg-[#FCFCFA] p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-[#171817]">{leave.leaveType} Leave · {leave.daysCount} day{leave.daysCount === 1 ? '' : 's'}</p>
                      <p className="text-[11px] text-[#626560] mt-0.5">{leave.startDate} to {leave.endDate}</p>
                      {leave.reviewComment && <p className="text-[11px] text-[#626560] mt-1">HR: {leave.reviewComment}</p>}
                    </div>
                    <span className={`self-start sm:self-center px-2 py-1 rounded-md border text-[10px] font-bold ${leaveStatusClass(leave.status)}`}>
                      {leave.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[19px] leading-[1.25] text-[#171817] font-medium pt-1">No leave requests submitted yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Quick Apply Leave Modal */}
      {isLeaveModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsLeaveModalOpen(false)}
          title="Apply for Leave"
          subtitle="Submit a leave application directly to HR."
        >
          <form onSubmit={handleApplyLeave} className="space-y-3.5 text-xs">
            {leaveError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 font-medium">
                {leaveError}
              </div>
            )}
            {leaveSuccess && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {leaveSuccess}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-[#171817] mb-1">Leave Type *</label>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                >
                  <option value="CASUAL">Casual Leave (CL)</option>
                  <option value="SICK">Sick / Medical Leave (SL)</option>
                  <option value="HALF_DAY">Half Day</option>
                  <option value="UNPAID">Leave Without Pay (LWP)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#171817] mb-1">Number of Days *</label>
                <input
                  type="number"
                  step="0.5"
                  required
                  value={leaveDays}
                  onChange={(e) => setLeaveDays(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-[#171817] mb-1">Start Date *</label>
                <input
                  type="date"
                  required
                  value={leaveStartDate}
                  onChange={(e) => setLeaveStartDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#171817] mb-1">End Date *</label>
                <input
                  type="date"
                  required
                  value={leaveEndDate}
                  onChange={(e) => setLeaveEndDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-[#171817] mb-1">Reason for Leave *</label>
              <textarea
                required
                rows={3}
                value={leaveReason}
                onChange={(e) => setLeaveReason(e.target.value)}
                placeholder="Medical appointment, family function, travel..."
                className="w-full px-3 py-2 rounded-xl border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
              />
            </div>

            <div className="pt-3 border-t border-[#F4F4F1] flex items-center justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setIsLeaveModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={submittingLeave}>
                Submit Leave Application
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
