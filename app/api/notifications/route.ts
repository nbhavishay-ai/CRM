import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearAllNotifications,
} from '@/services/notification.service';
import { syncUserFollowupAlerts } from '@/services/followup.service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await syncUserFollowupAlerts(session.id);

  const notifications = await getUserNotifications(session.id, 500);
  return NextResponse.json(
    { notifications },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}

export async function PATCH(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, all } = await req.json();

  if (all) {
    await markAllNotificationsRead(session.id);
    return NextResponse.json({ success: true });
  }

  if (id) {
    await markNotificationRead(id, session.id);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, all } = await req.json().catch(() => ({}));

  if (all) {
    await clearAllNotifications(session.id);
    return NextResponse.json({ success: true });
  }

  if (id) {
    await deleteNotification(id, session.id);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
}

