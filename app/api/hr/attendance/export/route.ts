import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getAttendanceExportData } from '@/services/hr.service';
import { generateCSV, ExportColumn } from '@/lib/export-utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.role !== 'HR' && session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden: HR or Admin access required' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);

  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const todayStr = now.toISOString().split('T')[0];

  const startDate = searchParams.get('startDate') || currentMonthStart;
  const endDate = searchParams.get('endDate') || todayStr;
  const format = searchParams.get('format') || 'json';
  const type = searchParams.get('type') || 'daily'; // 'daily' | 'summary'

  try {
    const data = await getAttendanceExportData(startDate, endDate);

    if (format === 'csv') {
      if (type === 'summary') {
        const columns: ExportColumn<typeof data.summaryRows[0]>[] = [
          { header: 'Employee Name', accessor: (r) => r.name },
          { header: 'Corporate Email', accessor: (r) => r.email },
          { header: 'Role', accessor: (r) => r.role },
          { header: 'Designation', accessor: (r) => r.designation },
          { header: 'Department', accessor: (r) => r.department },
          { header: 'Team', accessor: (r) => r.team },
          { header: 'Total Days In Range', accessor: (r) => r.totalDaysInRange },
          { header: 'Present Days', accessor: (r) => r.presentDays },
          { header: 'On-Field Days', accessor: (r) => r.onFieldDays },
          { header: 'Half Days', accessor: (r) => r.halfDays },
          { header: 'Approved Leave Days', accessor: (r) => r.leaveDays },
          { header: 'Absent Days', accessor: (r) => r.absentDays },
          { header: 'Not Logged Days', accessor: (r) => r.notLoggedDays },
          { header: 'Total Work Hours', accessor: (r) => r.totalWorkHours },
          { header: 'Attendance %', accessor: (r) => r.attendanceRate },
        ];

        const csvString = generateCSV(data.summaryRows, columns);
        return new NextResponse(csvString, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="attendance_monthly_summary_${startDate}_to_${endDate}.csv"`,
            'Cache-Control': 'no-store, no-cache, must-revalidate',
          },
        });
      } else {
        const columns: ExportColumn<typeof data.dailyRows[0]>[] = [
          { header: 'Date', accessor: (r) => r.date },
          { header: 'Employee Name', accessor: (r) => r.name },
          { header: 'Corporate Email', accessor: (r) => r.email },
          { header: 'Role', accessor: (r) => r.role },
          { header: 'Designation', accessor: (r) => r.designation },
          { header: 'Department', accessor: (r) => r.department },
          { header: 'Team', accessor: (r) => r.team },
          { header: 'Attendance Status', accessor: (r) => r.status },
          { header: 'Mark-In Time (IST)', accessor: (r) => r.clockIn },
          { header: 'Mark-Out Time (IST)', accessor: (r) => r.clockOut },
          { header: 'Total Hours', accessor: (r) => r.workHours },
          { header: 'Remarks / Notes', accessor: (r) => r.notes },
        ];

        const csvString = generateCSV(data.dailyRows, columns);
        return new NextResponse(csvString, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="attendance_daily_log_${startDate}_to_${endDate}.csv"`,
            'Cache-Control': 'no-store, no-cache, must-revalidate',
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      ...data,
    });
  } catch (error) {
    console.error('Attendance export error:', error);
    return NextResponse.json({ error: 'Failed to export attendance data' }, { status: 500 });
  }
}
