import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { generateNextLeadNumber } from '@/lib/lead-number';
import { logAudit } from '@/services/audit.service';

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  const [recentLogs, totalSynced] = await Promise.all([
    prisma.syncLog.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.lead.count({ where: { lastSyncedAt: { not: null } } }),
  ]);

  const latestSync = recentLogs[0];

  return NextResponse.json({
    status: latestSync?.status === 'FAILED' ? 'ERROR' : latestSync ? 'HEALTHY' : 'IDLE',
    lastSyncedAt: latestSync?.createdAt || null,
    totalSynced,
    logs: recentLogs,
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  try {
    const { sourceIdentifier = 'GoogleSheets_Primary', rows = [] } = await req.json();

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'Rows array is required' }, { status: 400 });
    }

    let processed = 0;
    const errors: Array<{ row: number; error: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        if (!row.clientName || !row.phone) {
          errors.push({ row: i + 1, error: 'Missing clientName or phone' });
          continue;
        }

        // Check duplicate by phone or existing leadNumber
        const existing = await prisma.lead.findFirst({
          where: {
            OR: [
              { phone: row.phone },
              ...(row.leadNumber ? [{ leadNumber: row.leadNumber }] : []),
            ],
          },
        });

        if (existing) {
          // Reconcile/Update existing lead without overwriting remarks
          await prisma.lead.update({
            where: { id: existing.id },
            data: {
              sourceIdentifier,
              lastSyncedAt: new Date(),
              alternatePhone: row.alternatePhone || existing.alternatePhone,
              email: row.email || existing.email,
              company: row.company || existing.company,
              location: row.location || existing.location,
            },
          });
          processed++;
        } else {
          // Ingest new lead with permanent ORV number
          const leadNumber = row.leadNumber || (await generateNextLeadNumber());
          await prisma.lead.create({
            data: {
              leadNumber,
              clientName: row.clientName,
              phone: row.phone,
              alternatePhone: row.alternatePhone || null,
              email: row.email || null,
              company: row.company || null,
              location: row.location || null,
              source: row.source || 'Spreadsheet Import',
              notes: row.notes || null,
              currentStatus: 'NEW',
              currentCategory: 'ACTIVE',
              sourceIdentifier,
              lastSyncedAt: new Date(),
              isNewToMe: false,
            },
          });
          processed++;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown row error';
        errors.push({ row: i + 1, error: msg });
      }
    }

    const syncStatus = errors.length === 0 ? 'SUCCESS' : errors.length === rows.length ? 'FAILED' : 'PARTIAL';

    const log = await prisma.syncLog.create({
      data: {
        sourceIdentifier,
        status: syncStatus,
        recordsProcessed: processed,
        errors: errors.length > 0 ? JSON.stringify(errors) : null,
      },
    });

    await logAudit({
      actorId: session.id,
      action: 'SYNC_SPREADSHEET',
      entity: 'SYNC',
      entityId: log.id,
      metadata: { processed, errorsCount: errors.length, status: syncStatus },
    });

    return NextResponse.json({
      success: true,
      status: syncStatus,
      processed,
      errors,
    });
  } catch (error) {
    console.error('Spreadsheet sync error:', error);
    return NextResponse.json({ error: 'Failed to synchronize spreadsheet' }, { status: 500 });
  }
}
