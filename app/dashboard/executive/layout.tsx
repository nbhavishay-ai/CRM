import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

export default async function ExecutiveAreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session || session.role !== 'EXECUTIVE') {
    redirect('/dashboard');
  }

  return children;
}
