import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { processBulkCallingImport } from '@/services/import.service';

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const {
      rows,
      assignmentMode = 'UNASSIGNED',
      targetUserId,
      targetTeamId,
      defaultCallDate,
      defaultCallTime,
      campaignName,
    } = body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'Rows array is required and cannot be empty' }, { status: 400 });
    }

    if (rows.length > 10000) {
      return NextResponse.json({ error: 'Batch size exceeds maximum limit of 10,000 rows per upload' }, { status: 400 });
    }

    const result = await processBulkCallingImport({
      rows,
      assignmentMode,
      targetUserId,
      targetTeamId,
      defaultCallDate,
      defaultCallTime,
      campaignName,
      user: { id: session.id, name: session.name, role: session.role },
    });

    // Instant Next.js Cache Invalidation
    try {
      revalidatePath('/dashboard', 'layout');
    } catch {
      // safe fallback
    }

    return NextResponse.json(
      {
        success: true,
        message: `Queued ${result.scheduledCount} calls: ${result.createdCount} new leads created, ${result.updatedCount} existing leads scheduled, ${result.assignedCount} assigned.`,
        progress: {
          totalProcessed: result.totalRows,
          successfullyAssigned: result.assignedCount,
          duplicatesSkipped: result.totalRows - result.scheduledCount - result.errors.length,
          errors: result.errors.length,
        },
        result,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (error) {
    console.error('Bulk calling import error:', error);
    return NextResponse.json({ error: 'Failed to process bulk calling import' }, { status: 500 });
  }
}
