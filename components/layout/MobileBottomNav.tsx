'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Clock,
  BriefcaseBusiness,
  Layers,
  UploadCloud,
  Calendar,
  User,
  Users,
  TrendingUp,
  Building2,
} from 'lucide-react';
import { UserRole } from '@/types';
import clsx from 'clsx';

interface MobileBottomNavProps {
  role: UserRole;
}

interface NavTab {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ role }) => {
  const pathname = usePathname();
  const [optimisticPathname, setOptimisticPathname] = useState(pathname);

  useEffect(() => {
    setOptimisticPathname(pathname);
  }, [pathname]);

  const executiveTabs: NavTab[] = [
    { label: 'Dashboard', href: '/dashboard/executive/dashboard', icon: LayoutDashboard },
    { label: 'Today', href: '/dashboard/executive/today', icon: Clock },
    { label: 'Meetings', href: '/dashboard/meetings', icon: Calendar },
    { label: 'Profile', href: '/dashboard/profile', icon: User },
  ];

  const adminTabs: NavTab[] = [
    { label: 'Leads', href: '/dashboard/admin/dashboard', icon: LayoutDashboard },
    { label: 'All Leads', href: '/dashboard/admin/leads', icon: Layers },
    { label: 'Upload', href: '/dashboard/admin/bulk-upload', icon: UploadCloud },
    { label: 'Teams', href: '/dashboard/admin/teams', icon: Building2 },
    { label: 'Profile', href: '/dashboard/profile', icon: User },
  ];

  const teamLeadTabs: NavTab[] = [
    { label: 'Dashboard', href: '/dashboard/team-lead/dashboard', icon: LayoutDashboard },
    { label: 'My Leads', href: '/dashboard/team-lead/my-leads', icon: BriefcaseBusiness },
    { label: 'Today', href: '/dashboard/team-lead/today', icon: Clock },
    { label: 'Workflow', href: '/dashboard/team-lead/workflow', icon: TrendingUp },
    { label: 'Meetings', href: '/dashboard/meetings', icon: Calendar },
    { label: 'Profile', href: '/dashboard/profile', icon: User },
  ];

  const hrTabs: NavTab[] = [
    { label: 'Dashboard', href: '/dashboard/hr/dashboard', icon: LayoutDashboard },
    { label: 'Staff', href: '/dashboard/hr/employees', icon: Users },
    { label: 'Attendance', href: '/dashboard/hr/attendance', icon: Clock },
    { label: 'Leaves', href: '/dashboard/hr/leaves', icon: Calendar },
    { label: 'Profile', href: '/dashboard/profile', icon: User },
  ];

  const tabs =
    role === 'ADMIN'
      ? adminTabs
      : role === 'TEAM_LEAD'
      ? teamLeadTabs
      : role === 'HR'
      ? hrTabs
      : executiveTabs;

  const currentPath = (optimisticPathname || pathname || '').split('?')[0];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0B0C0D] border-t border-[#1E2021] text-[#F4F2EC] px-2 py-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-2xl select-none">
      <div className="flex items-center justify-around">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const targetPath = tab.href.split('?')[0];
          const isActive = currentPath === targetPath;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              prefetch={true}
              onPointerDown={() => setOptimisticPathname(tab.href)}
              onClick={() => setOptimisticPathname(tab.href)}
              className={clsx(
                'flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all duration-100 cursor-pointer relative min-w-[56px] active:scale-95',
                isActive
                  ? 'text-[#D2BE91] font-bold'
                  : 'text-[#8E918B] hover:text-[#F4F2EC] font-medium'
              )}
            >
              <div className="relative">
                <Icon
                  className={clsx(
                    'w-5 h-5 transition-transform duration-150',
                    isActive ? 'scale-110 text-[#B69A63]' : 'text-[#8E918B]'
                  )}
                />
                {isActive && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-[#B69A63] rounded-full shadow-[0_0_6px_#B69A63]" />
                )}
              </div>
              <span className="text-[10px] mt-1 tracking-tight truncate max-w-[64px]">
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
