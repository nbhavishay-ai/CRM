'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  Search,
  User,
  Users,
  Calendar,
  ArrowRight,
  PlusCircle,
  Clock,
  Briefcase,
  X,
  Sparkles,
  ShieldCheck,
  LayoutGrid,
  FileSpreadsheet,
} from 'lucide-react';
import { UserSession } from '@/types';

interface SearchResultItem {
  id: string;
  type: 'lead' | 'user' | 'team' | 'meeting' | 'candidate';
  title: string;
  subtitle: string;
  badge?: string;
  badgeColor?: string;
  url: string;
  metadata?: Record<string, any>;
}

interface CommandPaletteProps {
  user: UserSession;
  isOpen: boolean;
  onClose: () => void;
  onOpenNewLead?: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  user,
  isOpen,
  onClose,
  onOpenNewLead,
}) => {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [activeType, setActiveType] = useState<string>('all');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Quick Action items based on role
  const quickActions = [
    ...(user.role === 'ADMIN' && onOpenNewLead
      ? [
          {
            id: 'action-new-lead',
            title: 'Create New Lead',
            subtitle: 'Add a new client dossier manually to CRM',
            icon: PlusCircle,
            badge: 'Admin',
            action: () => {
              onClose();
              onOpenNewLead();
            },
          },
        ]
      : []),
    ...(user.role === 'ADMIN' || user.role === 'TEAM_LEAD'
      ? [
          {
            id: 'action-pipeline',
            title: 'Deals Pipeline (Kanban)',
            subtitle: 'Visual funnel view with live deal stages',
            icon: LayoutGrid,
            badge: 'Pipeline',
            action: () => {
              onClose();
              router.push('/dashboard/admin/pipeline');
            },
          },
          {
            id: 'action-bulk-upload',
            title: 'Bulk Upload Hub',
            subtitle: 'Import lead batches',
            icon: FileSpreadsheet,
            badge: 'Import',
            action: () => {
              onClose();
              router.push('/dashboard/admin/bulk-upload');
            },
          },
        ]
      : []),
    {
      id: 'action-meetings',
      title: 'Meetings & Site Visits Calendar',
      subtitle: 'Scheduled presentations & boardroom meetings',
      icon: Calendar,
      badge: 'Calendar',
      action: () => {
        onClose();
        router.push('/dashboard/meetings');
      },
    },
    {
      id: 'action-attendance',
      title: 'Attendance & Work Status',
      subtitle: 'Daily clock-in logs and shift hours',
      icon: Clock,
      badge: 'HR',
      action: () => {
        onClose();
        router.push(
          user.role === 'HR'
            ? '/dashboard/hr/attendance'
            : '/dashboard/profile'
        );
      },
    },
    {
      id: 'action-profile',
      title: 'My Profile & Security Settings',
      subtitle: 'Contact info, credentials & password',
      icon: ShieldCheck,
      badge: 'Account',
      action: () => {
        onClose();
        router.push('/dashboard/profile');
      },
    },
  ];

  // Focus input on open & lock background scroll
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      document.body.style.overflow = 'hidden';
      const timer = setTimeout(() => inputRef.current?.focus(), 60);
      return () => {
        clearTimeout(timer);
        document.body.style.overflow = '';
      };
    } else {
      document.body.style.overflow = '';
    }
  }, [isOpen]);

  // Global key listener for Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          inputRef.current?.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Perform search query
  useEffect(() => {
    if (!isOpen) return;

    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(query.trim())}&type=${activeType}`
        );
        if (res.ok) {
          const json = await res.json();
          setResults(json.results || []);
          setSelectedIndex(0);
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setLoading(false);
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [query, activeType, isOpen]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const totalItems = query.trim() ? results.length : quickActions.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, totalItems));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + totalItems) % Math.max(1, totalItems));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (query.trim() && results[selectedIndex]) {
        handleSelectResult(results[selectedIndex]);
      } else if (!query.trim() && quickActions[selectedIndex]) {
        quickActions[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const handleSelectResult = (item: SearchResultItem) => {
    onClose();
    router.push(item.url);
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-12 sm:pt-20 px-4 pb-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-2xl bg-[#111314] text-[#F4F2EC] rounded-3xl shadow-[0_25px_70px_rgba(0,0,0,0.9)] border border-[#B69A63]/30 overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150 relative"
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header Bar */}
        <div className="p-4 sm:p-5 border-b border-[#26282B] flex items-center gap-3.5 bg-[#17181A] relative">
          <div className="w-9 h-9 rounded-xl bg-[#222527] border border-[#B69A63]/40 flex items-center justify-center shrink-0">
            <Search className="w-4 h-4 text-[#D2BE91]" />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search leads, phone numbers, staff, teams, meetings..."
            className="w-full bg-transparent text-sm sm:text-base text-[#F4F2EC] placeholder-[#727570] outline-none font-medium"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1.5 hover:bg-[#26282B] rounded-lg text-[#727570] hover:text-[#F4F2EC] transition cursor-pointer"
              title="Clear input"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-mono font-bold text-[#8E918B] bg-[#1E2021] border border-[#2E3133] rounded-lg hover:text-white hover:border-[#B69A63]/50 transition cursor-pointer"
          >
            ESC
          </button>
        </div>

        {/* Category Filters (when search query is active) */}
        {query.trim() && (
          <div className="flex items-center gap-2 px-4 sm:px-5 py-2.5 border-b border-[#222426] bg-[#141517] overflow-x-auto text-xs">
            {[
              { id: 'all', label: 'All Results' },
              { id: 'leads', label: 'Leads' },
              { id: 'users', label: 'Staff' },
              { id: 'teams', label: 'Teams' },
              { id: 'meetings', label: 'Meetings' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveType(tab.id)}
                className={`px-3 py-1 rounded-full font-bold text-[11px] transition cursor-pointer shrink-0 ${
                  activeType === tab.id
                    ? 'bg-gradient-to-r from-[#B69A63] to-[#D2BE91] text-[#111314] shadow-sm'
                    : 'text-[#8E918B] hover:text-[#F4F2EC] hover:bg-[#1E2021]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Body Content */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-1">
          {loading ? (
            <div className="py-14 text-center text-[#8E918B] text-xs sm:text-sm flex flex-col items-center justify-center gap-3">
              <div className="w-6 h-6 border-2 border-[#B69A63] border-t-transparent rounded-full animate-spin" />
              <span>Searching real-time CRM database...</span>
            </div>
          ) : query.trim() ? (
            results.length > 0 ? (
              <div className="space-y-1.5">
                <div className="px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[#B69A63]">
                  Matches Found ({results.length})
                </div>
                {results.map((item, idx) => {
                  const isSelected = idx === selectedIndex;
                  return (
                    <div
                      key={`${item.type}-${item.id}`}
                      onClick={() => handleSelectResult(item)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`px-3.5 py-3 rounded-2xl cursor-pointer flex items-center justify-between transition-all ${
                        isSelected
                          ? 'bg-[#1E2021] border border-[#B69A63]/60 shadow-lg text-[#F4F2EC]'
                          : 'hover:bg-[#18191B] border border-transparent text-[#AEB1AC]'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                            item.type === 'lead'
                              ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/40'
                              : item.type === 'user'
                              ? 'bg-purple-950/60 text-purple-400 border-purple-800/40'
                              : item.type === 'team'
                              ? 'bg-amber-950/60 text-amber-400 border-amber-800/40'
                              : 'bg-blue-950/60 text-blue-400 border-blue-800/40'
                          }`}
                        >
                          {item.type === 'lead' && <User className="w-4 h-4" />}
                          {item.type === 'user' && <Briefcase className="w-4 h-4" />}
                          {item.type === 'team' && <Users className="w-4 h-4" />}
                          {item.type === 'meeting' && <Calendar className="w-4 h-4" />}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-[#F4F2EC] truncate">
                              {item.title}
                            </span>
                            {item.badge && (
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                  item.badgeColor || 'bg-[#2A2315] text-[#D2BE91] border-[#B69A63]/40'
                                }`}
                              >
                                {item.badge}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#8E918B] truncate mt-0.5">
                            {item.subtitle}
                          </p>
                        </div>
                      </div>

                      <ArrowRight
                        className={`w-4 h-4 shrink-0 ml-2 transition-transform ${
                          isSelected ? 'text-[#D2BE91] translate-x-0.5' : 'text-[#525550]'
                        }`}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-14 text-center text-[#8E918B]">
                <Search className="w-8 h-8 mx-auto text-[#424540] mb-2" />
                <p className="font-bold text-sm text-[#F4F2EC]">No records match &ldquo;{query}&rdquo;</p>
                <p className="text-xs text-[#727570] mt-1">
                  Try searching by client phone number, email, lead # or staff name.
                </p>
              </div>
            )
          ) : (
            <div className="space-y-1.5">
              <div className="px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[#B69A63] flex items-center justify-between">
                <span>Quick Actions</span>
                <span className="text-[10px] normal-case text-[#626560]">Press ↵ to launch</span>
              </div>
              {quickActions.map((action, idx) => {
                const isSelected = idx === selectedIndex;
                const Icon = action.icon;
                return (
                  <div
                    key={action.id}
                    onClick={action.action}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`px-3.5 py-3 rounded-2xl cursor-pointer flex items-center justify-between transition-all ${
                      isSelected
                        ? 'bg-[#1E2021] border border-[#B69A63]/60 shadow-lg text-[#F4F2EC]'
                        : 'hover:bg-[#18191B] border border-transparent text-[#AEB1AC]'
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-9 h-9 rounded-xl bg-[#17181A] border border-[#2A2D2E] text-[#D2BE91] flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-[#D2BE91]" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-sm text-[#F4F2EC]">{action.title}</p>
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-[#2A2315] text-[#D2BE91] border border-[#B69A63]/30">
                            {action.badge}
                          </span>
                        </div>
                        <p className="text-xs text-[#8E918B] mt-0.5">{action.subtitle}</p>
                      </div>
                    </div>
                    <ArrowRight
                      className={`w-4 h-4 transition-transform ${
                        isSelected ? 'text-[#D2BE91] translate-x-0.5' : 'text-[#525550]'
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 sm:px-5 py-3 bg-[#17181A] border-t border-[#26282B] text-[11px] text-[#727570] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline">
              <kbd className="font-mono font-bold text-[#D2BE91] bg-[#222527] px-1.5 py-0.5 rounded border border-[#2E3133]">
                ↑
              </kbd>{' '}
              <kbd className="font-mono font-bold text-[#D2BE91] bg-[#222527] px-1.5 py-0.5 rounded border border-[#2E3133]">
                ↓
              </kbd>{' '}
              navigate
            </span>
            <span>
              <kbd className="font-mono font-bold text-[#D2BE91] bg-[#222527] px-1.5 py-0.5 rounded border border-[#2E3133]">
                ↵
              </kbd>{' '}
              select
            </span>
          </div>
          <span className="text-[#D2BE91] font-bold flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#B69A63]" /> ORVION OmniSearch
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
};
