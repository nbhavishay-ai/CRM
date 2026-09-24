'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Phone,
  Mail,
  Building,
  MapPin,
  Clock,
  Calendar,
  RefreshCw,
  Edit3,
  Shield,
  Layers,
  UserCheck,
  AlertTriangle,
  MessageSquare,
  MessageCircle,
  FileText,
  Trash2,
} from 'lucide-react';
import { Badge, getStatusBadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { LeadTimeline, TimelineEvent } from '@/components/timeline/LeadTimeline';
import { LeadUpdateModal } from '@/components/leads/LeadUpdateModal';
import { ReassignModal } from '@/components/leads/ReassignModal';
import { MeetingModal } from '@/components/meetings/MeetingModal';
import { WhatsAppModal } from '@/components/leads/WhatsAppModal';
import { UserSession } from '@/types';
import { formatWhatsAppUrl, formatTelUrl } from '@/lib/contact';
import { emitCrmSync } from '@/lib/sync-event';

interface LeadDetailClientProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lead: any;
  session: UserSession;
  canReassign: boolean;
}

export const LeadDetailClient: React.FC<LeadDetailClientProps> = ({
  lead,
  session,
  canReassign,
}) => {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'timeline' | 'assignments' | 'followups' | 'meetings'>('timeline');
  const [isUpdateOpen, setIsUpdateOpen] = useState(false);
  const [isReassignOpen, setIsReassignOpen] = useState(false);
  const [isMeetingOpen, setIsMeetingOpen] = useState(false);
  const [isWhatsAppOpen, setIsWhatsAppOpen] = useState(false);
  const [isContactEditOpen, setIsContactEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [clientName, setClientName] = useState(lead.clientName);
  const [contactName, setContactName] = useState(lead.clientName);
  const [contactPhone, setContactPhone] = useState(lead.phone);
  const [contactSaving, setContactSaving] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  const handleSaveContact = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!contactName.trim() || !contactPhone.trim()) {
      setContactError('Client name and phone number are required.');
      return;
    }

    setContactSaving(true);
    setContactError(null);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: contactName.trim(),
          ...(session.role === 'ADMIN' ? { phone: contactPhone.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update client details');
      }
      setClientName(contactName.trim());
      setIsContactEditOpen(false);
      emitCrmSync('leads');
      emitCrmSync('all');
      router.refresh();
    } catch (err: unknown) {
      setContactError(err instanceof Error ? err.message : 'Error updating client details');
    } finally {
      setContactSaving(false);
    }
  };

  const isOverdue =
    lead.nextActionAt &&
    new Date(lead.nextActionAt) < new Date() &&
    lead.currentCategory === 'ACTIVE';

  const canViewLeadHistory = session.role === 'ADMIN';

  // Build unified chronological timeline events
  const timelineEvents: TimelineEvent[] = [];

  // Lead creation event
  timelineEvents.push({
    id: `created-${lead.id}`,
    type: 'CREATED',
    title: 'Lead Created',
    description: `Lead registered in ORVION from source: ${lead.source}. Initial notes: ${lead.notes || 'None'}`,
    actorName: 'System / Intake',
    timestamp: lead.createdAt,
  });

  // Assignments
  lead.assignments?.forEach((a: { id: string; type: string; previousOwner?: { name: string }; newOwner?: { name: string }; performedBy: { name: string; role: string }; reason?: string; timestamp: string | Date }) => {
    timelineEvents.push({
      id: `assign-${a.id}`,
      type: a.type === 'INITIAL' ? 'ASSIGNED' : 'REASSIGNED',
      title: a.type === 'INITIAL' ? 'Initial Assignment' : 'Lead Reassigned',
      description: `Ownership transferred from ${a.previousOwner?.name || 'Unassigned'} to ${a.newOwner?.name || 'Unassigned'}. Reason: ${a.reason || 'Operational'}`,
      actorName: a.performedBy.name,
      actorRole: a.performedBy.role,
      timestamp: a.timestamp,
    });
  });

  // Remarks / Updates
  lead.updates?.forEach((u: { id: string; remark: string; nextAction?: string; nextActionAt?: string | Date; user: { name: string; role: string }; createdAt: string | Date }) => {
    timelineEvents.push({
      id: `update-${u.id}`,
      type: 'UPDATE',
      title: 'Executive Remark Logged',
      description: u.remark,
      actorName: u.user.name,
      actorRole: u.user.role,
      timestamp: u.createdAt,
    });
  });

  // Status changes
  lead.statusHistory?.forEach((s: { id: string; fromStatus: string; toStatus: string; reason?: string; user: { name: string }; createdAt: string | Date }) => {
    timelineEvents.push({
      id: `status-${s.id}`,
      type: 'STATUS_CHANGE',
      title: `Status: ${s.fromStatus} → ${s.toStatus}`,
      description: s.reason || `Status updated to ${s.toStatus}`,
      actorName: s.user.name,
      timestamp: s.createdAt,
    });
  });

  // Meetings
  lead.meetings?.forEach((m: { id: string; status: string; meetingType: string; date: string; time: string; location?: string; outcome?: string; createdBy: { name: string }; scheduledAt: string | Date }) => {
    timelineEvents.push({
      id: `meeting-${m.id}`,
      type: m.status === 'COMPLETED' ? 'MEETING_COMPLETED' : 'MEETING_SCHEDULED',
      title: `Meeting: ${m.meetingType} (${m.status})`,
      description: `${m.date} at ${m.time} • Location: ${m.location || 'Online'}. ${m.outcome ? `Outcome: ${m.outcome}` : ''}`,
      actorName: m.createdBy.name,
      timestamp: m.scheduledAt,
    });
  });

  const handleRefresh = () => {
    router.refresh();
  };

  return (
    <div className="space-y-6">
      {/* Top Navigation & Back */}
      <div className="flex items-center justify-between pb-4 border-b border-[#E5E5E0]">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-xs font-semibold text-[#626560] hover:text-[#171817] transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Workspace
        </button>

        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
          {/* Direct Call Button */}
          <a
            href={formatTelUrl(lead.phone)}
            className="px-3 py-1.5 rounded-lg bg-[#EDF5F0] hover:bg-[#E3EFE7] text-[#2D5A3C] border border-[#D3E5D9] text-xs font-bold inline-flex items-center gap-1.5 transition shadow-xs cursor-pointer"
            title={`Direct Phone Call: ${lead.phone}`}
          >
            <Phone className="w-3.5 h-3.5 text-[#2D5A3C]" /> Call
          </a>

          {/* Direct WhatsApp Button */}
          <a
            href={formatWhatsAppUrl(lead.phone, lead.clientName)}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg bg-[#EBF7F0] hover:bg-[#DFEFE6] text-[#1E7E34] border border-[#CDE9D7] text-xs font-bold inline-flex items-center gap-1.5 transition shadow-xs cursor-pointer"
            title={`Connect directly on WhatsApp: ${lead.phone}`}
          >
            <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" /> WhatsApp
          </a>

          {/* Pre-written Templates Modal */}
          <button
            type="button"
            onClick={() => setIsWhatsAppOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-[#F8F8F6] hover:bg-[#F0EFEB] text-[#171817] border border-[#E5E5E0] text-xs font-semibold inline-flex items-center gap-1.5 transition shadow-xs cursor-pointer"
            title="Choose Pre-written Templates (Brochures, Payment Plans, SMS)"
          >
            <FileText className="w-3.5 h-3.5 text-[#B69A63]" /> Templates &amp; SMS
          </button>
          <Button size="sm" variant="bronze" onClick={() => setIsUpdateOpen(true)}>
            <Edit3 className="w-3.5 h-3.5 mr-1" /> Log Update
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setIsMeetingOpen(true)}>
            <Calendar className="w-3.5 h-3.5 mr-1" /> Schedule Meeting
          </Button>
          {canReassign && (
            <Button size="sm" variant="outline" onClick={() => setIsReassignOpen(true)}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Reassign
            </Button>
          )}
          {['ADMIN', 'TEAM_LEAD', 'EXECUTIVE'].includes(session.role) && (
            <Button size="sm" variant="danger" onClick={() => setIsDeleteOpen(true)}>
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
            </Button>
          )}
        </div>
      </div>


      {/* STRATEGIC DARK LEAD HEADER SECTION */}
      <div className="rounded-2xl bg-[#111314] border border-[#1E2021] p-6 shadow-md text-[#F4F2EC]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center space-x-3 flex-wrap gap-y-1">
              <span className="font-mono text-xs font-bold text-[#D2BE91] bg-[#17191A] px-2.5 py-1 rounded-md border border-[#252829]">
                {lead.leadNumber}
              </span>
              <Badge variant={getStatusBadgeVariant(lead.currentStatus)} size="md">
                {lead.currentStatus.replace('_', ' ')}
              </Badge>
              <span className="text-xs font-medium text-[#AEB1AC] bg-[#17191A] px-2.5 py-1 rounded-md border border-[#252829]">
                Category: {lead.currentCategory}
              </span>
              {lead.isNewToMe && (
                <span className="inline-flex items-center gap-1 text-xs font-bold uppercase px-2.5 py-1 rounded-full bg-[#B69A63]/15 text-[#D2BE91] border border-[#B69A63]/30">
                  <UserCheck className="w-3.5 h-3.5" /> New To Me
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-[#F4F2EC]">{clientName}</h1>
              {['ADMIN', 'TEAM_LEAD', 'EXECUTIVE'].includes(session.role) && (
                <button
                  type="button"
                  onClick={() => {
                    setContactName(clientName);
                    setContactPhone(lead.phone);
                    setContactError(null);
                    setIsContactEditOpen(true);
                  }}
                  title="Edit Client Name and Phone"
                  className="p-1 rounded-md text-[#AEB1AC] hover:text-[#D2BE91] hover:bg-[#1E2021] transition cursor-pointer"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              )}
            </div>
            {lead.company && <p className="text-xs text-[#AEB1AC] font-medium">{lead.company}</p>}
          </div>

          {/* Current Assignee Card */}
          <div className="p-3.5 rounded-xl bg-[#17191A] border border-[#252829] flex items-center space-x-3 text-xs">
            <div className="w-10 h-10 rounded-full bg-[#1E2021] border border-[#B69A63]/40 text-[#D2BE91] font-bold flex items-center justify-center text-sm shadow-inner">
              {lead.currentOwner ? lead.currentOwner.name.charAt(0) : '?'}
            </div>
            <div>
              <p className="text-[10px] text-[#AEB1AC] uppercase font-bold tracking-wider">
                Current Lead Owner
              </p>
              <p className="font-bold text-[#F4F2EC]">
                {lead.currentOwner ? lead.currentOwner.name : 'Unassigned'}
              </p>
              <p className="text-[11px] text-[#AEB1AC]">
                {lead.currentOwner?.team?.name || 'Company Wide'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 2-COLUMN LAYOUT: Left info panels, Right tabs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN: Current State & Information */}
        <div className="space-y-6">
          {/* CURRENT WORKFLOW & NEXT ACTION */}
          <div className={`rounded-2xl border p-5 space-y-3 shadow-xs ${
            isOverdue ? 'bg-[#FFF9F9] border-rose-200' : 'bg-white border-[#E5E5E0]'
          }`}>
            <h3 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
              isOverdue ? 'text-[#8C332E]' : 'text-[#171817]'
            }`}>
              {isOverdue ? (
                <AlertTriangle className="w-4 h-4 text-[#8C332E]" />
              ) : (
                <Clock className="w-4 h-4 text-[#B69A63]" />
              )}
              Current Next Action {isOverdue && '(OVERDUE)'}
            </h3>

            <div className={`p-3.5 rounded-xl border space-y-2 ${
              isOverdue ? 'bg-white border-rose-200 shadow-xs' : 'bg-[#F8F8F6] border-[#E5E5E0]'
            }`}>
              <p className="text-xs font-semibold text-[#171817]">
                {lead.nextAction || 'No next action scheduled'}
              </p>
              {lead.nextActionAt ? (
                <div
                  className={`flex items-center gap-1.5 text-xs font-semibold ${
                    isOverdue
                      ? 'text-[#8C332E] font-bold bg-[#FDF2F0] px-2.5 py-1 rounded-full border border-rose-200 shadow-2xs'
                      : 'text-[#626560]'
                  }`}
                >
                  {isOverdue && <AlertTriangle className="w-3.5 h-3.5 text-[#8C332E]" />}
                  <span>
                    Due: {new Date(lead.nextActionAt).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              ) : (
                <p className="text-[11px] text-[#90928E] italic">
                  Active leads must have an assigned next action.
                </p>
              )}
            </div>

            <Button
              size="sm"
              variant={isOverdue ? 'primary' : 'outline'}
              className="w-full"
              onClick={() => setIsUpdateOpen(true)}
            >
              Update Next Action
            </Button>
          </div>

          {/* CURRENT CLIENT INFORMATION */}
          <div className="rounded-2xl bg-white border border-[#E5E5E0] p-5 space-y-3 shadow-xs">
            <h3 className="text-xs font-bold text-[#171817] uppercase tracking-wider flex items-center justify-between gap-1.5">
              <span className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-[#B69A63]" /> Client Profile
              </span>
              {session.role === 'ADMIN' && (
                <button
                  type="button"
                  onClick={() => {
                    setContactName(clientName);
                    setContactPhone(lead.phone);
                    setContactError(null);
                    setIsContactEditOpen(true);
                  }}
                  className="text-[10px] normal-case font-semibold text-[#7A5B28] hover:text-[#B69A63] inline-flex items-center gap-1 cursor-pointer"
                >
                  <Edit3 className="w-3 h-3" /> Edit
                </button>
              )}
            </h3>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#626560]">Primary Phone:</span>
                <a
                  href={`tel:${lead.phone}`}
                  className="font-semibold text-[#171817] hover:text-[#B69A63] flex items-center gap-1"
                >
                  <Phone className="w-3 h-3 text-[#626560]" /> {lead.phone}
                </a>
              </div>

              <div className="flex items-center gap-2 pt-1 pb-1">
                <a
                  href={formatTelUrl(lead.phone)}
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#EDF5F0] hover:bg-[#E3EFE7] text-[#2D5A3C] border border-[#D3E5D9] text-xs font-bold inline-flex items-center justify-center gap-1.5 transition shadow-2xs"
                  title={`Direct Call: ${lead.phone}`}
                >
                  <Phone className="w-3.5 h-3.5 text-[#2D5A3C]" /> Direct Call
                </a>
                <a
                  href={formatWhatsAppUrl(lead.phone, lead.clientName)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#EBF7F0] hover:bg-[#DFEFE6] text-[#1E7E34] border border-[#CDE9D7] text-xs font-bold inline-flex items-center justify-center gap-1.5 transition shadow-2xs"
                  title={`Direct WhatsApp Chat: ${lead.phone}`}
                >
                  <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" /> WhatsApp
                </a>
                <button
                  type="button"
                  onClick={() => setIsWhatsAppOpen(true)}
                  className="p-1.5 rounded-lg bg-[#F8F8F6] hover:bg-[#F0EFEB] text-[#626560] border border-[#E5E5E0] transition cursor-pointer shadow-2xs"
                  title="Message Templates & SMS"
                >
                  <FileText className="w-3.5 h-3.5 text-[#B69A63]" />
                </button>
              </div>

              {lead.alternatePhone && (
                <div className="flex items-center justify-between">
                  <span className="text-[#626560]">Alternate Phone:</span>
                  <a
                    href={`tel:${lead.alternatePhone}`}
                    className="text-[#171817] hover:text-[#B69A63]"
                  >
                    {lead.alternatePhone}
                  </a>
                </div>
              )}

              {lead.email && (
                <div className="flex items-center justify-between">
                  <span className="text-[#626560]">Email:</span>
                  <a
                    href={`mailto:${lead.email}`}
                    className="text-[#171817] hover:text-[#B69A63] flex items-center gap-1 truncate max-w-[170px]"
                  >
                    <Mail className="w-3 h-3 text-[#626560]" /> {lead.email}
                  </a>
                </div>
              )}

              {lead.company && (
                <div className="flex items-center justify-between">
                  <span className="text-[#626560]">Company:</span>
                  <span className="text-[#171817] font-medium flex items-center gap-1">
                    <Building className="w-3 h-3 text-[#90928E]" /> {lead.company}
                  </span>
                </div>
              )}

              {lead.location && (
                <div className="flex items-center justify-between">
                  <span className="text-[#626560]">Location:</span>
                  <span className="text-[#171817] flex items-center gap-1 font-medium">
                    <MapPin className="w-3 h-3 text-[#90928E]" /> {lead.location}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-[#626560]">Source:</span>
                <span className="text-[#171817] font-medium">{lead.source}</span>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[#E5E5E0]">
                <span className="text-[#626560]">Created:</span>
                <span className="text-[#90928E] font-mono text-[11px]">
                  {new Date(lead.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          {/* INITIAL CLIENT NOTES */}
          {lead.notes && (
            <div className="rounded-2xl bg-white border border-[#E5E5E0] p-5 space-y-2 shadow-xs">
              <h4 className="text-xs font-bold text-[#171817] uppercase tracking-wider">
                Registration Notes
              </h4>
              <p className="text-xs text-[#171817] leading-relaxed bg-[#F8F8F6] p-3 rounded-xl border border-[#E5E5E0]">
                {lead.notes}
              </p>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: THE STORY TABS */}
        <div className="lg:col-span-2 space-y-5">
          {canViewLeadHistory ? (
            <>
              {/* Story Navigation Tabs */}
              <div className="flex items-center space-x-2 border-b border-[#E5E5E0] pb-2">
                <button
                  onClick={() => setActiveTab('timeline')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    activeTab === 'timeline'
                      ? 'bg-[#111314] text-[#F4F2EC] border border-[#1E2021] shadow-xs'
                      : 'text-[#626560] hover:text-[#171817] hover:bg-white/80 border border-transparent'
                  }`}
                >
                  Complete Story Timeline ({timelineEvents.length})
                </button>

                <button
                  onClick={() => setActiveTab('assignments')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    activeTab === 'assignments'
                      ? 'bg-[#111314] text-[#F4F2EC] border border-[#1E2021] shadow-xs'
                      : 'text-[#626560] hover:text-[#171817] hover:bg-white/80 border border-transparent'
                  }`}
                >
                  Assignment Chain ({lead.assignments?.length || 0})
                </button>

                <button
                  onClick={() => setActiveTab('followups')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    activeTab === 'followups'
                      ? 'bg-[#111314] text-[#F4F2EC] border border-[#1E2021] shadow-xs'
                      : 'text-[#626560] hover:text-[#171817] hover:bg-white/80 border border-transparent'
                  }`}
                >
                  Follow-ups ({lead.followups?.length || 0})
                </button>

                <button
                  onClick={() => setActiveTab('meetings')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    activeTab === 'meetings'
                      ? 'bg-[#111314] text-[#F4F2EC] border border-[#1E2021] shadow-xs'
                      : 'text-[#626560] hover:text-[#171817] hover:bg-white/80 border border-transparent'
                  }`}
                >
                  Meetings ({lead.meetings?.length || 0})
                </button>
              </div>

              {/* TAB 1: COMPLETE STORY TIMELINE */}
              {activeTab === 'timeline' && (
                <div className="rounded-2xl bg-white border border-[#E5E5E0] p-6 shadow-xs">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-[#171817] flex items-center gap-2">
                      <Shield className="w-4 h-4 text-[#B69A63]" /> The Complete Lead Story
                    </h3>
                    <span className="text-[11px] text-[#90928E]">Immutable chronological record</span>
                  </div>
                  <LeadTimeline events={timelineEvents} />
                </div>
              )}

              {/* TAB 2: ASSIGNMENT CHAIN */}
              {activeTab === 'assignments' && (
                <div className="rounded-2xl bg-white border border-[#E5E5E0] p-6 space-y-4 shadow-xs">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-[#171817] flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 text-[#B69A63]" /> Immutable Ownership History
                    </h3>
                    <span className="text-xs text-[#626560]">
                      Total transfers: {lead.assignments?.length || 0}
                    </span>
                  </div>

                  <div className="divide-y divide-[#E5E5E0] text-xs">
                    {lead.assignments?.map((a: { id: string; type: string; previousOwner?: { name: string }; newOwner?: { name: string }; performedBy: { name: string; role: string }; reason?: string; timestamp: string | Date }) => (
                      <div key={a.id} className="py-3.5 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#171817]">
                            {a.previousOwner ? a.previousOwner.name : 'Intake'} → {a.newOwner?.name || 'Unassigned'}
                          </span>
                          <span className="text-[11px] text-[#90928E] font-mono">
                            {new Date(a.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-[#626560] text-[11px]">
                          Performed by <strong className="text-[#171817]">{a.performedBy.name}</strong> ({a.performedBy.role}). Reason: {a.reason || 'Operational'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 3: FOLLOW-UPS */}
              {activeTab === 'followups' && (
                <div className="rounded-2xl bg-white border border-[#E5E5E0] p-6 space-y-4 shadow-xs">
                  <h3 className="text-sm font-bold text-[#171817] flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#B69A63]" /> Follow-up Touchpoints
                  </h3>

                  <div className="divide-y divide-[#E5E5E0] text-xs">
                    {lead.followups?.map((f: { id: string; nextAction?: string; dueAt: string | Date; completedAt?: string | Date; outcome?: string; user: { name: string } }) => (
                      <div key={f.id} className="py-3 flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-[#171817]">{f.nextAction || 'Follow-up Call'}</p>
                          <p className="text-[11px] text-[#626560] mt-0.5">
                            Due: {new Date(f.dueAt).toLocaleString()} • Assigned: {f.user.name}
                          </p>
                          {f.outcome && (
                            <p className="text-[11px] text-[#2D5A3C] mt-1 italic">
                              Outcome: {f.outcome}
                            </p>
                          )}
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                            f.completedAt
                              ? 'bg-[#EDF5F0] text-[#2D5A3C] border-[#D8EADB]'
                              : 'bg-[#FAF5EB] text-[#7A5B28] border-[#E8DCBE]'
                          }`}
                        >
                          {f.completedAt ? 'Completed' : 'Pending'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 4: MEETINGS */}
              {activeTab === 'meetings' && (
                <div className="rounded-2xl bg-white border border-[#E5E5E0] p-6 space-y-4 shadow-xs">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-[#171817] flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-[#B69A63]" /> Client Meetings
                    </h3>
                    <Button size="sm" variant="secondary" onClick={() => setIsMeetingOpen(true)}>
                      Schedule Meeting
                    </Button>
                  </div>

                  <div className="divide-y divide-[#E5E5E0] text-xs">
                    {lead.meetings?.map((m: { id: string; meetingType: string; status: string; date: string; time: string; location?: string; outcome?: string; createdBy: { name: string } }) => (
                      <div key={m.id} className="py-3 flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-[#171817]">
                            {m.meetingType} ({m.status})
                          </p>
                          <p className="text-[11px] text-[#626560] mt-0.5">
                            {m.date} at {m.time} • Location: {m.location || 'Online'}
                          </p>
                          {m.outcome && (
                            <p className="text-[11px] text-[#2D5A3C] mt-1 italic">
                              Outcome: {m.outcome}
                            </p>
                          )}
                        </div>
                        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                          m.status === 'COMPLETED'
                            ? 'bg-[#EDF5F0] text-[#2D5A3C] border-[#D8EADB]'
                            : 'bg-[#FAF5EB] text-[#7A5B28] border-[#E8DCBE]'
                        }`}>
                          {m.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-2xl bg-white border border-[#E5E5E0] p-6 shadow-xs">
              <div className="flex items-start gap-3 rounded-xl border border-[#E5E5E0] bg-[#F8F8F6] p-4">
                <Shield className="w-5 h-5 text-[#B69A63] mt-0.5" />
                <div>
                  <h3 className="text-sm font-bold text-[#171817]">Lead history is restricted to administrators.</h3>
                  <p className="text-xs text-[#626560] mt-1">
                    Executive and team lead users can manage the active lead workflow, but the historical timeline and assignment trail remain visible only to admin users.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <Modal
        isOpen={isContactEditOpen}
        onClose={() => {
          if (!contactSaving) {
            setIsContactEditOpen(false);
            setContactError(null);
          }
        }}
        title="Edit Client Details"
        subtitle={
          session.role === 'ADMIN'
            ? 'Administrators can change the client name and phone number.'
            : 'You can update the client name. Phone number changes require an administrator.'
        }
      >
        <form onSubmit={handleSaveContact} className="space-y-4">
          {contactError && (
            <div className="p-3 rounded-lg bg-[#FAF0ED] border border-[#F2C5BC] text-[#9A2215] text-xs font-medium">
              {contactError}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-[#171817] mb-1">Client Name</label>
            <input
              required
              value={contactName}
              onChange={(event) => setContactName(event.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#171817] mb-1">Phone Number</label>
            <input
              required
              type="tel"
              value={contactPhone}
              onChange={(event) => setContactPhone(event.target.value)}
              disabled={session.role !== 'ADMIN'}
              className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
            />
            {session.role !== 'ADMIN' && (
              <p className="text-[10px] text-[#8C908A] mt-1">
                Phone number is protected and can only be changed by an administrator.
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E5E0]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsContactEditOpen(false)}
              disabled={contactSaving}
            >
              Cancel
            </Button>
            <Button type="submit" variant="bronze" isLoading={contactSaving}>
              Save Client Details
            </Button>
          </div>
        </form>
      </Modal>

      <LeadUpdateModal
        isOpen={isUpdateOpen}
        onClose={() => setIsUpdateOpen(false)}
        leadId={lead.id}
        leadNumber={lead.leadNumber}
        clientName={lead.clientName}
        currentStatus={lead.currentStatus}
        onSuccess={handleRefresh}
      />

      <ReassignModal
        isOpen={isReassignOpen}
        onClose={() => setIsReassignOpen(false)}
        leadId={lead.id}
        leadNumber={lead.leadNumber}
        clientName={lead.clientName}
        currentOwnerName={lead.currentOwner?.name}
        onSuccess={handleRefresh}
      />

      <MeetingModal
        isOpen={isMeetingOpen}
        onClose={() => setIsMeetingOpen(false)}
        leadId={lead.id}
        leadNumber={lead.leadNumber}
        clientName={lead.clientName}
        onSuccess={handleRefresh}
      />

      <WhatsAppModal
        isOpen={isWhatsAppOpen}
        onClose={() => setIsWhatsAppOpen(false)}
        leadId={lead.id}
        clientName={lead.clientName}
        phone={lead.phone}
        onSuccess={handleRefresh}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteOpen}
        onClose={() => {
          setIsDeleteOpen(false);
          setDeleteError(null);
        }}
        title="Confirm Lead Deletion"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-900">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-bold text-sm">
                Permanently delete lead {lead.leadNumber} ({lead.clientName})?
              </p>
              <p className="text-red-700">
                This action is irreversible. All timeline events, updates, meetings, and call logs
                for this lead will be permanently deleted from the CRM.
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
                setIsDeleteOpen(false);
                setDeleteError(null);
              }}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={async () => {
                setIsDeleting(true);
                setDeleteError(null);
                try {
                  const res = await fetch(`/api/leads/${lead.id}`, {
                    method: 'DELETE',
                  });
                  if (!res.ok) {
                    const errData = await res.json();
                    throw new Error(errData.error || 'Failed to delete lead');
                  }
                  emitCrmSync('leads');
                  emitCrmSync('calling');
                  router.push('/dashboard/admin/leads');
                } catch (err: unknown) {
                  setDeleteError(err instanceof Error ? err.message : 'Error deleting lead');
                  setIsDeleting(false);
                }
              }}
              isLoading={isDeleting}
            >
              <Trash2 className="w-4 h-4 mr-1.5" /> Permanently Delete Lead
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
