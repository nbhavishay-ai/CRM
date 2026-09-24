import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export interface SearchResultItem {
  id: string;
  type: 'lead' | 'user' | 'team' | 'meeting' | 'candidate';
  title: string;
  subtitle: string;
  badge?: string;
  badgeColor?: string;
  url: string;
  metadata?: Record<string, any>;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q')?.trim() || '';
    const typeFilter = searchParams.get('type') || 'all'; // all, leads, users, teams, meetings, candidates
    const requestedLimit = parseInt(searchParams.get('limit') || '200', 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 200) : 200;

    if (!query || query.length < 1) {
      return NextResponse.json({ results: [] });
    }

    const results: SearchResultItem[] = [];

    // 1. Search Leads (Accessible by ADMIN, TEAM_LEAD, EXECUTIVE)
    if (
      (typeFilter === 'all' || typeFilter === 'leads') &&
      session.role !== 'HR'
    ) {
      const leadWhere: any = {
        OR: [
          { clientName: { contains: query } },
          { phone: { contains: query } },
          { alternatePhone: { contains: query } },
          { email: { contains: query } },
          { leadNumber: { contains: query } },
          { company: { contains: query } },
          { location: { contains: query } },
        ],
      };

      // RBAC: Executive only searches their own leads
      if (session.role === 'EXECUTIVE') {
        leadWhere.currentOwnerId = session.id;
      } else if (session.role === 'TEAM_LEAD') {
        const teamLead = await prisma.user.findUnique({
          where: { id: session.id },
          select: { teamId: true },
        });
        const teamId = teamLead?.teamId || session.teamId;
        leadWhere.AND = [
          {
            OR: [
              { currentOwnerId: null },
              ...(teamId ? [{ currentOwner: { teamId } }] : []),
            ],
          },
        ];
      }

      const leads = await prisma.lead.findMany({
        where: leadWhere,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          currentOwner: { select: { id: true, name: true } },
        },
      });

      for (const lead of leads) {
        results.push({
          id: lead.id,
          type: 'lead',
          title: lead.clientName || 'Unnamed Lead',
          subtitle: `${lead.leadNumber} • ${lead.phone}${lead.currentOwner ? ` • ${lead.currentOwner.name}` : ' • Unassigned'}`,
          badge: lead.currentStatus.replace(/_/g, ' '),
          badgeColor:
            lead.currentCategory === 'ACTIVE'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : lead.currentCategory === 'NOT_ANSWERING'
              ? 'bg-amber-50 text-amber-700 border-amber-200'
              : 'bg-zinc-100 text-zinc-700 border-zinc-200',
          url:
            session.role === 'ADMIN'
              ? `/dashboard/leads/${lead.id}`
              : session.role === 'TEAM_LEAD'
              ? `/dashboard/leads/${lead.id}`
              : `/dashboard/executive/workspace?leadId=${lead.id}`,
          metadata: {
            phone: lead.phone,
            status: lead.currentStatus,
            score: lead.score,
            temperature: lead.temperature,
          },
        });
      }
    }

    // 2. Search Staff / Users (Accessible by ADMIN, HR, TEAM_LEAD)
    if (
      (typeFilter === 'all' || typeFilter === 'users') &&
      session.role !== 'EXECUTIVE'
    ) {
      const userWhere: any = {
        OR: [
          { name: { contains: query } },
          { email: { contains: query } },
          { designation: { contains: query } },
          { phone: { contains: query } },
        ],
      };
      if (session.role === 'TEAM_LEAD') {
        const teamLead = await prisma.user.findUnique({
          where: { id: session.id },
          select: { teamId: true },
        });
        userWhere.teamId = teamLead?.teamId || session.teamId || '__no_team__';
      }

      const users = await prisma.user.findMany({
        where: userWhere,
        take: 8,
        include: {
          team: { select: { id: true, name: true } },
        },
      });

      for (const u of users) {
        results.push({
          id: u.id,
          type: 'user',
          title: u.name,
          subtitle: `${u.designation || u.role.replace(/_/g, ' ')} • ${u.email}${u.team ? ` • ${u.team.name}` : ''}`,
          badge: u.role,
          badgeColor:
            u.role === 'ADMIN'
              ? 'bg-purple-50 text-purple-700 border-purple-200'
              : u.role === 'TEAM_LEAD'
              ? 'bg-blue-50 text-blue-700 border-blue-200'
              : u.role === 'HR'
              ? 'bg-rose-50 text-rose-700 border-rose-200'
              : 'bg-zinc-100 text-zinc-700 border-zinc-200',
          url:
            session.role === 'ADMIN'
              ? `/dashboard/admin/users`
              : session.role === 'HR'
              ? `/dashboard/hr/employees`
              : `/dashboard/team-lead/dashboard`,
          metadata: {
            role: u.role,
            email: u.email,
            active: u.active,
          },
        });
      }
    }

    // 3. Search Teams (Accessible by ADMIN, TEAM_LEAD)
    if (
      (typeFilter === 'all' || typeFilter === 'teams') &&
      (session.role === 'ADMIN' || session.role === 'TEAM_LEAD')
    ) {
      const teamWhere: any = {
        OR: [
          { name: { contains: query } },
          { description: { contains: query } },
        ],
      };
      if (session.role === 'TEAM_LEAD') {
        const teamLead = await prisma.user.findUnique({
          where: { id: session.id },
          select: { teamId: true },
        });
        teamWhere.id = teamLead?.teamId || session.teamId || '__no_team__';
      }

      const teams = await prisma.team.findMany({
        where: teamWhere,
        take: 5,
        include: {
          members: { select: { id: true, name: true, role: true } },
        },
      });

      for (const t of teams) {
        const lead = t.members.find((m) => m.role === 'TEAM_LEAD');
        results.push({
          id: t.id,
          type: 'team',
          title: t.name,
          subtitle: `${t.members.length} Members${lead ? ` • Lead: ${lead.name}` : ''}`,
          badge: 'TEAM',
          badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
          url:
            session.role === 'ADMIN'
              ? `/dashboard/admin/teams`
              : `/dashboard/team-lead/dashboard`,
        });
      }
    }

    // 4. Search Meetings (Accessible by ADMIN, TEAM_LEAD, EXECUTIVE)
    if (
      (typeFilter === 'all' || typeFilter === 'meetings') &&
      session.role !== 'HR'
    ) {
      const meetingWhere: any = {
        OR: [
          { location: { contains: query } },
          { notes: { contains: query } },
          { lead: { clientName: { contains: query } } },
          { lead: { phone: { contains: query } } },
        ],
      };

      if (session.role === 'EXECUTIVE') {
        meetingWhere.createdById = session.id;
      } else if (session.role === 'TEAM_LEAD') {
        const teamLead = await prisma.user.findUnique({
          where: { id: session.id },
          select: { teamId: true },
        });
        const teamId = teamLead?.teamId || session.teamId;
        meetingWhere.createdBy = teamId ? { teamId } : { id: '__no_team__' };
      }

      const meetings = await prisma.meeting.findMany({
        where: meetingWhere,
        take: 6,
        orderBy: { scheduledAt: 'desc' },
        include: {
          lead: { select: { id: true, clientName: true, phone: true } },
          createdBy: { select: { id: true, name: true } },
        },
      });

      for (const m of meetings) {
        results.push({
          id: m.id,
          type: 'meeting',
          title: `${m.meetingType} - ${m.lead.clientName}`,
          subtitle: `${m.date} at ${m.time}${m.location ? ` • ${m.location}` : ''} • By ${m.createdBy.name}`,
          badge: m.status,
          badgeColor:
            m.status === 'UPCOMING'
              ? 'bg-blue-50 text-blue-700 border-blue-200'
              : m.status === 'COMPLETED'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-zinc-100 text-zinc-700 border-zinc-200',
          url: `/dashboard/meetings`,
          metadata: {
            date: m.date,
            time: m.time,
            leadId: m.lead.id,
          },
        });
      }
    }

    // 5. Search Candidates (Accessible by HR, ADMIN)
    if (
      (typeFilter === 'all' || typeFilter === 'candidates') &&
      (session.role === 'HR' || session.role === 'ADMIN')
    ) {
      const candidates = await prisma.candidate.findMany({
        where: {
          OR: [
            { fullName: { contains: query } },
            { email: { contains: query } },
            { phone: { contains: query } },
            { currentCompany: { contains: query } },
          ],
        },
        take: 6,
        orderBy: { createdAt: 'desc' },
        include: {
          jobOpening: { select: { id: true, title: true } },
        },
      });

      for (const c of candidates) {
        results.push({
          id: c.id,
          type: 'candidate',
          title: c.fullName,
          subtitle: `${c.phone} • ${c.email}${c.jobOpening ? ` • Role: ${c.jobOpening.title}` : ''}`,
          badge: c.stage.replace(/_/g, ' '),
          badgeColor:
            c.stage === 'HIRED'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : c.stage === 'REJECTED'
              ? 'bg-rose-50 text-rose-700 border-rose-200'
              : 'bg-amber-50 text-amber-700 border-amber-200',
          url: `/dashboard/hr/recruitment`,
          metadata: {
            phone: c.phone,
            stage: c.stage,
            experience: c.experienceYears,
          },
        });
      }
    }

    return NextResponse.json({
      results: results.slice(0, limit),
      totalCount: results.length,
    });
  } catch (error: any) {
    console.error('Search API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
