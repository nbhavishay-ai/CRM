import { redirect } from 'next/navigation';

export default function RemovedExecutiveCallingPage() {
  redirect('/dashboard/executive/today');
}
