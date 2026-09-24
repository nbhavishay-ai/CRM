import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { processBulkLeadsImport } from '@/services/import.service';

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { rows, assignmentMode = 'ROUND_ROBIN_TEAM', targetUserId, targetTeamId, duplicateStrategy = 'SKIP' } = body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'Rows array is required and cannot be empty' }, { status: 400 });
    }

    const result = await processBulkLeadsImport({
      rows,
      assignmentMode,
      targetUserId,
      targetTeamId,
      duplicateStrategy,
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
        message: `Processed ${result.totalRows} leads: ${result.createdCount} created, ${result.updatedCount} updated, ${result.skippedCount} skipped, ${result.assignedCount} assigned.`,
        progress: {
          totalProcessed: result.totalRows,
          successfullyAssigned: result.assignedCount,
          duplicatesSkipped: result.skippedCount,
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
    console.error('Bulk leads import error:', error);
    return NextResponse.json({ error: 'Failed to process bulk leads import' }, { status: 500 });
  }
}
