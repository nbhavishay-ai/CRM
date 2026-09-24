'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Phone,
  ArrowUpRight,
  Clock,
  AlertTriangle,
  UserCheck,
  RefreshCw,
  MessageCircle,
  FileText,
  Trash2,
} from 'lucide-react';
import { Badge, getStatusBadgeVariant } from '../ui/Badge';
import { Button } from '../ui/Button';
import { WhatsAppModal } from './WhatsAppModal';
import { LeadTemperatureBadge } from './LeadTemperatureBadge';
import { formatWhatsAppUrl, formatTelUrl } from '@/lib/contact';

interface LeadCardProps {
  lead: {
    id: string;
    leadNumber: string;
    clientName: string;
    phone: string;
    source: string;
    currentStatus: string;
    currentCategory: string;
    isNewToMe: boolean;
    score?: number | null;
    temperature?: string | null;
    nextAction?: string | null;
    nextActionAt?: string | Date | null;
    lastUpdatedAt: string | Date;
    createdAt: string | Date;
    currentOwner?: { id: string; name: string } | null;
    updates?: Array<{ remark: string; createdAt: string | Date }>;
  };
  onUpdate?: () => void;
  onReassign?: () => void;
  onDelete?: () => void;
  canReassign?: boolean;
  canDelete?: boolean;
  showStory?: boolean;
  selectable?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

function formatLeadDate(value: string | Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export const LeadCard = React.memo<LeadCardProps>(function LeadCard({
  lead,
  onUpdate,
  onReassign,
  onDelete,
  canReassign = false,
  canDelete = false,
  showStory = false,
  selectable = false,
  isSelected = false,
  onToggleSelect,
}) {
  const [isWhatsAppOpen, setIsWhatsAppOpen] = useState(false);

  const isOverdue =
    lead.nextActionAt &&
    new Date(lead.nextActionAt) < new Date() &&
    lead.currentCategory === 'ACTIVE';

  const latestRemark = lead.updates && lead.updates.length > 0 ? lead.updates[0].remark : null;

  return (
    <div
      className={`rounded-2xl bg-white border p-5 transition-all shadow-xs hover:shadow-md flex flex-col justify-between space-y-4 relative group ${
        isSelected ? 'border-[#B69A63] bg-[#FAF6EE]/50 ring-2 ring-[#B69A63]/30' : 'border-[#E5E5E0] hover:border-[#B69A63]'
      }`}
    >
      {/* Top row: Badges and Lead ID */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
          {selectable && onToggleSelect && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(lead.id)}
              className="w-4 h-4 rounded-md border-[#D1D1CB] text-[#B69A63] focus:ring-[#B69A63] cursor-pointer accent-[#B69A63] shrink-0 mr-1"
              title={isSelected ? 'Deselect lead' : 'Select lead'}
            />
          )}
          <span className="font-mono text-[11px] font-bold text-[#171817] bg-[#F8F8F6] px-2.5 py-0.5 rounded-md border border-[#E5E5E0]">
            {lead.leadNumber}
          </span>
          <Badge variant={getStatusBadgeVariant(lead.currentStatus)}>
            {lead.currentStatus.replace('_', ' ')}
          </Badge>
          <LeadTemperatureBadge score={lead.score} temperature={lead.temperature} />
          {lead.isNewToMe && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#FAF5EB] text-[#7A5B28] border border-[#E8DCBE]">
              <UserCheck className="w-3 h-3 text-[#B69A63]" /> New To Me
            </span>
          )}
        </div>

        {isOverdue && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-[#FDF2F0] text-[#8C332E] border border-[#F1C7C5] shadow-2xs shrink-0">
            <AlertTriangle className="w-3 h-3 text-[#8C332E]" /> Overdue
          </span>
        )}
      </div>

      {/* Client Name & Phone */}
      <div>
        <h4 className="text-base font-bold text-[#171817] group-hover:text-[#B69A63] transition-colors">
          {lead.clientName}
        </h4>
        <div className="flex items-center space-x-2.5 text-xs text-[#626560] mt-1 flex-wrap gap-y-1">
          <a
            href={formatTelUrl(lead.phone)}
            className="inline-flex items-center text-[#171817] hover:text-[#2D5A3C] font-semibold transition"
            title="Click to dial directly"
          >
            <Phone className="w-3 h-3 mr-1 text-[#2D5A3C]" />
            {lead.phone}
          </a>
          <span>•</span>
          <a
            href={formatWhatsAppUrl(lead.phone, lead.clientName)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-[#1E7E34] hover:underline font-semibold transition text-[11px]"
            title="Direct WhatsApp Chat"
          >
            <MessageCircle className="w-3 h-3 mr-1 text-[#25D366]" />
            WhatsApp
          </a>
          <span>•</span>
          <span className="text-[#90928E] text-[11px]">{lead.source}</span>
        </div>
      </div>

      {/* Latest Remark if present */}
      {latestRemark && (
        <div className="p-3 rounded-xl bg-[#F8F8F6] border-l-2 border-l-[#B69A63] border-y border-r border-[#E5E5E0] text-[11px] text-[#171817] italic line-clamp-2 shadow-2xs">
          &ldquo;{latestRemark}&rdquo;
        </div>
      )}

      {/* Next Action & Schedule */}
      <div className="pt-3 border-t border-[#E5E5E0] text-xs">
        <div className="flex items-center justify-between text-[#626560]">
          <span className="text-[11px] font-medium text-[#626560]">Next Action:</span>
          {lead.nextActionAt && (
            <span
              className={`text-[11px] font-semibold flex items-center gap-1 ${
                isOverdue ? 'text-[#8C332E] font-bold' : 'text-[#171817]'
              }`}
            >
              <Clock className={`w-3 h-3 ${isOverdue ? 'text-[#8C332E]' : 'text-[#B69A63]'}`} />
              {formatLeadDate(lead.nextActionAt)}
            </span>
          )}
        </div>
        <p className="text-xs font-semibold text-[#171817] mt-0.5 truncate">
          {lead.nextAction || 'No next action scheduled'}
        </p>
      </div>

      {/* Bottom Actions */}
      <div className="pt-3 flex items-center justify-between border-t border-[#E5E5E0] gap-2">
        <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
          {/* Direct Call Button */}
          <a
            href={formatTelUrl(lead.phone)}
            title={`Direct Call: ${lead.phone}`}
            className="px-2.5 py-1.5 rounded-lg bg-[#EDF5F0] hover:bg-[#E3EFE7] text-[#2D5A3C] border border-[#D3E5D9] text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
          >
            <Phone className="w-3.5 h-3.5 text-[#2D5A3C]" /> Call
          </a>

          {/* Direct WhatsApp Button */}
          <a
            href={formatWhatsAppUrl(lead.phone, lead.clientName)}
            target="_blank"
            rel="noopener noreferrer"
            title={`Connect directly on WhatsApp: ${lead.phone}`}
            className="px-2.5 py-1.5 rounded-lg bg-[#EBF7F0] hover:bg-[#DFEFE6] text-[#1E7E34] border border-[#CDE9D7] text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
          >
            <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" /> WhatsApp
          </a>

          {/* Templates Modal Trigger */}
          <button
            type="button"
            onClick={() => setIsWhatsAppOpen(true)}
            title="Pre-written message templates & SMS"
            className="p-1.5 rounded-lg bg-[#F8F8F6] hover:bg-[#F0EFEB] text-[#626560] hover:text-[#171817] border border-[#E5E5E0] text-xs font-medium inline-flex items-center transition cursor-pointer shadow-2xs"
          >
            <FileText className="w-3.5 h-3.5 text-[#B69A63]" />
          </button>

          {onUpdate && (
            <Button size="sm" variant="secondary" onClick={onUpdate} title="Add a lead remark and next action">
              Add Remark
            </Button>
          )}
          {canReassign && onReassign && (
            <Button size="sm" variant="outline" onClick={onReassign} title="Reassign lead">
              <RefreshCw className="w-3 h-3 text-[#626560]" />
            </Button>
          )}
          {canDelete && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 transition cursor-pointer"
              title="Delete Lead"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {showStory && (
          <Link
            href={`/dashboard/leads/${lead.id}`}
            prefetch={true}
            className="text-xs font-bold text-[#171817] hover:text-[#B69A63] inline-flex items-center gap-0.5 transition shrink-0"
          >
            Story <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>

      <WhatsAppModal
        isOpen={isWhatsAppOpen}
        onClose={() => setIsWhatsAppOpen(false)}
        leadId={lead.id}
        clientName={lead.clientName}
        phone={lead.phone}
        onSuccess={onUpdate}
      />
    </div>
  );
});
