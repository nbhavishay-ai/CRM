'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  User,
  Phone,
  MessageSquare,
  DollarSign,
  Calendar,
  ChevronRight,
  TrendingUp,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  MoreVertical,
  Flame,
  ArrowRight,
  ExternalLink,
  Zap,
} from 'lucide-react';
import { LeadTemperatureBadge } from '../leads/LeadTemperatureBadge';
import { WhatsAppModal } from '../leads/WhatsAppModal';
import { emitCrmSync } from '@/lib/sync-event';

export interface PipelineLead {
  id: string;
  leadNumber: string;
  clientName: string;
  phone: string;
  source: string;
  currentStatus: string;
  currentCategory: string;
  score?: number | null;
  temperature?: string | null;
  estimatedValue?: number | null;
  nextAction?: string | null;
  nextActionAt?: string | null;
  createdAt: string;
  currentOwner?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

interface KanbanBoardProps {
  leads: PipelineLead[];
  onRefresh: () => void;
  isAdmin?: boolean;
}

interface ColumnDef {
  id: string;
  title: string;
  color: string;
  badgeBg: string;
  statuses: string[];
}

const COLUMNS: ColumnDef[] = [
  {
    id: 'NEW',
    title: 'New Inquiries',
    color: 'border-blue-400',
    badgeBg: 'bg-blue-50 text-blue-700 border-blue-200',
    statuses: ['NEW'],
  },
  {
    id: 'CONTACTED',
    title: 'Contacted & Follow-up',
    color: 'border-amber-400',
    badgeBg: 'bg-amber-50 text-amber-700 border-amber-200',
    statuses: ['INTERESTED', 'FOLLOW_UP', 'CALL_BACK'],
  },
  {
    id: 'MEETING',
    title: 'Site Visit / Meeting',
    color: 'border-purple-400',
    badgeBg: 'bg-purple-50 text-purple-700 border-purple-200',
    statuses: ['MEETING', 'SITE_VISIT'],
  },
  {
    id: 'NEGOTIATION',
    title: 'Quotation & Negotiation',
    color: 'border-indigo-400',
    badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    statuses: ['QUOTATION', 'NEGOTIATION'],
  },
  {
    id: 'CLOSED_WON',
    title: 'Closed Won',
    color: 'border-emerald-500',
    badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    statuses: ['CLOSED_WON'],
  },
  {
    id: 'LOST_OTHER',
    title: 'Lost / NA / Other',
    color: 'border-zinc-400',
    badgeBg: 'bg-zinc-100 text-zinc-700 border-zinc-200',
    statuses: ['CLOSED_LOST', 'NOT_INTERESTED', 'NOT_ANSWERING', 'OTHER', 'CHANNEL_PARTNER'],
  },
];

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  leads,
  onRefresh,
  isAdmin = true,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOwner, setSelectedOwner] = useState<string>('ALL');
  const [selectedTemp, setSelectedTemp] = useState<string>('ALL');
  const [whatsAppLead, setWhatsAppLead] = useState<PipelineLead | null>(null);
  const [movingLeadId, setMovingLeadId] = useState<string | null>(null);

  // Extract unique executives
  const uniqueOwners = useMemo(() => {
    const ownersMap = new Map<string, string>();
    leads.forEach((l) => {
      if (l.currentOwner) {
        ownersMap.set(l.currentOwner.id, l.currentOwner.name);
      }
    });
    return Array.from(ownersMap.entries()).map(([id, name]) => ({ id, name }));
  }, [leads]);

  // Filter leads
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      if (
        searchQuery &&
        !lead.clientName.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !lead.phone.includes(searchQuery) &&
        !lead.leadNumber.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }
      if (selectedOwner !== 'ALL') {
        if (selectedOwner === 'UNASSIGNED' && lead.currentOwner) return false;
        if (selectedOwner !== 'UNASSIGNED' && lead.currentOwner?.id !== selectedOwner)
          return false;
      }
      if (selectedTemp !== 'ALL' && lead.temperature !== selectedTemp) {
        return false;
      }
      return true;
    });
  }, [leads, searchQuery, selectedOwner, selectedTemp]);

  // Group leads into columns
  const columnData = useMemo(() => {
    return COLUMNS.map((col) => {
      const colLeads = filteredLeads.filter((l) =>
        col.statuses.includes(l.currentStatus)
      );
      const totalValue = colLeads.reduce(
        (sum, l) => sum + (l.estimatedValue || 0),
        0
      );
      return {
        ...col,
        leads: colLeads,
        totalValue,
      };
    });
  }, [filteredLeads]);

  const totalPipelineValue = useMemo(() => {
    return filteredLeads.reduce((sum, l) => sum + (l.estimatedValue || 0), 0);
  }, [filteredLeads]);

  const formatCurrency = (val: number) => {
    if (val >= 10000000) {
      return `₹${(val / 10000000).toFixed(2)} Cr`;
    }
    if (val >= 100000) {
      return `₹${(val / 100000).toFixed(2)} L`;
    }
    return `₹${val.toLocaleString('en-IN')}`;
  };

  const handleStageChange = async (leadId: string, newStatus: string) => {
    setMovingLeadId(leadId);
    try {
      const res = await fetch(`/api/leads/${leadId}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          reason: `Pipeline stage changed to ${newStatus}`,
        }),
      });

      if (res.ok) {
        emitCrmSync('leads');
        onRefresh();
      }
    } catch (err) {
      console.error('Failed to change stage:', err);
    } finally {
      setMovingLeadId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Filter & Metric Bar */}
      <div className="bg-white p-4 rounded-xl border border-[#E5E5E0] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative min-w-[220px]">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter deals..."
              className="w-full pl-9 pr-3 py-1.5 bg-[#FBFBFA] border border-[#E5E5E0] rounded-lg text-xs text-[#171817] outline-none focus:border-[#B69A63]"
            />
          </div>

          {/* Executive Filter */}
          <select
            value={selectedOwner}
            onChange={(e) => setSelectedOwner(e.target.value)}
            className="px-3 py-1.5 bg-[#FBFBFA] border border-[#E5E5E0] rounded-lg text-xs text-[#171817] outline-none focus:border-[#B69A63]"
          >
            <option value="ALL">All Executives</option>
            <option value="UNASSIGNED">Unassigned Pool</option>
            {uniqueOwners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>

          {/* Temperature Filter */}
          <select
            value={selectedTemp}
            onChange={(e) => setSelectedTemp(e.target.value)}
            className="px-3 py-1.5 bg-[#FBFBFA] border border-[#E5E5E0] rounded-lg text-xs text-[#171817] outline-none focus:border-[#B69A63]"
          >
            <option value="ALL">All Temperatures</option>
            <option value="HOT">🔥 HOT</option>
            <option value="WARM">☀️ WARM</option>
            <option value="COLD">❄️ COLD</option>
          </select>
        </div>

        {/* Right Total Metric */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <span className="text-[11px] text-[#626560] font-medium block">
              Total Pipeline Value
            </span>
            <span className="text-base font-bold text-[#171817] tracking-tight text-[#B69A63]">
              {formatCurrency(totalPipelineValue)}
            </span>
          </div>
          <div className="h-8 w-px bg-zinc-200" />
          <div className="text-right">
            <span className="text-[11px] text-[#626560] font-medium block">
              Active Deals
            </span>
            <span className="text-base font-bold text-[#171817]">
              {filteredLeads.length}
            </span>
          </div>
        </div>
      </div>

      {/* Kanban Columns: fixed-width columns inside an explicit horizontal scroller */}
      <div className="w-full overflow-x-auto overflow-y-hidden pb-4">
        <div className="flex min-w-max items-start gap-4">
          {columnData.map((col) => (
            <div
              key={col.id}
              className="w-[270px] shrink-0 bg-[#F8F8F6] rounded-xl border border-[#E5E5E0] flex flex-col max-h-[calc(100vh-250px)]"
            >
            {/* Column Header */}
            <div
              className={`p-3 border-b border-[#E5E5E0] bg-white rounded-t-xl border-t-4 ${col.color}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-[#171817] truncate">
                  {col.title}
                </span>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${col.badgeBg}`}
                >
                  {col.leads.length}
                </span>
              </div>
              <div className="mt-1 text-[11px] font-semibold text-[#8C9089]">
                {formatCurrency(col.totalValue)}
              </div>
            </div>

            {/* Column Cards List */}
            <div className="p-2 space-y-2.5 overflow-y-auto flex-1">
              {col.leads.length === 0 ? (
                <div className="py-8 text-center text-xs text-zinc-400 border border-dashed border-zinc-200 rounded-lg">
                  No deals in this stage
                </div>
              ) : (
                col.leads.map((lead) => (
                  <div
                    key={lead.id}
                    className={`bg-white p-3 rounded-lg border border-[#E5E5E0] shadow-sm hover:shadow-md transition-all ${
                      movingLeadId === lead.id ? 'opacity-50 pointer-events-none' : ''
                    }`}
                  >
                    {/* Top Row: Lead Number & Temp */}
                    <div className="flex items-center justify-between text-[11px] mb-1.5">
                      <span className="font-mono text-zinc-500 font-semibold">
                        {lead.leadNumber}
                      </span>
                      <LeadTemperatureBadge
                        score={lead.score || 50}
                        temperature={lead.temperature || 'WARM'}
                      />
                    </div>

                    {/* Client Name & Phone */}
                    <Link
                      href={
                        isAdmin
                          ? `/dashboard/leads/${lead.id}`
                          : `/dashboard/executive/workspace?leadId=${lead.id}`
                      }
                      prefetch={true}
                      className="font-bold text-sm text-[#171817] hover:text-[#B69A63] transition-colors block truncate"
                    >
                      {lead.clientName}
                    </Link>

                    <div className="text-xs text-zinc-500 mt-0.5 flex items-center justify-between">
                      <span>{lead.phone}</span>
                      {lead.estimatedValue ? (
                        <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 text-[10px]">
                          {formatCurrency(lead.estimatedValue)}
                        </span>
                      ) : null}
                    </div>

                    {/* Owner & Next Action */}
                    <div className="mt-2 pt-2 border-t border-zinc-100 flex items-center justify-between text-[11px] text-zinc-500">
                      <span className="truncate max-w-[120px]">
                        👤 {lead.currentOwner ? lead.currentOwner.name : 'Unassigned'}
                      </span>
                      {lead.nextActionAt && (
                        <span className="text-amber-700 font-medium shrink-0">
                          📅 {new Date(lead.nextActionAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>

                    {/* Stage Move Dropdown & Quick Actions */}
                    <div className="mt-2.5 pt-2 border-t border-zinc-100 flex items-center justify-between gap-1.5">
                      <select
                        value={lead.currentStatus}
                        onChange={(e) => handleStageChange(lead.id, e.target.value)}
                        className="text-[10px] font-semibold bg-zinc-50 border border-zinc-200 rounded px-1.5 py-1 text-zinc-700 outline-none hover:bg-zinc-100 w-full"
                      >
                        <option value="NEW">Stage: NEW</option>
                        <option value="INTERESTED">Stage: INTERESTED</option>
                        <option value="FOLLOW_UP">Stage: FOLLOW UP</option>
                        <option value="CALL_BACK">Stage: CALL BACK</option>
                        <option value="MEETING">Stage: MEETING</option>
                        <option value="SITE_VISIT">Stage: SITE VISIT</option>
                        <option value="QUOTATION">Stage: QUOTATION</option>
                        <option value="NEGOTIATION">Stage: NEGOTIATION</option>
                        <option value="CLOSED_WON">Stage: CLOSED WON</option>
                        <option value="CLOSED_LOST">Stage: CLOSED LOST</option>
                        <option value="NOT_ANSWERING">Stage: NOT ANSWERING</option>
                      </select>

                      {/* WhatsApp trigger */}
                      <button
                        onClick={() => setWhatsAppLead(lead)}
                        className="p-1 rounded text-emerald-600 hover:bg-emerald-50 transition-colors shrink-0"
                        title="Send WhatsApp"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>

                      {/* Phone trigger */}
                      <a
                        href={`tel:${lead.phone}`}
                        className="p-1 rounded text-blue-600 hover:bg-blue-50 transition-colors shrink-0"
                        title="Call"
                      >
                        <Phone className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
            </div>
          ))}
        </div>
      </div>

      {/* WhatsApp Modal */}
      {whatsAppLead && (
        <WhatsAppModal
          isOpen={true}
          onClose={() => setWhatsAppLead(null)}
          leadId={whatsAppLead.id}
          clientName={whatsAppLead.clientName}
          phone={whatsAppLead.phone}
          senderName="Orvion Executive"
        />
      )}
    </div>
  );
};
