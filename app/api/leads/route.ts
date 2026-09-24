import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createLead, getLeads, getAdminAttentionMetrics } from '@/services/lead.service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.role === 'HR') {
    return NextResponse.json({ error: 'HR personnel are strictly restricted from accessing customer leads' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);

  // Return real database attention metrics for Admin if requested
  if (searchParams.get('attention') === 'true') {
    if (session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const metrics = await getAdminAttentionMetrics();
    return NextResponse.json({ metrics });
  }

  const page = parseInt(searchParams.get('page') || '1', 10);
  const requestedPageSize = parseInt(searchParams.get('pageSize') || searchParams.get('limit') || '5000', 10);
  const pageSize = Number.isFinite(requestedPageSize) && requestedPageSize > 0 ? requestedPageSize : 5000;
  const search = searchParams.get('search') || undefined;
  const status = searchParams.get('status') || undefined;
  const category = searchParams.get('category') || undefined;
  const ownerIdParam = searchParams.get('ownerId');
  const ownerId = ownerIdParam === 'me' && (session.role === 'TEAM_LEAD' || session.role === 'EXECUTIVE')
    ? session.id
    : ownerIdParam === 'null'
    ? null
    : ownerIdParam || undefined;
  const teamId = searchParams.get('teamId') || undefined;
  const source = searchParams.get('source') || undefined;
  const isNewToMeParam = searchParams.get('isNewToMe');
  const isNewToMe = isNewToMeParam === 'true' ? true : isNewToMeParam === 'false' ? false : undefined;
  const overdueOnly = searchParams.get('overdue') === 'true';
  const dueTodayOnly = searchParams.get('dueToday') === 'true';
  const todayLeads = searchParams.get('today') === 'true';
  const withoutNextAction = searchParams.get('withoutNextAction') === 'true';
  const workspace = searchParams.get('workspace') === 'true';
  const excludeCallingData = searchParams.get('excludeCallingData') === 'true';

  if (ownerIdParam === 'me' && session.role !== 'TEAM_LEAD' && session.role !== 'EXECUTIVE') {
    return NextResponse.json({ error: 'The personal lead filter is restricted to Executives and Team Leads' }, { status: 403 });
  }

  try {
    const data = await getLeads({
      session,
      page,
      pageSize,
      search,
      status,
      category,
      ownerId,
      teamId,
      source,
      isNewToMe,
      overdueOnly,
      dueTodayOnly,
      todayLeads,
      withoutNextAction,
      workspace,
      excludeCallingData,
    });

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Fetch leads error:', error);
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only administrators have permission to create leads' }, { status: 403 });
  }

  try {
    const body = await req.json();

    if (!body.clientName || !body.phone) {
      return NextResponse.json({ error: 'Client name and phone are required' }, { status: 400 });
    }

    const lead = await createLead(body, session);

    return NextResponse.json({ lead }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to create lead';
    console.error('Create lead error:', msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden: Admin access required to bulk delete leads' }, { status: 403 });
  }

  try {
    const { ids } = await req.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No lead IDs provided for deletion' }, { status: 400 });
    }

    const { bulkDeleteLeads } = await import('@/services/lead.service');
    const result = await bulkDeleteLeads(ids, session);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to bulk delete leads';
    console.error('Bulk delete error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
