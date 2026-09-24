'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Calendar,
  Clock,
  Layers,
  FolderKanban,
  FileSpreadsheet,
  ShieldCheck,
  BarChart3,
  Building2,
  PhoneOff,
  UserX,
  Share2,
  HelpCircle,
  TrendingUp,
  Sparkles,
  UploadCloud,
  Briefcase,
  DollarSign,
  UserPlus,
  User,
  Settings,
  X,
} from 'lucide-react';
import { UserRole } from '@/types';
import clsx from 'clsx';

interface SidebarProps {
  role: UserRole;
  userName?: string;
  isOpen?: boolean;
  onClose?: () => void;
}

interface NavLinkItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
}

interface NavSectionItem {
  section: string;
}

type NavItem = NavLinkItem | NavSectionItem;

export const Sidebar: React.FC<SidebarProps> = ({ role, isOpen = false, onClose }) => {
  const pathname = usePathname();
  const [optimisticPathname, setOptimisticPathname] = useState(pathname);

  // Synchronize optimistic state whenever route transition completes
  useEffect(() => {
    setOptimisticPathname(pathname);
  }, [pathname]);

  const adminNav: NavItem[] = [
    { label: 'Leads Dashboard', href: '/dashboard/admin/dashboard', icon: LayoutDashboard },
    { label: 'Deals Pipeline (Kanban)', href: '/dashboard/admin/pipeline', icon: FolderKanban },
    { section: 'LEAD MANAGEMENT' },
    { label: 'All Leads', href: '/dashboard/admin/leads', icon: Layers },
    { label: 'Interested Leads', href: '/dashboard/admin/interested', icon: Sparkles },
    { label: 'Bulk Upload Hub', href: '/dashboard/admin/bulk-upload', icon: UploadCloud },
    { section: 'QUEUES & TRIAGE' },
    { label: 'Not Answering', href: '/dashboard/admin/not-answering', icon: PhoneOff },
    { label: 'Not Interested', href: '/dashboard/admin/not-interested', icon: UserX },
    { label: 'Channel Partners', href: '/dashboard/admin/channel-partners', icon: Share2 },
    { label: 'Other Leads', href: '/dashboard/admin/other', icon: HelpCircle },
    { section: 'MANAGEMENT' },
    { label: 'All Meetings', href: '/dashboard/meetings', icon: Calendar },
    { label: 'Team Structure', href: '/dashboard/admin/teams', icon: Building2 },
    { label: 'User Directory', href: '/dashboard/admin/users', icon: Users },
    { label: 'HR & Workforce', href: '/dashboard/hr/dashboard', icon: Briefcase },
    { label: 'Reports & Funnel', href: '/dashboard/reports', icon: BarChart3 },
    { label: 'Audit Logs', href: '/dashboard/admin/audit', icon: ShieldCheck },
    { label: 'Spreadsheet Sync', href: '/dashboard/admin/sync', icon: FileSpreadsheet },
  ];

  const hrNav: NavItem[] = [
    { label: 'HR Dashboard', href: '/dashboard/hr/dashboard', icon: LayoutDashboard },
    { label: 'Staff Directory', href: '/dashboard/hr/employees', icon: Users },
    { label: 'Attendance & Shifts', href: '/dashboard/hr/attendance', icon: Clock },
    { label: 'Leave Requests', href: '/dashboard/hr/leaves', icon: Calendar },
    { label: 'Targets & Payroll', href: '/dashboard/hr/payroll', icon: DollarSign },
    { label: 'Hiring Pipeline', href: '/dashboard/hr/recruitment', icon: UserPlus },
  ];

  const teamLeadNav: NavItem[] = [
    { label: 'Team Dashboard', href: '/dashboard/team-lead/dashboard', icon: LayoutDashboard },
    { label: 'My Leads & Remarks', href: '/dashboard/team-lead/my-leads', icon: Briefcase },
    { label: "Today's Leads", href: '/dashboard/team-lead/today', icon: Clock },
    { label: 'VIEW TEAM WORKFLOW', href: '/dashboard/team-lead/workflow', icon: TrendingUp, highlight: true },
    { label: 'Deals Pipeline', href: '/dashboard/admin/pipeline', icon: FolderKanban },
    { label: 'Team Meetings', href: '/dashboard/meetings', icon: Calendar },
    { label: 'Performance Reports', href: '/dashboard/reports', icon: BarChart3 },
  ];

  const executiveNav: NavItem[] = [
    { label: 'Dashboard', href: '/dashboard/executive/dashboard', icon: LayoutDashboard },
    { label: "Today's Leads", href: '/dashboard/executive/today', icon: Clock },
    { label: 'Leads Workspace', href: '/dashboard/executive/workspace', icon: FolderKanban },
    { label: 'Weekly Meetings', href: '/dashboard/meetings', icon: Calendar },
  ];

  const items =
    role === 'ADMIN' ? adminNav : role === 'TEAM_LEAD' ? teamLeadNav : role === 'HR' ? hrNav : executiveNav;

  const currentPath = (optimisticPathname || pathname || '').split('?')[0];

  const renderSidebarContent = (isMobile: boolean) => (
    <>
      {/* Brand Header */}
      <div
        className={clsx(
          'p-5 border-b border-[#1E2021] bg-[#0B0C0D] flex items-center justify-between',
          isMobile ? 'pt-[calc(1.25rem+env(safe-area-inset-top,0px))]' : ''
        )}
      >
        <div className="flex items-center space-x-3">
          <img
            src="/logo.png"
            alt="ORVION Logo"
            className="w-8 h-8 rounded-lg object-cover border border-[#B69A63]/50 shadow-xs ring-1 ring-[#B69A63]/20"
          />
          <div>
            <h1 className="text-sm font-black tracking-widest text-[#F4F2EC] uppercase">ORVION</h1>
            <p className="text-[10px] text-[#C6AD7A] font-semibold tracking-widest uppercase mt-0.5">ENTERPRISE CRM</p>
          </div>
        </div>

        {isMobile && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#8E918B] hover:text-[#F4F2EC] hover:bg-[#1E2021] transition cursor-pointer"
            title="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Role Pill */}
      <div className="px-5 py-2.5 bg-[#111314] border-b border-[#1E2021] flex items-center justify-between">
        <span className="text-[11px] text-[#AEB1AC] font-medium tracking-wide">Access Scope</span>
        <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full border bg-[#17191A] text-[#D2BE91] border-[#B69A63]/40 tracking-wider">
          {role.replace('_', ' ')}
        </span>
      </div>

      {/* Nav List */}
      <div className="flex-1 overflow-y-auto dark-scrollbar px-3 py-4 space-y-1">
        {items.map((item, idx) => {
          if ('section' in item) {
            return (
              <div
                key={idx}
                className="text-[10px] font-bold text-[#626560] tracking-widest px-3 pt-4 pb-1.5 uppercase font-mono"
              >
                {item.section}
              </div>
            );
          }

          const Icon = item.icon;
          const targetPath = item.href.split('?')[0];
          const isActive = currentPath === targetPath;
          const isHighlight = item.highlight;

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              onPointerDown={() => setOptimisticPathname(item.href)}
              onClick={() => {
                setOptimisticPathname(item.href);
                if (isMobile && onClose) onClose();
              }}
              className={clsx(
                'flex items-center px-3 py-2 rounded-xl text-xs transition-all duration-100 relative group select-none active:scale-[0.98] cursor-pointer',
                isActive
                  ? 'bg-[#17191A] text-[#F4F2EC] border border-[#2A2D2E] font-semibold shadow-2xs'
                  : isHighlight
                  ? 'bg-[#17191A]/80 text-[#D2BE91] border border-[#B69A63]/40 font-semibold hover:bg-[#1E2021]'
                  : 'text-[#AEB1AC] hover:text-[#F4F2EC] hover:bg-[#141617]'
              )}
            >
              {/* Bronze active indicator */}
              {isActive && (
                <span className="w-1 h-3.5 bg-[#B69A63] rounded-full mr-2.5 shrink-0 shadow-[0_0_8px_rgba(182,154,99,0.5)]" />
              )}
              <Icon
                className={clsx(
                  'w-4 h-4 flex-shrink-0 mr-2.5 transition-colors',
                  isActive
                    ? 'text-[#B69A63]'
                    : isHighlight
                    ? 'text-[#C6AD7A]'
                    : 'text-[#7A7E78] group-hover:text-[#AEB1AC]'
                )}
              />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Bottom Profile Action */}
      <div className="p-3 border-t border-[#1E2021] bg-[#111314]">
        <Link
          href="/dashboard/profile"
          prefetch={true}
          onPointerDown={() => setOptimisticPathname('/dashboard/profile')}
          onClick={() => {
            setOptimisticPathname('/dashboard/profile');
            if (isMobile && onClose) onClose();
          }}
          className={clsx(
            'flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all duration-100 group cursor-pointer active:scale-[0.98]',
            currentPath === '/dashboard/profile'
              ? 'bg-[#17191A] text-[#F4F2EC] border border-[#2A2D2E]'
              : 'text-[#AEB1AC] hover:text-[#F4F2EC] hover:bg-[#17191A]'
          )}
        >
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-[#C6AD7A]" />
            <span className="font-medium">Manage Profile</span>
          </div>
          <Settings className="w-3.5 h-3.5 text-[#626560] group-hover:text-[#AEB1AC] transition-colors" />
        </Link>
      </div>

      {/* Brand Philosophy Footer */}
      <div className="p-4 border-t border-[#1E2021] bg-[#0B0C0D]">
        <p className="text-[11px] text-[#8E918B] font-serif italic leading-relaxed">
          &ldquo;Every Lead. Every Update. Every Day. Nothing Left Behind.&rdquo;
        </p>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:flex w-64 flex-shrink-0 bg-[#0B0C0D] border-r border-[#1E2021] flex-col h-screen select-none text-[#F4F2EC]">
        {renderSidebarContent(false)}
      </aside>

      {/* Mobile Slide-Over Drawer */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity"
            onClick={onClose}
          />

          {/* Drawer Surface */}
          <aside className="relative w-72 max-w-[85vw] bg-[#0B0C0D] border-r border-[#1E2021] flex flex-col h-full select-none text-[#F4F2EC] shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            {renderSidebarContent(true)}
          </aside>
        </div>
      )}
    </>
  );
};
