import { prisma } from './db';

/**
 * Returns the highest numeric sequence number found across all existing ORV-XXXXXX leads.
 */
export async function getMaxLeadSequence(): Promise<number> {
  const leads = await prisma.lead.findMany({
    where: { leadNumber: { startsWith: 'ORV-' } },
    select: { leadNumber: true },
    orderBy: { leadNumber: 'desc' },
    take: 100,
  });

  let maxSeq = 0;
  for (const l of leads) {
    const parts = l.leadNumber.split('-');
    if (parts.length >= 2) {
      const num = parseInt(parts[1], 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  }

  return maxSeq;
}

/**
 * Generates the next sequential lead number in the permanent format ORV-000001.
 * Ensures that lead IDs are monotonically increasing, permanent, and unique.
 */
export async function generateNextLeadNumber(): Promise<string> {
  const maxSeq = await getMaxLeadSequence();
  const nextSeq = maxSeq + 1;
  return `ORV-${nextSeq.toString().padStart(6, '0')}`;
}

