'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCrmSync } from '@/lib/sync-event';
import { Zap } from 'lucide-react';

export const ExecutiveRealtimeListener: React.FC = () => {
  const router = useRouter();

  const lastRefreshRef = React.useRef(0);

  useCrmSync(['leads', 'calling', 'tasks', 'all'], () => {
    const now = Date.now();
    if (now - lastRefreshRef.current > 8000) {
      lastRefreshRef.current = now;
      try {
        router.refresh();
      } catch {}
    }
  });

  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FAF9F5] border border-[#B69A63]/30 text-[11px] font-semibold text-[#7A5B28] shadow-2xs">
      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
      <span className="hidden sm:inline">Live Real-time Sync Active</span>
      <span className="sm:hidden">Live</span>
    </div>
  );
};
