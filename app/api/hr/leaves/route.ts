import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getLeaveRequests, submitLeaveRequest } from '@/services/hr.service';

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session || (session.role !== 'HR' && session.role !== 'ADMIN')) {
    return NextResponse.json({ error: 'Forbidden: HR or Admin access required' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || undefined;

  try {
    const leaves = await getLeaveRequests(status);
    return NextResponse.json({ leaves });
  } catch (error) {
    console.error('Fetch leaves error:', error);
    return NextResponse.json({ error: 'Failed to fetch leave requests' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();

    if (!body.leaveType || !body.startDate || !body.endDate || !body.reason) {
      return NextResponse.json({ error: 'All leave fields are required' }, { status: 400 });
    }

    const start = new Date(`${body.startDate}T00:00:00`);
    const end = new Date(`${body.endDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      return NextResponse.json({ error: 'A valid leave date range is required' }, { status: 400 });
    }
    const daysCount = body.leaveType === 'HALF_DAY'
      ? 0.5
      : Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;

    const leave = await submitLeaveRequest({
      userId: (session.role === 'HR' || session.role === 'ADMIN') && body.userId ? body.userId : session.id,
      leaveType: body.leaveType,
      startDate: body.startDate,
      endDate: body.endDate,
      daysCount,
      reason: body.reason,
    });

    return NextResponse.json({ success: true, leave }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to submit leave';
    console.error('Leave submit error:', msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
