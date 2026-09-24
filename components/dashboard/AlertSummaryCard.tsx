'use client';

import React from 'react';
import { Bell } from 'lucide-react';

export interface DashboardAlertItem {
  id: string;
  title: string;
  message: string;
  read: boolean;
  link?: string | null;
}

interface AlertSummaryCardProps {
  title: string;
  subtitle: string;
  unreadAlerts: number;
  alerts: DashboardAlertItem[];
  fallbackLink?: string;
}

export function AlertSummaryCard({
  title,
  subtitle,
  unreadAlerts,
  alerts,
  fallbackLink = '/dashboard/profile',
}: AlertSummaryCardProps) {
  const handleOpenAlerts = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('open-crm-notifications'));
    }
  };

  return (
    <div className="rounded-2xl border border-[#E5E5E0] bg-white p-4 shadow-xs">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#F7F0E3] border border-[#EADCC2] flex items-center justify-center">
            <Bell className="w-4 h-4 text-[#B69A63]" />
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#626560]">Live alerts</div>
            <h3 className="text-sm font-bold text-[#171817]">{title}</h3>
          </div>
        </div>
        <div className="rounded-full bg-[#111314] px-2.5 py-1 text-[10px] font-bold text-[#F4F2EC]">
          {unreadAlerts} unread
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {alerts.length ? (
          alerts.map((alert) => (
            <a
              key={alert.id}
              href={alert.link || fallbackLink}
              className="block rounded-xl border border-[#E5E5E0] bg-[#F8F8F6] p-2.5 transition hover:border-[#B69A63]/50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-[#171817]">{alert.title}</span>
                {!alert.read && <span className="h-2 w-2 rounded-full bg-[#B42318]" />}
              </div>
              <p className="mt-1 text-[11px] text-[#626560] leading-relaxed">{alert.message}</p>
            </a>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-[#E5E5E0] bg-[#F8F8F6] p-3 text-[11px] text-[#626560]">
            {subtitle}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={handleOpenAlerts}
        className="mt-3 inline-flex items-center rounded-lg border border-[#E5E5E0] bg-[#F8F8F6] px-2.5 py-1.5 text-[11px] font-semibold text-[#171817] hover:border-[#B69A63]/60 hover:bg-[#F4F1EA] transition cursor-pointer"
      >
        View all alerts
      </button>
    </div>
  );
}
