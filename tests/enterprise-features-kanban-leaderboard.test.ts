import { describe, expect, test, beforeAll } from 'bun:test';
import { prisma } from '../lib/db';
import { computeLeadScore, recalculateLeadScore } from '../services/scoring.service';

describe('ORVION Lead Scoring Engine & Temperature Index', () => {
  let testLead: any;

  beforeAll(async () => {
    testLead = await prisma.lead.create({
      data: {
        leadNumber: `ORV-SCORE-${Date.now().toString().slice(-4)}`,
        clientName: 'Score Test Client',
        phone: `+91 96${Date.now().toString().slice(-8)}`,
        currentStatus: 'NEW',
        currentCategory: 'ACTIVE',
        score: 30,
        temperature: 'COLD',
      },
    });
  });

  test('1. Compute Lead Score: High closure stage and fresh updates compute HOT temperature', () => {
    const hotResult = computeLeadScore({
      currentStatus: 'NEGOTIATION',
      lastUpdatedAt: new Date(),
      hasLongCall: true,
      updatesCount: 3,
    });
    expect(hotResult.score).toBeGreaterThanOrEqual(75);
    expect(hotResult.temperature).toBe('HOT');
    expect(hotResult.factors.some((f) => f.includes('Negotiation'))).toBe(true);
  });

  test('2. Compute Lead Score: Overdue actions trigger penalty and COLD temperature', () => {
    const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24); // 24h ago
    const overdueResult = computeLeadScore({
      currentStatus: 'INTERESTED',
      nextActionAt: pastDate,
      lastUpdatedAt: new Date(Date.now() - 1000 * 60 * 60 * 200), // >7 days ago
    });
    expect(overdueResult.temperature).toBe('COLD');
    expect(overdueResult.factors.some((f) => f.includes('Overdue'))).toBe(true);
  });

  test('3. Recalculate Lead Score: Updates database record with new score and temperature', async () => {
    const updatedLead = await recalculateLeadScore(testLead.id);
    expect(updatedLead).toBeDefined();
    expect(typeof updatedLead.score).toBe('number');
    expect(['HOT', 'WARM', 'COLD']).toContain(updatedLead.temperature);
  });
});
