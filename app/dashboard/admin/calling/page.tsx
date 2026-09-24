import { redirect } from 'next/navigation';

export default function RemovedCallingDashboardPage() {
  redirect('/dashboard/admin/dashboard');
}
