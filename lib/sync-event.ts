'use client';

import { useEffect } from 'react';

export type SyncEventType =
  | 'leads'
  | 'calling'
  | 'tasks'
  | 'metrics'
  | 'users'
  | 'hr'
  | 'meetings'
  | 'attendance'
  | 'all';

let channel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    channel = new BroadcastChannel('orvion_crm_sync');
  } catch {}
}

export function emitCrmSync(type: SyncEventType = 'all', payload?: unknown) {
  if (typeof window === 'undefined') return;

  const eventDetail = { type, payload, timestamp: Date.now() };

  // 1. Same tab dispatch (0ms instant)
  try {
    window.dispatchEvent(new CustomEvent('crm:sync', { detail: eventDetail }));
  } catch {}

  // 2. Cross-tab BroadcastChannel dispatch (0ms instant across all browser windows)
  if (channel) {
    try {
      channel.postMessage(eventDetail);
    } catch {}
  }

  // 3. Storage event fallback for cross-tab / iframe sync
  try {
    localStorage.setItem('__orvion_sync_pulse__', JSON.stringify(eventDetail));
  } catch {}
}

export function useCrmSync(
  types: SyncEventType[],
  onSync: (detail: { type: SyncEventType; payload?: unknown }) => void
) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleSync = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (
        detail &&
        (types.includes('all') || types.includes(detail.type) || detail.type === 'all')
      ) {
        onSync(detail);
      }
    };

    // Listen to local tab events
    window.addEventListener('crm:sync', handleSync);

    // Listen to cross-tab BroadcastChannel messages
    const handleBroadcast = (e: MessageEvent) => {
      const detail = e.data;
      if (
        detail &&
        (types.includes('all') || types.includes(detail.type) || detail.type === 'all')
      ) {
        onSync(detail);
      }
    };

    if (channel) {
      channel.addEventListener('message', handleBroadcast);
    }

    // Listen to localStorage cross-tab fallback
    const handleStorage = (e: StorageEvent) => {
      if (e.key === '__orvion_sync_pulse__' && e.newValue) {
        try {
          const detail = JSON.parse(e.newValue);
          if (
            detail &&
            (types.includes('all') || types.includes(detail.type) || detail.type === 'all')
          ) {
            onSync(detail);
          }
        } catch {}
      }
    };

    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('crm:sync', handleSync);
      window.removeEventListener('storage', handleStorage);
      if (channel) {
        channel.removeEventListener('message', handleBroadcast);
      }
    };
  }, [types, onSync]);
}

