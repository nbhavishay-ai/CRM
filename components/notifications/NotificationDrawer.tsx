'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  X,
  CheckCheck,
  Trash2,
  AlertTriangle,
  UserPlus,
  Share2,
  Calendar,
  CheckCircle2,
  Clock,
  Sparkles,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  link?: string | null;
  read: boolean;
  createdAt: string;
}

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  onRefresh: () => void;
}

function formatRelativeTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  isOpen,
  onClose,
  notifications,
  onRefresh,
}) => {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'all' | 'sla' | 'assignments' | 'meetings_tasks'>('all');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Tab filtering
  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (activeTab === 'all') return true;
      if (activeTab === 'sla') {
        return (
          n.type.toLowerCase().includes('sla') ||
          n.type.toLowerCase().includes('alert') ||
          n.title.toLowerCase().includes('sla') ||
          n.title.toLowerCase().includes('escalat')
        );
      }
      if (activeTab === 'assignments') {
        return (
          n.type.toLowerCase().includes('assign') ||
          n.type.toLowerCase().includes('task') ||
          n.title.toLowerCase().includes('assign') ||
          n.title.toLowerCase().includes('allocated') ||
          n.title.toLowerCase().includes('task assigned') ||
          n.message.toLowerCase().includes('assigned you a task') ||
          n.message.toLowerCase().includes('assigned a task')
        );
      }
      if (activeTab === 'meetings_tasks') {
        return (
          n.type.toLowerCase().includes('meeting') ||
          n.type.toLowerCase().includes('followup') ||
          n.type.toLowerCase().includes('task') ||
          n.title.toLowerCase().includes('meeting') ||
          n.title.toLowerCase().includes('task')
        );
      }
      return true;
    });
  }, [notifications, activeTab]);

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.read).length;
  }, [notifications]);

  const formatTimeAgo = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHrs = Math.floor(diffMin / 60);
      const diffDays = Math.floor(diffHrs / 24);

      if (diffSec < 60) return 'Just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      if (diffHrs < 24) return `${diffHrs}h ago`;
      if (diffDays === 1) return 'Yesterday';
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  const handleMarkAllRead = async () => {
    setIsProcessing(true);
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      onRefresh();
    } catch (err) {
      console.error('Failed to mark all read:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearAll = async () => {
    setIsProcessing(true);
    try {
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      setIsConfirmingClear(false);
      onRefresh();
    } catch (err) {
      console.error('Failed to clear notifications:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMarkSingleRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      onRefresh();
    } catch (err) {
      console.error('Failed to mark read:', err);
    }
  };

  const handleDeleteSingle = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      onRefresh();
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const handleClickItem = (item: NotificationItem) => {
    if (!item.read) {
      handleMarkSingleRead(item.id);
    }
    if (item.link) {
      onClose();
      router.push(item.link);
    }
  };

  const getItemIcon = (type: string, title: string) => {
    const t = (type + ' ' + title).toLowerCase();
    if (t.includes('sla') || t.includes('escalat') || t.includes('breach')) {
      return <ShieldAlert className="w-4 h-4 text-red-600" />;
    }
    if (t.includes('reassign')) {
      return <Share2 className="w-4 h-4 text-blue-600" />;
    }
    if (t.includes('assign') || t.includes('task assigned') || t.includes('daily task')) {
      return <UserPlus className="w-4 h-4 text-indigo-600" />;
    }
    if (t.includes('meeting')) {
      return <Calendar className="w-4 h-4 text-purple-600" />;
    }
    if (t.includes('task') || t.includes('followup')) {
      return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
    }
    return <Sparkles className="w-4 h-4 text-[#B69A63]" />;
  };

  const getItemBadgeStyle = (type: string, title: string) => {
    const t = (type + ' ' + title).toLowerCase();
    if (t.includes('sla') || t.includes('escalat') || t.includes('breach')) {
      return 'bg-red-50 border-red-200 text-red-700';
    }
    if (t.includes('assign')) {
      return 'bg-blue-50 border-blue-200 text-blue-700';
    }
    if (t.includes('meeting')) {
      return 'bg-purple-50 border-purple-200 text-purple-700';
    }
    if (t.includes('task') || t.includes('followup')) {
      return 'bg-emerald-50 border-emerald-200 text-emerald-700';
    }
    return 'bg-amber-50 border-amber-200 text-amber-700';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 h-dvh overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      <div className="absolute inset-y-0 right-0 h-dvh max-w-full flex pl-0 sm:pl-10">
        <div className="w-screen sm:w-[min(100vw-2.5rem,28rem)] max-w-md h-dvh min-h-0 bg-white border-l border-[#E5E5E0] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
          {/* Drawer Header */}
          <div className="p-4 pt-[calc(1rem+env(safe-area-inset-top))] sm:pt-4 border-b border-[#E5E5E0] bg-[#FBFBFA] flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
                <Bell className="w-4 h-4 text-[#B69A63]" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[#171817] flex items-center gap-2">
                  Notifications
                  {unreadCount > 0 && (
                    <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {unreadCount} new
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-[#626560]">Real-time CRM alerts &amp; escalations</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 hover:bg-zinc-200 text-zinc-500 hover:text-zinc-800 rounded-lg transition-colors"
              title="Close drawer (ESC)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Action Header (Mark all / Clear all) */}
          <div className="px-4 py-2 bg-white border-b border-[#E5E5E0] flex items-center justify-between gap-3 text-xs shrink-0">
            <span className="text-[11px] font-semibold text-zinc-500">
              {notifications.length} Total Alerts
            </span>

            <div className="flex items-center gap-2">
              {isConfirmingClear ? (
                <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 px-2 py-0.5 rounded-lg">
                  <span className="text-[10px] text-red-700 font-semibold">Clear all?</span>
                  <button
                    onClick={handleClearAll}
                    disabled={isProcessing}
                    className="text-[10px] font-bold text-red-700 hover:text-red-900 underline cursor-pointer"
                  >
                    Yes, Clear
                  </button>
                  <button
                    onClick={() => setIsConfirmingClear(false)}
                    className="text-[10px] font-medium text-zinc-600 hover:text-zinc-900 cursor-pointer ml-1"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      disabled={isProcessing}
                      className="text-[11px] font-semibold text-[#B69A63] hover:text-[#937B4D] flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                    </button>
                  )}
                  {notifications.length > 0 && (
                    <button
                      onClick={() => setIsConfirmingClear(true)}
                      disabled={isProcessing}
                      className="text-[11px] font-semibold text-zinc-400 hover:text-red-600 flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Clear all
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Category Filter Tabs */}
          <div className="flex items-center gap-1.5 px-4 py-2 border-b border-[#E5E5E0] bg-[#F7F7F5] overflow-x-auto text-[11px] shrink-0">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1 rounded-full font-semibold transition-all shrink-0 ${
                activeTab === 'all'
                  ? 'bg-[#171817] text-white shadow-xs'
                  : 'text-zinc-600 hover:bg-zinc-200/60'
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              onClick={() => setActiveTab('sla')}
              className={`px-3 py-1 rounded-full font-semibold transition-all shrink-0 ${
                activeTab === 'sla'
                  ? 'bg-[#171817] text-white shadow-xs'
                  : 'text-zinc-600 hover:bg-zinc-200/60'
              }`}
            >
              SLA Alerts
            </button>
            <button
              onClick={() => setActiveTab('assignments')}
              className={`px-3 py-1 rounded-full font-semibold transition-all shrink-0 ${
                activeTab === 'assignments'
                  ? 'bg-[#171817] text-white shadow-xs'
                  : 'text-zinc-600 hover:bg-zinc-200/60'
              }`}
            >
              Assignments
            </button>
            <button
              onClick={() => setActiveTab('meetings_tasks')}
              className={`px-3 py-1 rounded-full font-semibold transition-all shrink-0 ${
                activeTab === 'meetings_tasks'
                  ? 'bg-[#171817] text-white shadow-xs'
                  : 'text-zinc-600 hover:bg-zinc-200/60'
              }`}
            >
              Meetings &amp; Tasks
            </button>
          </div>

          {/* Notifications List */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
            {filteredNotifications.length === 0 ? (
              <div className="py-20 text-center text-zinc-400">
                <CheckCircle2 className="w-10 h-10 mx-auto text-zinc-300 mb-2" />
                <p className="font-semibold text-sm text-zinc-600">You're all caught up!</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  No alerts in this category right now.
                </p>
              </div>
            ) : (
              filteredNotifications.map((item) => {
                const badgeStyle = getItemBadgeStyle(item.type, item.title);
                return (
                  <div
                    key={item.id}
                    onClick={() => handleClickItem(item)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer relative group ${
                      !item.read
                        ? 'bg-white border-[#B69A63]/50 shadow-xs ring-1 ring-[#B69A63]/20'
                        : 'bg-[#FBFBFA] border-[#E5E5E0] hover:bg-white hover:border-zinc-300'
                    }`}
                  >
                    {/* Unread indicator dot */}
                    {!item.read && (
                      <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-[#B69A63]" />
                    )}

                    <div className="flex items-start gap-2.5">
                      {/* Icon Avatar */}
                      <div
                        className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${badgeStyle}`}
                      >
                        {getItemIcon(item.type, item.title)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-xs text-[#171817] truncate">
                            {item.title}
                          </h4>
                        </div>
                        <p className="text-xs text-[#626560] mt-0.5 leading-relaxed line-clamp-2">
                          {item.message}
                        </p>

                        <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-400">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {formatRelativeTime(item.createdAt)}
                          </span>

                          {item.link && (
                            <span className="text-[#B69A63] font-semibold flex items-center gap-0.5 group-hover:underline">
                              View <ExternalLink className="w-2.5 h-2.5" />
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quick Row Actions on Hover */}
                    <div className="mt-2 pt-2 border-t border-zinc-100 flex items-center justify-end gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                      {!item.read && (
                        <button
                          onClick={(e) => handleMarkSingleRead(item.id, e)}
                          className="text-[10px] text-zinc-600 hover:text-emerald-700 bg-zinc-100 hover:bg-emerald-50 px-2 py-0.5 rounded font-medium flex items-center gap-1 transition-colors"
                          title="Mark as read"
                        >
                          <CheckCheck className="w-3 h-3" /> Mark read
                        </button>
                      )}
                      <button
                        onClick={(e) => handleDeleteSingle(item.id, e)}
                        className="text-[10px] text-zinc-400 hover:text-red-600 bg-zinc-100 hover:bg-red-50 p-1 rounded transition-colors"
                        title="Delete notification"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Drawer Footer */}
          <div className="p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] bg-[#FBFBFA] border-t border-[#E5E5E0] text-[11px] text-zinc-500 flex items-center justify-between gap-3 shrink-0">
            <span>ORVION Real-Time Notifications</span>
            <span className="font-mono text-[10px] text-zinc-400">Auto-sync 0ms</span>
          </div>
        </div>
      </div>
    </div>
  );
};
