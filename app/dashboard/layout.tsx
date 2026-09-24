import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { DashboardShell } from './DashboardShell';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  return <DashboardShell user={session}>{children}</DashboardShell>;
}
