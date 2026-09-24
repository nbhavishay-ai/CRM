export type UserRole = 'ADMIN' | 'TEAM_LEAD' | 'EXECUTIVE' | 'HR';

export type LeadStatus =
  | 'NEW'
  | 'INTERESTED'
  | 'FOLLOW_UP'
  | 'CALL_BACK'
  | 'MEETING'
  | 'SITE_VISIT'
  | 'QUOTATION'
  | 'NEGOTIATION'
  | 'NOT_ANSWERING'
  | 'NOT_INTERESTED'
  | 'CHANNEL_PARTNER'
  | 'OTHER'
  | 'CLOSED_WON'
  | 'CLOSED_LOST';

export type LeadCategory =
  | 'ACTIVE'
  | 'NOT_ANSWERING'
  | 'NOT_INTERESTED'
  | 'CHANNEL_PARTNER'
  | 'OTHER'
  | 'CLOSED';

export type MeetingStatus = 'UPCOMING' | 'COMPLETED' | 'CANCELLED' | 'RESCHEDULED';

export type AssignmentType = 'INITIAL' | 'REASSIGNMENT' | 'UNASSIGNED';

export type NotificationType =
  | 'LEAD_ASSIGNED'
  | 'LEAD_REASSIGNED'
  | 'FOLLOWUP_DUE'
  | 'MEETING_REMINDER'
  | 'SYSTEM'
  | 'SLA_BREACH'
  | 'SLA_ESCALATION'
  | 'TASK_ASSIGNED'
  | 'ATTENDANCE_MARK_OUT_REQUEST'
  | 'ATTENDANCE_MARK_OUT_REVIEW';

export type TaskPriority = 'HIGH' | 'NORMAL' | 'LOW';
export type TaskStatus = 'PENDING' | 'COMPLETED' | 'OVERDUE';

export interface ExecutiveTaskItem {
  id: string;
  title: string;
  description?: string | null;
  priority: string;
  dueDate: string;
  dueTime: string;
  status: string;
  completedAt?: string | Date | null;
  assigneeId: string;
  assignee?: { id: string; name: string; email: string; designation?: string | null };
  createdById: string;
  createdBy?: { id: string; name: string; email: string; role: string };
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface UserSession {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  teamId?: string | null;
  teamName?: string | null;
}

export interface LeadWithRelations {
  id: string;
  leadNumber: string;
  clientName: string;
  phone: string;
  alternatePhone?: string | null;
  email?: string | null;
  company?: string | null;
  location?: string | null;
  source: string;
  notes?: string | null;
  currentOwnerId?: string | null;
  currentOwner?: {
    id: string;
    name: string;
    email: string;
    teamId?: string | null;
    team?: { id: string; name: string } | null;
  } | null;
  currentStatus: string;
  currentCategory: string;
  nextAction?: string | null;
  nextActionAt?: string | Date | null;
  isNewToMe: boolean;
  lastUpdatedAt: string | Date;
  createdAt: string | Date;
  updatedAt: string | Date;
  assignments?: Array<{
    id: string;
    previousOwner?: { id: string; name: string } | null;
    newOwner?: { id: string; name: string } | null;
    performedBy: { id: string; name: string };
    reason?: string | null;
    type: string;
    timestamp: string | Date;
  }>;
  updates?: Array<{
    id: string;
    userId: string;
    user: { id: string; name: string };
    remark: string;
    nextAction?: string | null;
    nextActionAt?: string | Date | null;
    createdAt: string | Date;
  }>;
  followups?: Array<{
    id: string;
    userId: string;
    user: { id: string; name: string };
    dueAt: string | Date;
    completedAt?: string | Date | null;
    outcome?: string | null;
    nextAction?: string | null;
  }>;
  meetings?: Array<{
    id: string;
    date: string;
    time: string;
    meetingType: string;
    location?: string | null;
    status: string;
    outcome?: string | null;
  }>;
}
