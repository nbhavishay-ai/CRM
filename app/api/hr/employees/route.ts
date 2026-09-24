import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getEmployees, createEmployee, updateEmployee } from '@/services/hr.service';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session || (session.role !== 'HR' && session.role !== 'ADMIN')) {
    return NextResponse.json({ error: 'Forbidden: HR or Admin access required' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const department = searchParams.get('department') || undefined;
  const search = searchParams.get('search') || undefined;
  const activeOnly = searchParams.get('activeOnly') === 'true';

  try {
    const employees = await getEmployees({ department, search, activeOnly });
    return NextResponse.json(
      { employees },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  } catch (error) {
    console.error('Fetch employees error:', error);
    return NextResponse.json({ error: 'Failed to fetch employees' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session || (session.role !== 'HR' && session.role !== 'ADMIN')) {
    return NextResponse.json({ error: 'Forbidden: HR or Admin access required' }, { status: 403 });
  }

  try {
    const body = await req.json();

    if (body.action === 'UPDATE') {
      const { id } = body;
      if (!id) return NextResponse.json({ error: 'Employee ID is required' }, { status: 400 });
      const target = await prisma.user.findUnique({
        where: { id },
        select: { role: true },
      });
      if (!target) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
      if (session.role === 'HR' && (target.role === 'ADMIN' || target.role === 'HR')) {
        return NextResponse.json({ error: 'HR cannot modify Admin or HR accounts' }, { status: 403 });
      }
      const allowedFields = [
        'name',
        'phone',
        'designation',
        'department',
        'teamId',
        'baseSalary',
        'active',
        'routingAvailable',
        'emergencyContact',
      ] as const;
      const data = Object.fromEntries(
        allowedFields
          .filter((field) => Object.prototype.hasOwnProperty.call(body, field))
          .map((field) => [field, body[field]])
      );
      const updated = await updateEmployee(id, data, session.id);
      return NextResponse.json({ success: true, employee: updated });
    }

    if (!body.name || !body.email || !body.role) {
      return NextResponse.json({ error: 'Name, email, and role are required' }, { status: 400 });
    }

    if (session.role === 'HR' && body.role !== 'EXECUTIVE' && body.role !== 'TEAM_LEAD') {
      return NextResponse.json(
        { error: 'Forbidden: HR is only authorized to create Sales Executive or Team Lead accounts' },
        { status: 403 }
      );
    }

    const employee = await createEmployee({
      ...body,
      actorId: session.id,
    });

    return NextResponse.json({ success: true, employee }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to process employee request';
    console.error('Employee creation error:', msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
