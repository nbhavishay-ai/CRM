import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canAssignExecutiveTasks } from '@/lib/permissions';
import { logAudit } from '@/services/audit.service';

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get('date');
  const allParam = searchParams.get('all') === 'true';
  const statusParam = searchParams.get('status');
  const assigneeIdParam = searchParams.get('assigneeId');

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};

  if (session.role === 'EXECUTIVE') {
    where.assigneeId = session.id;
    if (!allParam) {
      where.dueDate = dateParam || todayStr;
    }
  } else if (session.role === 'TEAM_LEAD') {
    if (session.teamId) {
      where.assignee = { teamId: session.teamId };
    } else {
      where.assigneeId = session.id;
    }
    if (!allParam && (dateParam || !allParam)) {
      where.dueDate = dateParam || todayStr;
    }
  } else if (session.role === 'ADMIN' || session.role === 'HR') {
    if (assigneeIdParam) {
      where.assigneeId = assigneeIdParam;
    }
    if (dateParam) {
      where.dueDate = dateParam;
    } else if (!allParam) {
      where.dueDate = todayStr;
    }
  }

  if (statusParam) {
    where.status = statusParam;
  }

  // Fetch tasks
  let tasks = await prisma.executiveTask.findMany({
    where,
    include: {
      assignee: {
        select: {
          id: true,
          name: true,
          email: true,
          designation: true,
          role: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
    orderBy: [
      { priority: 'desc' }, // HIGH first
      { dueTime: 'asc' },
      { createdAt: 'desc' },
    ],
  });

  // Evaluate and sync overdue tasks:
  // If task is PENDING and due date < today OR (due date === today && due time < currentTime), mark OVERDUE
  const overdueTaskIds: string[] = [];
  tasks = tasks.map((task) => {
    if (task.status === 'PENDING') {
      const isPastDate = task.dueDate < todayStr;
      const isPastTimeToday = task.dueDate === todayStr && task.dueTime < currentTimeStr;
      if (isPastDate || isPastTimeToday) {
        overdueTaskIds.push(task.id);
        return { ...task, status: 'OVERDUE' };
      }
    }
    return task;
  });

  if (overdueTaskIds.length > 0) {
    await prisma.executiveTask.updateMany({
      where: { id: { in: overdueTaskIds } },
      data: { status: 'OVERDUE' },
    });
  }

  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === 'COMPLETED').length;
  const overdue = tasks.filter((t) => t.status === 'OVERDUE').length;
  const pending = tasks.filter((t) => t.status === 'PENDING').length;

  return NextResponse.json({
    tasks,
    stats: {
      total,
      completed,
      overdue,
      pending,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canAssignExecutiveTasks(session)) {
    return NextResponse.json(
      { error: 'Forbidden: Only Admin and HR can assign tasks to executives' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { title, description, priority, target, assigneeId, dueDate, dueTime } = body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'Task title is required' }, { status: 400 });
    }

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const targetDueDate = dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : todayStr;
    const targetDueTime = dueTime && /^\d{2}:\d{2}$/.test(dueTime) ? dueTime : '18:00';
    const taskPriority = ['HIGH', 'NORMAL', 'LOW'].includes(priority) ? priority : 'NORMAL';

    const creatorLabel = session.role === 'HR' ? 'HR Department' : 'Administration';

    if (target === 'ALL') {
      // Find all active executives
      const executives = await prisma.user.findMany({
        where: {
          role: 'EXECUTIVE',
          active: true,
        },
        select: { id: true, name: true, email: true },
      });

      if (executives.length === 0) {
        return NextResponse.json({ error: 'No active executives found to assign task' }, { status: 400 });
      }

      // Batch create tasks & notifications
      const createdTasks = await prisma.$transaction(async (tx) => {
        const tasks = [];
        for (const exec of executives) {
          const task = await tx.executiveTask.create({
            data: {
              title: title.trim(),
              description: description ? description.trim() : null,
              priority: taskPriority,
              dueDate: targetDueDate,
              dueTime: targetDueTime,
              status: 'PENDING',
              assigneeId: exec.id,
              createdById: session.id,
            },
          });
          tasks.push(task);

          await tx.notification.create({
            data: {
              userId: exec.id,
              type: 'TASK_ASSIGNED',
              title: `Daily Task Assigned: ${title.trim()}`,
              message: `${session.name} (${creatorLabel}) assigned a task due on ${targetDueDate} by ${targetDueTime}. Priority: ${taskPriority}.`,
              link: '/dashboard/executive/dashboard',
            },
          });
        }
        return tasks;
      });

      await logAudit({
        actorId: session.id,
        action: 'ASSIGN_TASKS_BROADCAST',
        entity: 'TASK',
        metadata: {
          title: title.trim(),
          priority: taskPriority,
          targetDueDate,
          targetDueTime,
          executivesCount: executives.length,
        },
      });

      return NextResponse.json({
        success: true,
        count: createdTasks.length,
        message: `Task successfully assigned to all ${createdTasks.length} active executives.`,
      });
    } else {
      // Specific executive assignment
      if (!assigneeId) {
        return NextResponse.json(
          { error: 'Assignee executive ID is required for individual assignment' },
          { status: 400 }
        );
      }

      const executive = await prisma.user.findFirst({
        where: {
          id: assigneeId,
          role: 'EXECUTIVE',
          active: true,
        },
      });

      if (!executive) {
        return NextResponse.json(
          { error: 'Specified user was not found or is not an active executive' },
          { status: 404 }
        );
      }

      const task = await prisma.$transaction(async (tx) => {
        const createdTask = await tx.executiveTask.create({
          data: {
            title: title.trim(),
            description: description ? description.trim() : null,
            priority: taskPriority,
            dueDate: targetDueDate,
            dueTime: targetDueTime,
            status: 'PENDING',
            assigneeId: executive.id,
            createdById: session.id,
          },
          include: {
            assignee: { select: { id: true, name: true, email: true } },
            createdBy: { select: { id: true, name: true, role: true } },
          },
        });

        await tx.notification.create({
          data: {
            userId: executive.id,
            type: 'TASK_ASSIGNED',
            title: `Daily Task Assigned: ${title.trim()}`,
            message: `${session.name} (${creatorLabel}) assigned you a task due on ${targetDueDate} by ${targetDueTime}. Priority: ${taskPriority}.`,
            link: '/dashboard/executive/dashboard',
          },
        });

        return createdTask;
      });

      await logAudit({
        actorId: session.id,
        action: 'ASSIGN_TASK_SPECIFIC',
        entity: 'TASK',
        entityId: task.id,
        metadata: {
          title: title.trim(),
          priority: taskPriority,
          targetDueDate,
          targetDueTime,
          assigneeName: executive.name,
        },
      });

      return NextResponse.json({
        success: true,
        task,
        message: `Task successfully assigned to ${executive.name}.`,
      });
    }
  } catch (error) {
    console.error('Error creating task:', error);
    return NextResponse.json({ error: 'Internal server error while creating task' }, { status: 500 });
  }
}
