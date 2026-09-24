import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  bulkDeleteLeads,
  bulkReassignLeads,
  bulkUpdateStatusLeads,
} from '@/services/lead.service';

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.role === 'HR') {
    return NextResponse.json({ error: 'Forbidden: HR is restricted from lead operations' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { action, ids, newOwnerId, reason, status, category, remark } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No lead IDs provided' }, { status: 400 });
    }

    if (action === 'DELETE') {
      if (session.role !== 'ADMIN' && session.role !== 'TEAM_LEAD') {
        return NextResponse.json({ error: 'Forbidden: Admin access required to bulk delete' }, { status: 403 });
      }
      const result = await bulkDeleteLeads(ids, session);
      return NextResponse.json({ success: true, action: 'DELETE', ...result });
    }

    if (action === 'REASSIGN') {
      if (session.role !== 'ADMIN' && session.role !== 'TEAM_LEAD') {
        return NextResponse.json({ error: 'Forbidden: Reassignment requires Admin or Team Lead role' }, { status: 403 });
      }
      const result = await bulkReassignLeads({
        leadIds: ids,
        newOwnerId: newOwnerId || null,
        user: session,
        reason: reason || 'Bulk Reassignment',
      });
      return NextResponse.json({ success: true, action: 'REASSIGN', ...result });
    }

    if (action === 'STATUS_UPDATE' || action === 'CATEGORY_UPDATE') {
      const result = await bulkUpdateStatusLeads({
        leadIds: ids,
        status: status || 'NEW',
        category,
        remark: remark || `Bulk updated to status ${status}`,
        user: session,
      });
      return NextResponse.json({ success: true, action: 'STATUS_UPDATE', ...result });
    }

    return NextResponse.json({ error: `Unknown bulk action: ${action}` }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Bulk action failed';
    console.error('Bulk action error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
