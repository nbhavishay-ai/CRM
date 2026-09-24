'use client';

import React, { useEffect, useRef } from 'react';
import { emitCrmSync } from '@/lib/sync-event';
import { invalidateFastCache } from '@/lib/fast-data';

interface RealtimeSyncProviderProps {
  children?: React.ReactNode;
}

export const RealtimeSyncProvider: React.FC<RealtimeSyncProviderProps> = ({ children }) => {
  const lastPulseKeyRef = useRef<string | null>(null);
  const isFirstCheckRef = useRef<boolean>(true);
  const isCheckingRef = useRef<boolean>(false);

  const checkPulse = async () => {
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;

    try {
      const res = await fetch(`/api/sync/pulse?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });

      if (res.ok) {
        const data = await res.json();
        const currentPulse = data.pulseKey;

        if (lastPulseKeyRef.current === null) {
          lastPulseKeyRef.current = currentPulse;
          isFirstCheckRef.current = false;
        } else if (lastPulseKeyRef.current !== currentPulse) {
          lastPulseKeyRef.current = currentPulse;
          
          // Data changed on server (e.g. bulk upload, new lead assigned, status updated)
          // 1. Invalidate stale client caches
          invalidateFastCache();

          // 2. Broadcast local sync event to all active reactive views
          emitCrmSync('all', data);
        }
      }
    } catch {
      // silent background failure
    } finally {
      isCheckingRef.current = false;
    }
  };

  useEffect(() => {
    // Initial pulse check
    checkPulse();

    // Moderate heartbeat avoids making every open CRM tab issue database-heavy
    // requests continuously. Focus/visibility events still trigger immediately.
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) {
        // Lower frequency when tab is in background to save battery/bandwidth
        return;
      }
      checkPulse();
    }, 15000);

    // Background tab heartbeat
    const bgInterval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) {
        checkPulse();
      }
    }, 30000);

    // Instant check when executive switches back to tab or device unlocks
    const handleFocus = () => checkPulse();
    const handleVisibility = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        checkPulse();
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      clearInterval(bgInterval);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return <>{children}</>;
};
