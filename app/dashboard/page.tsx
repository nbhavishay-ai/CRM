import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

export default async function DashboardRootPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  if (session.role === 'ADMIN') {
    redirect('/dashboard/admin/dashboard');
  } else if (session.role === 'TEAM_LEAD') {
    redirect('/dashboard/team-lead/dashboard');
  } else if (session.role === 'HR') {
    redirect('/dashboard/hr/dashboard');
  } else {
    redirect('/dashboard/executive/dashboard');
  }
}
