import { describe, expect, test, beforeAll } from 'bun:test';
import { NextRequest } from 'next/server';
import { prisma } from '../lib/db';
import { signToken, hashPassword } from '../lib/auth';
import { GET as getTasksRoute, POST as createTasksRoute } from '../app/api/tasks/route';
import { PATCH as updateTaskRoute, DELETE as deleteTaskRoute } from '../app/api/tasks/[id]/route';

describe('ORVION Daily Task Assignment & Deadline Management (Admin & HR)', () => {
  let adminUser: { id: string; name: string; email: string; token: string };
  let hrUser: { id: string; name: string; email: string; token: string };
  let execUserA: { id: string; name: string; email: string; token: string };
  let execUserB: { id: string; name: string; email: string; token: string };

  beforeAll(async () => {
    const passwordHash = await hashPassword('Secret123');

    // Create Admin
    const admin = await prisma.user.create({
      data: {
        name: 'Task Admin User',
        email: `task.admin.${Date.now()}@orvion.com`,
        passwordHash,
        role: 'ADMIN',
        active: true,
      },
    });
    adminUser = {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      token: signToken({ id: admin.id, name: admin.name, email: admin.email, role: 'ADMIN' }),
    };

    // Create HR
    const hr = await prisma.user.create({
      data: {
        name: 'Task HR Manager',
        email: `task.hr.${Date.now()}@orvion.com`,
        passwordHash,
        role: 'HR',
        active: true,
      },
    });
    hrUser = {
      id: hr.id,
      name: hr.name,
      email: hr.email,
      token: signToken({ id: hr.id, name: hr.name, email: hr.email, role: 'HR' }),
    };

    // Create Executive A
    const execA = await prisma.user.create({
      data: {
        name: 'Task Executive Alpha',
        email: `exec.alpha.${Date.now()}@orvion.com`,
        passwordHash,
        role: 'EXECUTIVE',
        active: true,
      },
    });
    execUserA = {
      id: execA.id,
      name: execA.name,
      email: execA.email,
      token: signToken({ id: execA.id, name: execA.name, email: execA.email, role: 'EXECUTIVE' }),
    };

    // Create Executive B
    const execB = await prisma.user.create({
      data: {
        name: 'Task Executive Beta',
        email: `exec.beta.${Date.now()}@orvion.com`,
        passwordHash,
        role: 'EXECUTIVE',
        active: true,
      },
    });
    execUserB = {
      id: execB.id,
      name: execB.name,
      email: execB.email,
      token: signToken({ id: execB.id, name: execB.name, email: execB.email, role: 'EXECUTIVE' }),
    };
  });

  const getTodayStr = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  test('1. Security: Unauthorized and non-privileged users cannot assign tasks', async () => {
    // Unauthenticated
    const reqUnauth = new NextRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Unauthorized Task' }),
    });
    const resUnauth = await createTasksRoute(reqUnauth);
    expect(resUnauth.status).toBe(401);

    // Executive cannot assign tasks
    const reqExec = new NextRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${execUserA.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Executive Assigned Task' }),
    });
    const resExec = await createTasksRoute(reqExec);
    expect(resExec.status).toBe(403);
  });

  test('2. Admin Mass Broadcast: Assign daily task to ALL active executives', async () => {
    const todayStr = getTodayStr();
    const req = new NextRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminUser.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Complete 60 Outbound Verification Calls',
        description: 'Verify phone records and log feedback in calling center',
        priority: 'HIGH',
        target: 'ALL',
        dueDate: todayStr,
        dueTime: '23:59',
      }),
    });

    const res = await createTasksRoute(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.count).toBeGreaterThanOrEqual(2);

    // Verify task exists for Exec A
    const execATask = await prisma.executiveTask.findFirst({
      where: {
        assigneeId: execUserA.id,
        title: 'Complete 60 Outbound Verification Calls',
      },
    });
    expect(execATask).not.toBeNull();
    expect(execATask?.priority).toBe('HIGH');
    expect(execATask?.dueTime).toBe('23:59');
    expect(execATask?.status).toBe('PENDING');

    // Verify notification was sent to Exec A
    const notification = await prisma.notification.findFirst({
      where: {
        userId: execUserA.id,
        type: 'TASK_ASSIGNED',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(notification).not.toBeNull();
    expect(notification?.title).toContain('Daily Task Assigned');
  });

  test('3. HR Assignment: HR can assign task to a SPECIFIC executive', async () => {
    const todayStr = getTodayStr();
    const req = new NextRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${hrUser.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Submit Monthly Commission & Attendance Sign-off',
        description: 'Review your logged attendance hours and verify deductions',
        priority: 'NORMAL',
        target: 'SPECIFIC',
        assigneeId: execUserB.id,
        dueDate: todayStr,
        dueTime: '23:59',
      }),
    });

    const res = await createTasksRoute(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.task).not.toBeNull();
    expect(body.task.assigneeId).toBe(execUserB.id);
    expect(body.task.createdById).toBe(hrUser.id);
  });

  test('4. Executive Dashboard Query: Returns assigned daily tasks for the executive', async () => {
    const req = new NextRequest('http://localhost:3000/api/tasks', {
      method: 'GET',
      headers: { Authorization: `Bearer ${execUserB.token}` },
    });

    const res = await getTasksRoute(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tasks).toBeInstanceOf(Array);
    expect(body.tasks.length).toBeGreaterThanOrEqual(1);

    // Verify executive B cannot see executive A exclusive tasks
    const titles = body.tasks.map((t: any) => t.title);
    expect(titles).toContain('Submit Monthly Commission & Attendance Sign-off');
  });

  test('5. Executive Daily 1-Click Completion: Toggles status to COMPLETED with completedAt timestamp', async () => {
    // Find task for Exec B
    const task = await prisma.executiveTask.findFirst({
      where: {
        assigneeId: execUserB.id,
        status: 'PENDING',
      },
    });
    expect(task).not.toBeNull();

    const req = new NextRequest(`http://localhost:3000/api/tasks/${task!.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${execUserB.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'COMPLETED' }),
    });

    const res = await updateTaskRoute(req, { params: Promise.resolve({ id: task!.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.task.status).toBe('COMPLETED');
    expect(body.task.completedAt).not.toBeNull();

    // Verify database record
    const updatedInDb = await prisma.executiveTask.findUnique({ where: { id: task!.id } });
    expect(updatedInDb?.status).toBe('COMPLETED');
    expect(updatedInDb?.completedAt).not.toBeNull();
  });

  test('6. Overdue Evaluation: Tasks with past deadline are marked OVERDUE on query', async () => {
    // Create an artificial past task for Exec A
    const pastTask = await prisma.executiveTask.create({
      data: {
        title: 'Overdue Historic Verification',
        priority: 'HIGH',
        dueDate: '2025-01-01',
        dueTime: '09:00',
        status: 'PENDING',
        assigneeId: execUserA.id,
        createdById: adminUser.id,
      },
    });

    const req = new NextRequest('http://localhost:3000/api/tasks?all=true', {
      method: 'GET',
      headers: { Authorization: `Bearer ${execUserA.token}` },
    });

    const res = await getTasksRoute(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    const evaluatedTask = body.tasks.find((t: any) => t.id === pastTask.id);
    expect(evaluatedTask).toBeDefined();
    expect(evaluatedTask.status).toBe('OVERDUE');
  });

  test('7. Deletion: Admin or HR can cancel and delete an assigned task', async () => {
    const taskToDelete = await prisma.executiveTask.create({
      data: {
        title: 'Temporary Drill',
        dueDate: '2026-09-15',
        dueTime: '15:00',
        status: 'PENDING',
        assigneeId: execUserA.id,
        createdById: adminUser.id,
      },
    });

    const req = new NextRequest(`http://localhost:3000/api/tasks/${taskToDelete.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminUser.token}` },
    });

    const res = await deleteTaskRoute(req, { params: Promise.resolve({ id: taskToDelete.id }) });
    expect(res.status).toBe(200);

    const deleted = await prisma.executiveTask.findUnique({ where: { id: taskToDelete.id } });
    expect(deleted).toBeNull();
  });
});
