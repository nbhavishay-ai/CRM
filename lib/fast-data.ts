'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { SyncEventType } from './sync-event';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

// Global In-Memory Cache Store (survives tab switches, component unmounts)
const globalCache = new Map<string, CacheEntry<unknown>>();

// In-flight Promise Map for Request De-duplication
const inFlightRequests = new Map<string, Promise<unknown>>();

export function getFastCache<T>(key: string): T | null {
  const entry = globalCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) {
    // Check sessionStorage fallback if in browser
    if (typeof window !== 'undefined') {
      try {
        const raw = sessionStorage.getItem(`_fast_cache_${key}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Date.now() - parsed.timestamp < parsed.ttl) {
            globalCache.set(key, parsed);
            return parsed.data as T;
          }
        }
      } catch {}
    }
    return null;
  }
  return entry.data;
}

export function setFastCache<T>(key: string, data: T, ttl: number = 60000): void {
  const entry: CacheEntry<T> = {
    data,
    timestamp: Date.now(),
    ttl,
  };
  globalCache.set(key, entry as CacheEntry<unknown>);

  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(`_fast_cache_${key}`, JSON.stringify(entry));
    } catch {}
  }
}

export function invalidateFastCache(pattern?: string | RegExp): void {
  if (!pattern) {
    globalCache.clear();
    if (typeof window !== 'undefined') {
      try {
        for (let index = sessionStorage.length - 1; index >= 0; index--) {
          const key = sessionStorage.key(index);
          if (key?.startsWith('_fast_cache_')) {
            sessionStorage.removeItem(key);
          }
        }
      } catch {}
    }
    return;
  }

  const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
  for (const key of Array.from(globalCache.keys())) {
    if (regex.test(key)) {
      globalCache.delete(key);
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.removeItem(`_fast_cache_${key}`);
        } catch {}
      }
    }
  }
}

export interface UseFastQueryOptions<T> {
  initialData?: T;
  ttl?: number;
  syncDomains?: SyncEventType[];
  revalidateOnMount?: boolean;
  revalidateOnFocus?: boolean;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

export interface UseFastQueryResult<T> {
  data: T;
  loading: boolean;
  isValidating: boolean;
  error: Error | null;
  mutate: (newData: T | ((prev: T) => T), shouldRevalidate?: boolean) => void;
  refresh: () => Promise<T | null>;
}

/**
 * useFastQuery Hook
 * Returns data in 0ms if cached, revalidates seamlessly in background.
 * Automatically synchronizes with CRM real-time events.
 */
export function useFastQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  options: UseFastQueryOptions<T> = {}
): UseFastQueryResult<T> {
  const {
    initialData,
    ttl = 60000,
    syncDomains = ['all'],
    revalidateOnMount = true,
    revalidateOnFocus = true,
    onSuccess,
    onError,
  } = options;

  const [data, setData] = useState<T>(initialData as T);
  const [loading, setLoading] = useState<boolean>(!initialData);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const performFetch = useCallback(
    async (isBackground: boolean = false): Promise<T | null> => {
      if (!key) return null;

      if (!isBackground) {
        // Only show skeleton if we have no cached data at all
        if (globalCache.get(key) === undefined) {
          setLoading(true);
        }
      }
      setIsValidating(true);

      try {
        let fetchPromise = inFlightRequests.get(key) as Promise<T> | undefined;
        if (!fetchPromise) {
          fetchPromise = fetcherRef.current();
          inFlightRequests.set(key, fetchPromise as Promise<unknown>);
        }

        const freshData = await fetchPromise;
        inFlightRequests.delete(key);

        setFastCache(key, freshData, ttl);
        setData(freshData);
        setError(null);
        if (onSuccessRef.current) {
          onSuccessRef.current(freshData);
        }
        return freshData;
      } catch (err: unknown) {
        inFlightRequests.delete(key);
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        if (onErrorRef.current) {
          onErrorRef.current(e);
        }
        return null;
      } finally {
        setLoading(false);
        setIsValidating(false);
      }
    },
    [key, ttl]
  );

  // Initial mount fetch / background revalidation
  useEffect(() => {
    if (!key) return;

    const existing = getFastCache<T>(key);
    if (existing !== null) {
      setData(existing);
      setLoading(false);
      if (revalidateOnMount) {
        performFetch(true);
      }
    } else {
      performFetch(false);
    }
  }, [key, revalidateOnMount, performFetch]);

  // Window Focus Auto-Revalidation
  useEffect(() => {
    if (!key || !revalidateOnFocus) return;

    const handleFocus = () => {
      performFetch(true);
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [key, revalidateOnFocus, performFetch]);

  // Real-time CRM Sync Auto-Refresh
  useEffect(() => {
    if (!key) return;

    const handleSync = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (
        detail &&
        (syncDomains.includes('all') ||
          syncDomains.includes(detail.type) ||
          detail.type === 'all')
      ) {
        // Background revalidation on sync
        performFetch(true);
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === '__orvion_sync_pulse__' && e.newValue) {
        try {
          const detail = JSON.parse(e.newValue);
          if (
            detail &&
            (syncDomains.includes('all') ||
              syncDomains.includes(detail.type) ||
              detail.type === 'all')
          ) {
            performFetch(true);
          }
        } catch {}
      }
    };

    window.addEventListener('crm:sync', handleSync);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('crm:sync', handleSync);
      window.removeEventListener('storage', handleStorage);
    };
  }, [key, syncDomains, performFetch]);

  // Optimistic Mutation Helper
  const mutate = useCallback(
    (newData: T | ((prev: T) => T), shouldRevalidate: boolean = true) => {
      if (!key) return;

      setData((prev) => {
        const next = typeof newData === 'function' ? (newData as (p: T) => T)(prev) : newData;
        setFastCache(key, next, ttl);
        return next;
      });

      if (shouldRevalidate) {
        performFetch(true);
      }
    },
    [key, ttl, performFetch]
  );

  return {
    data,
    loading,
    isValidating,
    error,
    mutate,
    refresh: () => performFetch(false),
  };
}
