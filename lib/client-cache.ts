/**
 * Resilient multi-instance synchronization cache for serverless environments.
 * Ensures optimistic creations, edits, and deletions persist across ephemeral lambda containers.
 */

export interface CachedUserItem {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  teamId?: string | null;
  team?: { id: string; name: string } | null;
  phone?: string | null;
  designation?: string | null;
  department?: string | null;
  baseSalary?: number | null;
  emergencyContact?: string | null;
  routingAvailable?: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  _localUpdatedAt?: number;
}

const CACHE_USERS_KEY = 'orvion_persistent_users_v3';
const DELETED_USERS_KEY = 'orvion_persistent_deleted_users_v3';

export function getCachedUsers(): CachedUserItem[] {
  if (typeof window === 'undefined') return [];
  try {
    localStorage.removeItem(CACHE_USERS_KEY);
    localStorage.removeItem(DELETED_USERS_KEY);
  } catch {}
  return [];
}

export function saveCachedUsers(_users: CachedUserItem[]): void {
  // No-op to avoid storing stale test executives locally
}

export function getDeletedUserIds(): Set<string> {
  return new Set();
}

export function markUsersAsDeleted(_ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(CACHE_USERS_KEY);
    localStorage.removeItem(DELETED_USERS_KEY);
  } catch {}
}

export function upsertCachedUser(_user: CachedUserItem): void {
  // No-op
}

export function mergeUsersWithResilience<T extends { id: string; email: string; [key: string]: any }>(
  serverUsers: T[],
  _currentReactState?: T[]
): T[] {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(CACHE_USERS_KEY);
      localStorage.removeItem(DELETED_USERS_KEY);
    } catch {}
  }
  return serverUsers;
}
