import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

export default async function TeamLeadAreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session || !['TEAM_LEAD', 'ADMIN'].includes(session.role)) {
    redirect('/dashboard');
  }

  return children;
}
