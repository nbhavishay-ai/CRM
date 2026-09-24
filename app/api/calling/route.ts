import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getCallingData } from '@/services/followup.service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role === 'HR') {
    return NextResponse.json({ error: 'HR personnel are strictly restricted from accessing customer calling data' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const ownerId = searchParams.get('ownerId') || undefined;
  const teamId = searchParams.get('teamId') || undefined;
  const search = searchParams.get('search') || undefined;
  const includeMatrix = searchParams.get('includeMatrix') !== 'false';

  try {
    const data = await getCallingData(session, { ownerId, teamId, search, includeMatrix });
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Calling data error:', error);
    return NextResponse.json({ error: 'Failed to fetch calling data' }, { status: 500 });
  }
}
