import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logAudit } from '@/services/audit.service';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
  }

  try {
    const task = await prisma.executiveTask.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, name: true, teamId: true } },
      },
    });

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Permission check
    let allowed = false;
    if (session.role === 'ADMIN' || session.role === 'HR') {
      allowed = true;
    } else if (session.role === 'EXECUTIVE' && task.assigneeId === session.id) {
      allowed = true;
    } else if (session.role === 'TEAM_LEAD' && session.teamId && task.assignee?.teamId === session.teamId) {
      allowed = true;
    }

    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden: You cannot modify this task' }, { status: 403 });
    }

    const body = await req.json();
    const { status, completed } = body;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};

    if (status === 'COMPLETED' || completed === true) {
      updateData.status = 'COMPLETED';
      updateData.completedAt = new Date();
    } else if (status === 'PENDING' || completed === false) {
      updateData.status = 'PENDING';
      updateData.completedAt = null;
    } else if (status === 'OVERDUE') {
      updateData.status = 'OVERDUE';
    }

    const updatedTask = await prisma.executiveTask.update({
      where: { id },
      data: updateData,
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, role: true } },
      },
    });

    await logAudit({
      actorId: session.id,
      action: updateData.status === 'COMPLETED' ? 'COMPLETE_TASK' : 'UPDATE_TASK_STATUS',
      entity: 'TASK',
      entityId: id,
      metadata: {
        newStatus: updatedTask.status,
        completedAt: updatedTask.completedAt,
      },
    });

    return NextResponse.json({ success: true, task: updatedTask });
  } catch (error) {
    console.error('Error updating task:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
  }

  try {
    const task = await prisma.executiveTask.findUnique({ where: { id } });
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (session.role !== 'ADMIN' && session.role !== 'HR' && task.createdById !== session.id) {
      return NextResponse.json({ error: 'Forbidden: Only Admin, HR, or creator can delete this task' }, { status: 403 });
    }

    await prisma.executiveTask.delete({ where: { id } });

    await logAudit({
      actorId: session.id,
      action: 'DELETE_TASK',
      entity: 'TASK',
      entityId: id,
    });

    return NextResponse.json({ success: true, message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting task:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
