import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkAndEscalateSlaBreaches } from '@/services/sla.service';

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session || (session.role !== 'ADMIN' && session.role !== 'TEAM_LEAD')) {
    return NextResponse.json({ error: 'Unauthorized: Admin or Team Lead required' }, { status: 403 });
  }

  try {
    const result = await checkAndEscalateSlaBreaches();
    return NextResponse.json(result);
  } catch (error) {
    console.error('SLA check error:', error);
    return NextResponse.json({ error: 'Failed to run SLA check' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session || (session.role !== 'ADMIN' && session.role !== 'TEAM_LEAD')) {
    return NextResponse.json({ error: 'Unauthorized: Admin or Team Lead required' }, { status: 403 });
  }

  try {
    const result = await checkAndEscalateSlaBreaches();
    return NextResponse.json(result);
  } catch (error) {
    console.error('SLA check error:', error);
    return NextResponse.json({ error: 'Failed to run SLA check' }, { status: 500 });
  }
}
