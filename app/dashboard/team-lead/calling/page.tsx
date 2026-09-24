import { redirect } from 'next/navigation';

export default function RemovedTeamLeadCallingPage() {
  redirect('/dashboard/team-lead/today');
}
