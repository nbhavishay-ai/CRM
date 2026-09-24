import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  getDailyAttendance,
  getMyTodayAttendance,
  recordClockInOut,
  setAttendanceStatus,
} from '@/services/hr.service';

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('mode');

  // Employee self-attendance check
  if (mode === 'me' || (session.role !== 'HR' && session.role !== 'ADMIN')) {
    try {
      const myRecord = await getMyTodayAttendance(session.id);
      return NextResponse.json({ attendance: myRecord });
    } catch (error) {
      console.error('Fetch my attendance error:', error);
      return NextResponse.json({ error: 'Failed to fetch personal attendance' }, { status: 500 });
    }
  }

  // HR / Admin full roster view
  const date = searchParams.get('date') || undefined;
  try {
    const data = await getDailyAttendance(date);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Fetch attendance error:', error);
    return NextResponse.json({ error: 'Failed to fetch attendance' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();

    // 1. Self Clock-in / Clock-out (Any active employee can clock in/out for themselves)
    if (body.action === 'CLOCK_IN' || body.action === 'CLOCK_OUT') {
      const targetUserId = (session.role === 'HR' || session.role === 'ADMIN') && body.userId ? body.userId : session.id;
      const record = await recordClockInOut(targetUserId, body.action, body.notes);
      return NextResponse.json({ success: true, record });
    }

    // 2. HR Manual status override
    if (session.role !== 'HR' && session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!body.userId || !body.date || !body.status) {
      return NextResponse.json({ error: 'userId, date, and status are required' }, { status: 400 });
    }

    const record = await setAttendanceStatus({
      userId: body.userId,
      date: body.date,
      status: body.status,
      notes: body.notes,
      actorId: session.id,
    });

    return NextResponse.json({ success: true, record });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to update attendance';
    console.error('Attendance update error:', msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
