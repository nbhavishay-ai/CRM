import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getTargetsAndCommissions, saveSalesTarget } from '@/services/hr.service';

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session || (session.role !== 'HR' && session.role !== 'ADMIN')) {
    return NextResponse.json({ error: 'Forbidden: HR or Admin access required' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const period = searchParams.get('period') || undefined;

  try {
    const data = await getTargetsAndCommissions(period);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Fetch payroll error:', error);
    return NextResponse.json({ error: 'Failed to fetch targets and payroll data' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session || (session.role !== 'HR' && session.role !== 'ADMIN')) {
    return NextResponse.json({ error: 'Forbidden: HR or Admin access required' }, { status: 403 });
  }

  try {
    const body = await req.json();

    if (!body.userId || !body.period) {
      return NextResponse.json({ error: 'userId and period are required' }, { status: 400 });
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(body.period)) {
      return NextResponse.json({ error: 'Period must use YYYY-MM format' }, { status: 400 });
    }
    const numericFields = ['targetCalls', 'targetMeetings', 'targetRevenue', 'commissionRate', 'bonus', 'deductions'];
    if (numericFields.some((field) => body[field] !== undefined && Number(body[field]) < 0)) {
      return NextResponse.json({ error: 'Payroll target values cannot be negative' }, { status: 400 });
    }

    const target = await saveSalesTarget({
      userId: body.userId,
      period: body.period,
      targetCalls: parseInt(body.targetCalls, 10) || 0,
      targetMeetings: parseInt(body.targetMeetings, 10) || 0,
      targetRevenue: parseFloat(body.targetRevenue) || 0,
      commissionRate: parseFloat(body.commissionRate) || 2.0,
      bonus: parseFloat(body.bonus) || 0,
      deductions: parseFloat(body.deductions) || 0,
    });

    return NextResponse.json({ success: true, target });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to save sales target';
    console.error('Save target error:', msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
