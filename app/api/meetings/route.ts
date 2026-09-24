import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createMeeting, completeMeeting, getMeetings } from '@/services/meeting.service';

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role === 'HR') {
    return NextResponse.json({ error: 'HR personnel are strictly restricted from customer meetings' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const timeframe = (searchParams.get('timeframe') as 'today' | 'week' | 'upcoming' | 'completed') || 'week';
  const executiveId = searchParams.get('executiveId') || undefined;
  const teamId = searchParams.get('teamId') || undefined;

  try {
    const meetings = await getMeetings({
      user: session,
      timeframe,
      executiveId,
      teamId,
    });
    return NextResponse.json({ meetings });
  } catch (error) {
    console.error('Fetch meetings error:', error);
    return NextResponse.json({ error: 'Failed to fetch meetings' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role === 'HR') {
    return NextResponse.json({ error: 'HR personnel are strictly restricted from customer meetings' }, { status: 403 });
  }

  try {
    const body = await req.json();
    if (!body.leadId || !body.date || !body.time || !body.meetingType) {
      return NextResponse.json({ error: 'Lead ID, date, time, and meeting type are required' }, { status: 400 });
    }

    const meeting = await createMeeting({
      leadId: body.leadId,
      date: body.date,
      time: body.time,
      meetingType: body.meetingType,
      location: body.location,
      notes: body.notes,
      reminder: body.reminder,
      user: session,
    });

    return NextResponse.json({ meeting }, { status: 201 });
  } catch (error) {
    console.error('Create meeting error:', error);
    return NextResponse.json({ error: 'Failed to schedule meeting' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role === 'HR') {
    return NextResponse.json({ error: 'HR personnel are strictly restricted from customer meetings' }, { status: 403 });
  }

  try {
    const body = await req.json();
    if (!body.meetingId || !body.outcome) {
      return NextResponse.json({ error: 'Meeting ID and outcome are required' }, { status: 400 });
    }

    const result = await completeMeeting({
      meetingId: body.meetingId,
      outcome: body.outcome,
      user: session,
      nextAction: body.nextAction,
      nextActionAt: body.nextActionAt,
    });

    return NextResponse.json({ success: true, meeting: result });
  } catch (error) {
    console.error('Complete meeting error:', error);
    return NextResponse.json({ error: 'Failed to complete meeting' }, { status: 500 });
  }
}
