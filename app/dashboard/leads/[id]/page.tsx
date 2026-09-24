import React from 'react';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getLeadById } from '@/services/lead.service';
import { canAccessLead, canReassignLead } from '@/lib/permissions';
import { LeadDetailClient } from './LeadDetailClient';

export const dynamic = 'force-dynamic';

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  // HR is strictly restricted from customer leads
  if (session.role === 'HR') {
    redirect('/dashboard');
  }

  const { id } = await params;
  const lead = await getLeadById(id);

  if (!lead) notFound();

  // Role-based access control: Admin, Team Lead (team/unassigned), Executive (assigned owner)
  if (!canAccessLead(session, lead)) {
    redirect('/dashboard');
  }

  const canReassign = canReassignLead(session);

  return <LeadDetailClient lead={lead} session={session} canReassign={canReassign} />;
}
