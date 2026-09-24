'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { Navbar } from '@/components/layout/Navbar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { TopLoadingBar } from '@/components/layout/TopLoadingBar';
import { NewLeadModal } from '@/components/leads/NewLeadModal';
import { RealtimeSyncProvider } from '@/components/providers/RealtimeSyncProvider';
import { UserSession } from '@/types';

interface DashboardShellProps {
  user: UserSession;
  children: React.ReactNode;
}

export const DashboardShell: React.FC<DashboardShellProps> = ({ user, children }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNewLeadOpen, setIsNewLeadOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    const refreshSession = async () => {
      try {
        const response = await fetch(`/api/auth/me?_t=${Date.now()}`, {
          cache: 'no-store',
          credentials: 'include',
        });
        if (!response.ok && active) {
          router.replace('/login?expired=1');
        }
      } catch {
        // A temporary network outage must not log the user out.
      }
    };

    refreshSession();
    const interval = window.setInterval(refreshSession, 5 * 60 * 1000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshSession();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [router]);

  const handleLeadCreated = () => {
    router.refresh();
  };

  const canCreateLead = user.role === 'ADMIN';

  return (
    <RealtimeSyncProvider>
      <div className="flex h-screen overflow-hidden bg-[#F4F4F1] relative">
        {/* Golden top progress indicator for 0ms visual responsiveness */}
        <TopLoadingBar />

        {/* Dynamic Role-Based Sidebar (Desktop fixed + Mobile slide-over drawer) */}
        <Sidebar
          role={user.role}
          userName={user.name}
          isOpen={isMobileMenuOpen}
          onClose={() => setIsMobileMenuOpen(false)}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Navbar
            user={user}
            onOpenNewLead={canCreateLead ? () => setIsNewLeadOpen(true) : undefined}
            onToggleMobileMenu={() => setIsMobileMenuOpen((prev) => !prev)}
          />

          <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-6 bg-[#F4F4F1]">
            <div className="max-w-7xl mx-auto space-y-6">{children}</div>
          </main>

          {/* Mobile PWA Bottom Navigation Bar */}
          <MobileBottomNav role={user.role} />
        </div>

        {/* Quick New Lead Modal (Admin Only) */}
        {canCreateLead && (
          <NewLeadModal
            isOpen={isNewLeadOpen}
            onClose={() => setIsNewLeadOpen(false)}
            onSuccess={handleLeadCreated}
          />
        )}
      </div>
    </RealtimeSyncProvider>
  );
};
