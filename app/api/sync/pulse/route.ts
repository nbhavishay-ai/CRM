import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  try {
    const isExec = session.role === 'EXECUTIVE';

    const [latestLead, latestUpdate, latestUser, userLeadsCount, userCallingCount, userNewToMeCount, unreadNotifications, pendingTasks] =
      await Promise.all([
        prisma.lead.findFirst({
          select: { updatedAt: true, createdAt: true },
          orderBy: { updatedAt: 'desc' },
        }),
        prisma.leadUpdate.findFirst({
          select: { createdAt: true },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.user.findFirst({
          select: { updatedAt: true, createdAt: true },
          orderBy: { updatedAt: 'desc' },
        }),
        prisma.lead.count({
          where: isExec
            ? { currentOwnerId: session.id, currentCategory: 'ACTIVE' }
            : { currentCategory: 'ACTIVE' },
        }),
        prisma.lead.count({
          where: isExec
            ? {
                currentOwnerId: session.id,
                currentCategory: 'ACTIVE',
                OR: [
                  { nextActionAt: { gte: startOfToday, lte: endOfToday } },
                  { nextActionAt: null },
                  { isNewToMe: true },
                ],
              }
            : { currentCategory: 'ACTIVE' },
        }),
        isExec
          ? prisma.lead.count({
              where: {
                currentOwnerId: session.id,
                currentCategory: 'ACTIVE',
                isNewToMe: true,
              },
            })
          : Promise.resolve(0),
        prisma.notification.count({
          where: { userId: session.id, read: false },
        }),
        prisma.executiveTask.count({
          where: isExec
            ? { assigneeId: session.id, status: 'PENDING' }
            : { status: 'PENDING' },
        }),
      ]);

    const leadTime = latestLead?.updatedAt?.getTime() || latestLead?.createdAt?.getTime() || 0;
    const updateTime = latestUpdate?.createdAt?.getTime() || 0;
    const userTime = latestUser?.updatedAt?.getTime() || latestUser?.createdAt?.getTime() || 0;
    const latestTimestamp = Math.max(leadTime, updateTime, userTime);

    const pulseKey = `${latestTimestamp}:${userLeadsCount}:${userCallingCount}:${userNewToMeCount}:${unreadNotifications}:${pendingTasks}`;

    return NextResponse.json(
      {
        pulseKey,
        latestTimestamp,
        myLeadsCount: userLeadsCount,
        myCallingCount: userCallingCount,
        myNewToMeCount: userNewToMeCount,
        unreadNotifications,
        pendingTasks,
        serverTime: Date.now(),
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (error) {
    console.error('Real-time sync pulse error:', error);
    return NextResponse.json({ error: 'Pulse check failed' }, { status: 500 });
  }
}
