'use client';

import { useCallback, useEffect, useState } from 'react';
import { useCrmSync } from '@/lib/sync-event';

export interface LiveUserOption {
  id: string;
  name: string;
  email?: string;
  role?: string;
  active?: boolean;
  teamId?: string | null;
  team?: { id: string; name: string } | null;
}

export function useLiveUsers(role?: string) {
  const [users, setUsers] = useState<LiveUserOption[]>([]);

  const loadUsers = useCallback(async () => {
    const params = new URLSearchParams({ _t: Date.now().toString() });
    if (role) params.set('role', role);

    try {
      const response = await fetch(`/api/users?${params.toString()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!response.ok) return;
      const data = await response.json();
      setUsers(data.users || []);
    } catch {
      // Keep the last successful list available while the request retries.
    }
  }, [role]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useCrmSync(['users', 'all'], loadUsers);

  return { users, refreshUsers: loadUsers };
}
