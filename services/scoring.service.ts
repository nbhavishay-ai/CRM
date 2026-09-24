import { prisma } from '@/lib/db';

export type LeadTemperature = 'HOT' | 'WARM' | 'COLD';

export interface ScoreCalculationResult {
  score: number;
  temperature: LeadTemperature;
  factors: string[];
}

export function computeLeadScore(lead: {
  currentStatus: string;
  currentCategory?: string;
  nextActionAt?: Date | string | null;
  lastUpdatedAt?: Date | string;
  createdAt?: Date | string;
  updatesCount?: number;
  meetingsCount?: number;
  callLogsCount?: number;
  hasLongCall?: boolean;
}): ScoreCalculationResult {
  let score = 30; // base score
  const factors: string[] = [];

  // 1. Stage baseline weight
  const status = lead.currentStatus?.toUpperCase() || 'NEW';
  switch (status) {
    case 'CLOSED_WON':
      score = 100;
      factors.push('Deal Closed Won (+100)');
      return { score: 100, temperature: 'HOT', factors };
    case 'NEGOTIATION':
      score = 85;
      factors.push('Advanced Negotiation Stage (+55)');
      break;
    case 'QUOTATION':
      score = 75;
      factors.push('Commercial Quotation Sent (+45)');
      break;
    case 'MEETING':
    case 'SITE_VISIT':
      score = 65;
      factors.push('Direct Meeting / Site Visit (+35)');
      break;
    case 'INTERESTED':
      score = 52;
      factors.push('Prospect Expressed Active Interest (+22)');
      break;
    case 'FOLLOW_UP':
    case 'CALL_BACK':
      score = 42;
      factors.push('Scheduled Follow-up in progress (+12)');
      break;
    case 'NEW':
      score = 30;
      factors.push('Newly Ingested Lead (Base 30)');
      break;
    case 'NOT_ANSWERING':
      score = 15;
      factors.push('Client Unresponsive / Not Answering (-15)');
      break;
    case 'NOT_INTERESTED':
    case 'CLOSED_LOST':
      score = 5;
      factors.push('Marked Lost / Not Interested (-25)');
      break;
    default:
      score = 30;
  }

  // 2. Recency of Engagement
  const now = new Date().getTime();
  const lastActive = lead.lastUpdatedAt ? new Date(lead.lastUpdatedAt).getTime() : now;
  const hoursSinceActive = (now - lastActive) / (1000 * 60 * 60);

  if (hoursSinceActive <= 24) {
    score += 15;
    factors.push('Engaged within last 24 hours (+15)');
  } else if (hoursSinceActive <= 48) {
    score += 8;
    factors.push('Engaged within last 48 hours (+8)');
  } else if (hoursSinceActive > 168) {
    // > 7 days untouched
    score -= 15;
    factors.push('Dormant: No touches for over 7 days (-15)');
  }

  // 3. Next Action / Overdue Penalty
  if (lead.nextActionAt) {
    const dueTime = new Date(lead.nextActionAt).getTime();
    if (dueTime < now && status !== 'CLOSED_WON' && status !== 'CLOSED_LOST') {
      score -= 20;
      factors.push('Overdue Next Action Penalty (-20)');
    } else if (dueTime >= now) {
      score += 10;
      factors.push('Actionable Next Step Scheduled (+10)');
    }
  }

  // 4. Meeting / Site Visit bonus
  if (lead.meetingsCount && lead.meetingsCount > 0) {
    score += 10;
    factors.push(`Conducted Meetings (${lead.meetingsCount}) (+10)`);
  }

  // 5. Calling Engagement depth
  if (lead.hasLongCall) {
    score += 10;
    factors.push('Meaningful Talk Time (>60s Connected Call) (+10)');
  }

  if (lead.updatesCount && lead.updatesCount >= 3) {
    score += 5;
    factors.push('Deep Activity History (3+ touchpoints) (+5)');
  }

  // Clamp 5 - 100
  const finalScore = Math.min(100, Math.max(5, Math.round(score)));

  let temperature: LeadTemperature = 'WARM';
  if (finalScore >= 75) {
    temperature = 'HOT';
  } else if (finalScore < 40) {
    temperature = 'COLD';
  }

  return {
    score: finalScore,
    temperature,
    factors,
  };
}

/**
 * Recalculates and persists lead score in DB
 */
export async function recalculateLeadScore(leadId: string): Promise<ScoreCalculationResult> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      _count: {
        select: {
          updates: true,
          meetings: true,
          callLogs: true,
        },
      },
      callLogs: {
        select: { durationSeconds: true },
      },
    },
  });

  if (!lead) {
    throw new Error(`Lead ${leadId} not found`);
  }

  const hasLongCall = lead.callLogs.some((c) => c.durationSeconds >= 60);

  const result = computeLeadScore({
    currentStatus: lead.currentStatus,
    currentCategory: lead.currentCategory,
    nextActionAt: lead.nextActionAt,
    lastUpdatedAt: lead.lastUpdatedAt,
    createdAt: lead.createdAt,
    updatesCount: lead._count.updates,
    meetingsCount: lead._count.meetings,
    callLogsCount: lead._count.callLogs,
    hasLongCall,
  });

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      score: result.score,
      temperature: result.temperature,
    },
  });

  return result;
}
