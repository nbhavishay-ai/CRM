import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

export default async function HrAreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session || session.role !== 'HR') {
    redirect('/dashboard');
  }

  return children;
}
