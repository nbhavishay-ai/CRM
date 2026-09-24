import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  getJobOpenings,
  createJobOpening,
  getCandidates,
  createCandidate,
  convertCandidateToEmployee,
} from '@/services/hr.service';

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session || (session.role !== 'HR' && session.role !== 'ADMIN')) {
    return NextResponse.json({ error: 'Forbidden: HR or Admin access required' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'candidates';
  const openingId = searchParams.get('openingId') || undefined;
  const stage = searchParams.get('stage') || undefined;

  try {
    if (type === 'openings') {
      const openings = await getJobOpenings();
      return NextResponse.json({ openings });
    } else {
      const candidates = await getCandidates(openingId, stage);
      const openings = await getJobOpenings();
      return NextResponse.json({ candidates, openings });
    }
  } catch (error) {
    console.error('Fetch recruitment error:', error);
    return NextResponse.json({ error: 'Failed to fetch recruitment data' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session || (session.role !== 'HR' && session.role !== 'ADMIN')) {
    return NextResponse.json({ error: 'Forbidden: HR or Admin access required' }, { status: 403 });
  }

  try {
    const body = await req.json();

    // 1. Convert Candidate to Employee
    if (body.action === 'CONVERT_TO_EMPLOYEE') {
      if (session.role === 'HR' && !['EXECUTIVE', 'TEAM_LEAD'].includes(body.role || 'EXECUTIVE')) {
        return NextResponse.json({ error: 'HR can only hire Executives or Team Leads' }, { status: 403 });
      }
      const employee = await convertCandidateToEmployee({
        candidateId: body.candidateId,
        role: body.role || 'EXECUTIVE',
        teamId: body.teamId,
        baseSalary: parseFloat(body.baseSalary) || 35000,
        designation: body.designation || 'Sales Executive',
        department: body.department || 'Sales',
        actorId: session.id,
      });
      return NextResponse.json({ success: true, employee }, { status: 201 });
    }

    // 2. Create Job Opening
    if (body.action === 'CREATE_OPENING') {
      if (!body.title || !body.experience) {
        return NextResponse.json({ error: 'Title and experience are required' }, { status: 400 });
      }
      const opening = await createJobOpening(body);
      return NextResponse.json({ success: true, opening }, { status: 201 });
    }

    // 3. Create Candidate
    if (!body.fullName || !body.email || !body.phone) {
      return NextResponse.json({ error: 'Candidate name, email, and phone are required' }, { status: 400 });
    }

    const candidate = await createCandidate(body);
    return NextResponse.json({ success: true, candidate }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to process recruitment action';
    console.error('Recruitment error:', msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
