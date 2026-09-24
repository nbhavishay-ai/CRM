import { UserSession } from '@/types';

export function isAdmin(session: UserSession | null): boolean {
  return session?.role === 'ADMIN';
}

export function isTeamLead(session: UserSession | null): boolean {
  return session?.role === 'TEAM_LEAD' || session?.role === 'ADMIN';
}

export function isExecutive(session: UserSession | null): boolean {
  return session?.role === 'EXECUTIVE';
}

export function isHR(session: UserSession | null): boolean {
  return session?.role === 'HR';
}

export function canAccessLead(
  session: UserSession,
  lead: { currentOwnerId?: string | null; currentOwner?: { teamId?: string | null } | null }
): boolean {
  // HR is strictly blocked from viewing any leads or lead details
  if (session.role === 'HR') return false;
  if (session.role === 'ADMIN') return true;
  if (session.role === 'TEAM_LEAD') {
    if (!session.teamId) return false;
    // Team lead can access if lead is assigned to someone in their team or unassigned
    if (!lead.currentOwnerId) return true;
    return lead.currentOwner?.teamId === session.teamId;
  }
  // Executive can only access if they are the current owner
  return lead.currentOwnerId === session.id;
}

export function canReassignLead(session: UserSession): boolean {
  if (session.role === 'HR') return false;
  // Only Admin has company-wide unrestricted reassignment
  // Team Lead can reassign within their team
  return session.role === 'ADMIN' || session.role === 'TEAM_LEAD';
}

export function canManageTeam(session: UserSession, targetTeamId?: string | null): boolean {
  if (session.role === 'ADMIN') return true;
  if (session.role === 'TEAM_LEAD') return session.teamId === targetTeamId;
  return false;
}

export function canAssignExecutiveTasks(session: UserSession | null): boolean {
  return session?.role === 'ADMIN' || session?.role === 'HR';
}
