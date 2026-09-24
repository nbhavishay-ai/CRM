'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, Plus, LogOut, RefreshCw, User, Menu, Search, X } from 'lucide-react';
import { UserSession } from '@/types';
import { NotificationDrawer, NotificationItem } from '../notifications/NotificationDrawer';
import { CommandPalette } from './CommandPalette';
import { useCrmSync } from '@/lib/sync-event';
import { getFastCache, setFastCache } from '@/lib/fast-data';

interface NavbarProps {
  user: UserSession;
  onOpenNewLead?: () => void;
  onToggleMobileMenu?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ user, onOpenNewLead, onToggleMobileMenu }) => {
  const router = useRouter();
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error'>('synced');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [liveAlert, setLiveAlert] = useState<NotificationItem | null>(null);
  const previousNotificationIds = useRef<Set<string> | null>(null);
  const liveAlertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        const list = data.notifications || [];
        const currentIds = new Set<string>(list.map((notification: NotificationItem) => notification.id));
        const previousIds = previousNotificationIds.current;
        if (previousIds) {
          const newestNotification = list.find(
            (notification: NotificationItem) => !previousIds.has(notification.id) && !notification.read
          );
          if (newestNotification) {
            setLiveAlert(newestNotification);
            if (liveAlertTimer.current) clearTimeout(liveAlertTimer.current);
            liveAlertTimer.current = setTimeout(() => setLiveAlert(null), 8000);

            if (
              typeof document !== 'undefined' &&
              document.hidden &&
              'Notification' in window &&
              Notification.permission === 'granted'
            ) {
              new Notification(newestNotification.title, {
                body: newestNotification.message,
                icon: '/icon-192.png',
                tag: newestNotification.id,
              });
            }
          }
        }
        previousNotificationIds.current = currentIds;
        setNotifications(list);
        setFastCache('crm:notifications', list, 30000);
      }
    } catch {
      // silent catch
    }
  }, []);

  useEffect(() => {
    const cachedNotifications = getFastCache<NotificationItem[]>('crm:notifications');
    if (cachedNotifications) {
      setNotifications(cachedNotifications);
      previousNotificationIds.current = new Set(cachedNotifications.map((notification) => notification.id));
    }
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => {
      clearInterval(interval);
      if (liveAlertTimer.current) clearTimeout(liveAlertTimer.current);
    };
  }, [fetchNotifications]);

  useEffect(() => {
    const handleOpenNotifications = () => setIsDrawerOpen(true);
    window.addEventListener('open-crm-notifications', handleOpenNotifications);
    return () => window.removeEventListener('open-crm-notifications', handleOpenNotifications);
  }, []);

  useCrmSync(['leads', 'calling', 'tasks', 'all'], () => {
    fetchNotifications();
  });

  useEffect(() => {
    const updateOnlineStatus = () => {
      if (typeof navigator !== 'undefined') {
        setSyncStatus(navigator.onLine ? 'synced' : 'error');
      }
    };
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  const handleManualSync = async () => {
    setSyncStatus('syncing');
    try {
      const res = await fetch(`/api/sync/pulse?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (res.ok) {
        setTimeout(() => setSyncStatus('synced'), 400);
      } else {
        setSyncStatus('error');
      }
    } catch {
      setSyncStatus('error');
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch {
      setIsLoggingOut(false);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    document.title = unreadCount > 0 ? `(${unreadCount > 99 ? '99+' : unreadCount}) ORVION CRM` : 'ORVION CRM';
    return () => {
      document.title = 'ORVION CRM';
    };
  }, [unreadCount]);

  return (
    <header
      className="bg-white/95 backdrop-blur-md border-b border-[#E5E5E0] sticky top-0 z-30 shadow-[0_1px_3px_rgba(0,0,0,0.02)] transition-all"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <div className="h-14 sm:h-16 px-3 sm:px-6 flex items-center justify-between w-full">
        {/* Left: Mobile Hamburger & Team / Sync status / OmniSearch */}
        <div className="flex items-center space-x-2 sm:space-x-4 min-w-0">
          {/* Mobile Hamburger Button */}
          {onToggleMobileMenu && (
            <button
              type="button"
              onClick={onToggleMobileMenu}
              className="lg:hidden p-2 -ml-1 rounded-xl text-[#171817] hover:bg-[#F4F4F1] active:bg-[#ECECE8] transition cursor-pointer shrink-0"
              title="Open Navigation Menu"
              aria-label="Open Navigation Menu"
            >
              <Menu className="w-5 h-5 text-[#171817]" />
            </button>
          )}

          {/* Mobile Logo on small screens */}
          <Link
            href="/dashboard"
            className="flex items-center space-x-2 lg:hidden group shrink-0"
          >
            <img
              src="/logo.png"
              alt="ORVION Logo"
              className="w-7 h-7 rounded-lg object-cover border border-[#B69A63]/50 shadow-xs"
            />
            <div className="flex flex-col">
              <span className="text-xs font-black tracking-widest text-[#171817] uppercase leading-tight">
                ORVION
              </span>
              {user.role === 'ADMIN' && (
                <span className="text-[8px] font-mono font-bold tracking-wider text-[#B69A63] uppercase leading-none hidden xs:block">
                  Admin
                </span>
              )}
            </div>
          </Link>

          {/* OmniSearch Quick Bar */}
          <button
            onClick={() => setIsCommandPaletteOpen(true)}
            className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-[#F8F8F6] hover:bg-[#F4F4F0] border border-[#E5E5E0] rounded-xl text-xs text-zinc-500 transition-all cursor-pointer group"
          >
            <Search className="w-3.5 h-3.5 text-zinc-400 group-hover:text-[#B69A63] transition-colors" />
            <span className="font-medium text-[11px] text-zinc-600">Quick search...</span>
            <kbd className="text-[10px] font-semibold text-zinc-400 bg-white border border-zinc-200 px-1.5 py-0.2 rounded-md shadow-2xs">
              Ctrl+K
            </kbd>
          </button>

          {/* Real-time Sync Indicator */}
          <button
            onClick={handleManualSync}
            title="Click to re-check database sync"
            className="hidden sm:flex items-center space-x-2 px-3 py-1 rounded-full text-xs transition cursor-pointer border bg-[#EDF5F0] border-[#D3E5D9] text-[#2D5A3C] hover:bg-[#E3EFE7]"
          >
            {syncStatus === 'synced' && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-[#2D5A3C]"></span>
                <span className="text-[11px] font-medium">Synced with Cloud</span>
              </>
            )}
            {syncStatus === 'syncing' && (
              <>
                <RefreshCw className="w-3 h-3 text-[#626560] animate-spin" />
                <span className="text-[11px] font-medium text-[#626560]">Syncing...</span>
              </>
            )}
            {syncStatus === 'error' && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-[#753330]"></span>
                <span className="text-[11px] font-medium text-[#753330]">Offline Mode</span>
              </>
            )}
          </button>

          {user.teamName && (
            <span className="hidden xl:inline-block text-xs text-[#626560] bg-[#F8F8F6] px-2.5 py-1 rounded-md border border-[#E5E5E0] font-normal">
              Team: <strong className="text-[#171817] font-semibold">{user.teamName}</strong>
            </span>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center space-x-1.5 sm:space-x-2.5 shrink-0">
          {onOpenNewLead && (
            <button
              onClick={onOpenNewLead}
              className="h-8 sm:h-9 px-2.5 sm:px-3.5 rounded-xl bg-gradient-to-r from-[#B69A63] to-[#C6AD7A] hover:from-[#C6AD7A] hover:to-[#D2BE91] text-[#0B0C0D] font-bold text-xs uppercase tracking-wider shadow-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer shrink-0"
              title="Create New Lead"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span className="hidden sm:inline">New Lead</span>
            </button>
          )}

          {/* Mobile search icon */}
          <button
            onClick={() => setIsCommandPaletteOpen(true)}
            className="md:hidden p-2 rounded-xl text-[#626560] hover:text-[#171817] hover:bg-[#F8F8F6] transition cursor-pointer"
            aria-label="Search"
            title="Quick Search"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Real-Time Notifications Center Bell */}
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="p-2 rounded-xl text-[#626560] hover:text-[#171817] hover:bg-[#F8F8F6] relative transition border border-transparent hover:border-[#E5E5E0] cursor-pointer shrink-0"
            aria-label="Notifications"
            title="Open Notification Center"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[15px] h-[15px] px-0.5 bg-rose-600 text-white text-[9px] font-black flex items-center justify-center rounded-full ring-2 ring-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* User Identity Profile */}
          <div className="flex items-center space-x-1.5 sm:space-x-2 pl-1.5 sm:pl-3 border-l border-[#E5E5E0] shrink-0">
            <Link
              href="/dashboard/profile"
              prefetch={true}
              title="Manage Profile"
              className="flex items-center space-x-2 hover:opacity-85 transition group"
            >
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#111314] text-[#F4F2EC] font-bold flex items-center justify-center text-xs shadow-xs group-hover:ring-2 group-hover:ring-[#B69A63]/50 shrink-0">
                {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="hidden sm:block text-left text-xs leading-tight">
                <p className="font-bold text-[#171817] truncate max-w-[120px] group-hover:text-[#B69A63]">
                  {user.name}
                </p>
                <p className="text-[10px] text-[#626560] truncate max-w-[120px] font-mono">
                  {user.role.replace('_', ' ')}
                </p>
              </div>
            </Link>

            <Link
              href="/dashboard/profile"
              prefetch={true}
              title="Manage Profile"
              className="hidden md:flex p-1.5 rounded-lg text-[#90928E] hover:text-[#171817] hover:bg-[#F8F8F6] transition cursor-pointer"
            >
              <User className="w-4 h-4" />
            </Link>

            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              title="Sign out of ORVION"
              className="p-1.5 rounded-lg text-[#90928E] hover:text-[#753330] hover:bg-[#F7EEED] transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Real-time Notification Center Drawer (Feature #4) */}
      <NotificationDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        notifications={notifications}
        onRefresh={fetchNotifications}
      />

      {liveAlert && (
        <div className="fixed right-3 top-[calc(4.5rem+env(safe-area-inset-top))] z-40 w-[min(22rem,calc(100vw-1.5rem))] animate-in slide-in-from-right-3 fade-in duration-200">
          <button
            type="button"
            onClick={() => {
              setLiveAlert(null);
              if (liveAlert.link) router.push(liveAlert.link);
              else setIsDrawerOpen(true);
            }}
            className="w-full rounded-2xl border border-[#B69A63]/40 bg-white p-3 text-left shadow-xl ring-1 ring-black/5 transition hover:border-[#B69A63] cursor-pointer"
            aria-label={`Open alert: ${liveAlert.title}`}
          >
            <span className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#F7F0E3] text-[#B69A63]">
                <Bell className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-[#B69A63]">
                  New alert
                </span>
                <span className="mt-0.5 block truncate text-xs font-bold text-[#171817]">
                  {liveAlert.title}
                </span>
                <span className="mt-0.5 block line-clamp-2 text-[11px] leading-relaxed text-[#626560]">
                  {liveAlert.message}
                </span>
              </span>
              <span
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation();
                  setLiveAlert(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    setLiveAlert(null);
                  }
                }}
                className="rounded-lg p-1 text-[#90928E] hover:bg-[#F8F8F6] hover:text-[#171817]"
                aria-label="Dismiss alert"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            </span>
          </button>
        </div>
      )}

      {/* Command Palette Modal */}
      <CommandPalette
        user={user}
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onOpenNewLead={onOpenNewLead}
      />
    </header>
  );
};
