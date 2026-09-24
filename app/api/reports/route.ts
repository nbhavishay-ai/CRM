import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getPerformanceReport } from '@/services/report.service';

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role === 'HR') {
    return NextResponse.json({ error: 'Forbidden: HR role is restricted from accessing customer conversion metrics' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const timeframe = (searchParams.get('timeframe') as 'weekly' | 'monthly' | 'custom') || 'weekly';
  const startDate = searchParams.get('startDate') || undefined;
  const endDate = searchParams.get('endDate') || undefined;
  const teamId = searchParams.get('teamId') || undefined;
  const executiveId = searchParams.get('executiveId') || undefined;

  try {
    const report = await getPerformanceReport({
      user: session,
      timeframe,
      startDate,
      endDate,
      teamId,
      executiveId,
    });
    return NextResponse.json({ report });
  } catch (error) {
    console.error('Report error:', error);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}
