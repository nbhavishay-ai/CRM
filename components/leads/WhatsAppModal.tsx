'use client';

import React, { useState } from 'react';
import { MessageSquare, Send, Phone, CheckCircle2, MessageCircle, FileText } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface WhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadId: string;
  clientName: string;
  phone: string;
  senderName?: string;
  onSuccess?: () => void;
}

interface MessageTemplate {
  id: string;
  name: string;
  generateText: (clientName: string, senderName: string) => string;
}

const TEMPLATES: MessageTemplate[] = [
  {
    id: 'brochure',
    name: 'Project Brochure & Overview',
    generateText: (client, sender) =>
      `Hello ${client}, this is ${sender || 'our team'} from ORVION. Thank you for your inquiry! We are pleased to share our premium project details, specifications, and brochure with you. Please let me know when it would be convenient for a quick 5-minute call.`,
  },
  {
    id: 'meeting',
    name: 'Meeting & Site Visit Confirmation',
    generateText: (client, sender) =>
      `Dear ${client}, confirming our scheduled discussion / site visit. Our executive will be glad to assist you. Please let us know if you need any directions or location coordinates beforehand. Regards, ${sender || 'ORVION'}.`,
  },
  {
    id: 'pricing',
    name: 'Pricing & Flexible Payment Plan',
    generateText: (client, sender) =>
      `Hi ${client}, as discussed, we have prepared the custom pricing summary and milestone payment plan for your selected unit. Please review at your convenience. Happy to answer any questions! - ${sender || 'ORVION'}`,
  },
  {
    id: 'followup',
    name: 'General Follow-up Reminder',
    generateText: (client, sender) =>
      `Hello ${client}, following up on our previous discussion regarding your property requirements. Would love to share the latest inventory updates with you today. Are you free for a brief call? - ${sender || 'ORVION'}`,
  },
];

export const WhatsAppModal: React.FC<WhatsAppModalProps> = ({
  isOpen,
  onClose,
  leadId,
  clientName,
  phone,
  senderName = 'Orvion Executive',
  onSuccess,
}) => {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(TEMPLATES[0].id);
  const [message, setMessage] = useState<string>(
    TEMPLATES[0].generateText(clientName, senderName)
  );
  const [sending, setSending] = useState(false);

  // Clean and normalize phone number with Indian 91 country code
  let cleanPhone = phone.replace(/[^0-9]/g, '');
  if (cleanPhone.startsWith('0') && cleanPhone.length === 11) {
    cleanPhone = cleanPhone.slice(1);
  }
  if (cleanPhone.length === 10) {
    cleanPhone = `91${cleanPhone}`;
  }

  const handleTemplateChange = (tmplId: string) => {
    setSelectedTemplateId(tmplId);
    const tmpl = TEMPLATES.find((t) => t.id === tmplId);
    if (tmpl) {
      setMessage(tmpl.generateText(clientName, senderName));
    }
  };

  const handleSend = async (channel: 'WhatsApp' | 'SMS') => {
    setSending(true);
    try {
      // 1. Log to Lead Timeline via API
      const tmplObj = TEMPLATES.find((t) => t.id === selectedTemplateId);
      const templateLabel = tmplObj?.name || 'Custom Message';

      await fetch(`/api/leads/${leadId}/updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          remark: `📲 Sent ${channel} (${templateLabel}): "${message.slice(0, 100)}${message.length > 100 ? '...' : ''}"`,
        }),
      });

      // 2. Open external WhatsApp / SMS client
      const encoded = encodeURIComponent(message);
      if (channel === 'WhatsApp') {
        const waUrl = `https://wa.me/${cleanPhone}?text=${encoded}`;
        window.open(waUrl, '_blank');
      } else {
        const smsUrl = `sms:${cleanPhone}?body=${encoded}`;
        window.location.href = smsUrl;
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Failed to log message sending:', err);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Message Customer • ${clientName}`}>
      <div className="space-y-4">
        {/* Recipient info */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-[#F8F8F6] border border-[#E5E5E0] text-xs">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-full bg-[#111314] flex items-center justify-center text-[#D2BE91] font-bold">
              <MessageSquare className="w-3.5 h-3.5" />
            </span>
            <div>
              <div className="font-semibold text-[#171817]">{clientName}</div>
              <div className="text-[11px] text-[#626560] font-mono flex items-center gap-1">
                <Phone className="w-3 h-3 text-[#B69A63]" /> {phone}
              </div>
            </div>
          </div>
          <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-[#111314] text-[#D2BE91] border border-[#1E2021]">
            WhatsApp Ready
          </span>
        </div>

        {/* Template Selector */}
        <div>
          <label className="block text-xs font-medium text-[#171817] mb-1.5 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-[#B69A63]" /> Choose Quick Template
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {TEMPLATES.map((t) => {
              const isSelected = selectedTemplateId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleTemplateChange(t.id)}
                  className={`text-left p-2.5 rounded-lg border text-xs transition flex items-start gap-2 cursor-pointer ${
                    isSelected
                      ? 'border-[#B69A63] bg-[#FAF8F5] text-[#171817] font-medium ring-1 ring-[#B69A63]/40'
                      : 'border-[#E5E5E0] bg-white text-[#626560] hover:border-[#B69A63]/50 hover:bg-[#FDFDFD]'
                  }`}
                >
                  <CheckCircle2
                    className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                      isSelected ? 'text-[#B69A63]' : 'text-[#AEB1AC]'
                    }`}
                  />
                  <span>{t.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Message Editor */}
        <div>
          <label className="block text-xs font-medium text-[#171817] mb-1">
            Message Preview / Edit (Ready to Send)
          </label>
          <textarea
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full px-3 py-2.5 text-xs rounded-lg bg-[#F8F8F6] border border-[#E5E5E0] text-[#171817] placeholder-[#AEB1AC] focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63]/30 resize-none font-sans leading-relaxed"
            placeholder="Type customized message..."
          />
          <p className="text-[11px] text-[#8C9089] mt-1">
            ⚡ Sending automatically logs a timestamped entry on the lead&apos;s activity timeline.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-3 border-t border-[#E5E5E0]">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>

          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <button
              type="button"
              disabled={sending}
              onClick={() => handleSend('SMS')}
              className="flex-1 sm:flex-none px-3.5 py-2 text-xs font-medium rounded-lg border border-[#E5E5E0] text-[#171817] bg-white hover:bg-[#F8F8F6] transition inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <MessageCircle className="w-3.5 h-3.5 text-[#626560]" /> Send SMS
            </button>

            <button
              type="button"
              disabled={sending}
              onClick={() => handleSend('WhatsApp')}
              className="flex-1 sm:flex-none px-4 py-2 text-xs font-semibold rounded-lg bg-[#111314] hover:bg-[#1E2021] text-[#D2BE91] border border-[#1E2021] hover:border-[#B69A63]/50 transition inline-flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" /> Send on WhatsApp
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
