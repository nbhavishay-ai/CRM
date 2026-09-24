import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { logAudit } from '@/services/audit.service';
import { createNotification } from '@/services/notification.service';
import { UserRole } from '@/types';

async function notifyLeaveApprovers(title: string, message: string, link: string) {
  const approvers = await prisma.user.findMany({
    where: { role: { in: ['HR', 'ADMIN'] }, active: true },
    select: { id: true },
  });
  await Promise.all(
    approvers.map((approver) =>
      createNotification({ userId: approver.id, type: 'SYSTEM', title, message, link })
    )
  );
}

// ==========================================
// 1. EMPLOYEE & STAFF DIRECTORY
// ==========================================

export interface EmployeeListItem {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  designation?: string | null;
  department?: string | null;
  dateOfJoining?: Date | null;
  baseSalary?: number | null;
  emergencyContact?: string | null;
  active: boolean;
  routingAvailable: boolean;
  team?: { id: string; name: string } | null;
  todayAttendance?: {
    status: string;
    clockIn?: Date | null;
    clockOut?: Date | null;
  } | null;
}

export async function getEmployees(params?: {
  department?: string;
  search?: string;
  activeOnly?: boolean;
}): Promise<EmployeeListItem[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    role: { not: 'ADMIN' },
  };
  if (params?.activeOnly) where.active = true;
  if (params?.department) where.department = params.department;
  if (params?.search) {
    where.AND = [
      { role: { not: 'ADMIN' } },
      {
        OR: [
          { name: { contains: params.search } },
          { email: { contains: params.search } },
          { designation: { contains: params.search } },
        ],
      },
    ];
  }

  const todayStr = new Date().toISOString().split('T')[0];

  const users = await prisma.user.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      team: { select: { id: true, name: true } },
      attendances: {
        where: { date: todayStr },
        take: 1,
      },
    },
  });

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    designation: u.designation,
    department: u.department,
    dateOfJoining: u.dateOfJoining,
    baseSalary: u.baseSalary,
    emergencyContact: u.emergencyContact,
    active: u.active,
    routingAvailable: u.routingAvailable,
    team: u.team,
    todayAttendance: u.attendances[0]
      ? {
          status: u.attendances[0].status,
          clockIn: u.attendances[0].clockIn,
          clockOut: u.attendances[0].clockOut,
        }
      : null,
  }));
}

export async function createEmployee(data: {
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  phone?: string;
  designation?: string;
  department?: string;
  teamId?: string;
  baseSalary?: number;
  dateOfJoining?: string;
  emergencyContact?: string;
  actorId: string;
}) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new Error(`User with email ${data.email} already exists`);

  const passwordHash = await hashPassword(data.password || 'Password@123');

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash,
      role: data.role,
      phone: data.phone || null,
      designation: data.designation || null,
      department: data.department || (data.role === 'EXECUTIVE' ? 'Sales' : data.role === 'HR' ? 'Human Resources' : 'Management'),
      teamId: data.teamId || null,
      baseSalary: data.baseSalary || 0,
      dateOfJoining: data.dateOfJoining ? new Date(data.dateOfJoining) : new Date(),
      emergencyContact: data.emergencyContact || null,
      active: true,
      routingAvailable: true,
    },
  });

  await logAudit({
    actorId: data.actorId,
    action: 'CREATE_EMPLOYEE',
    entity: 'USER',
    entityId: user.id,
    metadata: { name: user.name, role: user.role, email: user.email },
  });

  return user;
}

export async function updateEmployee(
  id: string,
  data: Partial<{
    name: string;
    phone: string;
    designation: string;
    department: string;
    teamId: string | null;
    baseSalary: number;
    active: boolean;
    routingAvailable: boolean;
    emergencyContact: string;
  }>,
  actorId: string
) {
  const target = await prisma.user.findUnique({ where: { id } });
  if (target?.role === 'ADMIN') {
    throw new Error('Forbidden: Administrator accounts cannot be modified by HR');
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
  });

  await logAudit({
    actorId,
    action: 'UPDATE_EMPLOYEE',
    entity: 'USER',
    entityId: id,
    metadata: data,
  });

  return updated;
}

// ==========================================
// 2. ATTENDANCE & SHIFTS
// ==========================================

export async function getDailyAttendance(dateString?: string) {
  const now = new Date();
  const todayStr =
    now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) ||
    now.toISOString().split('T')[0];
  const date = dateString || todayStr;

  // Determine if shift has ended for this date (past date OR today >= 18:30 IST)
  let isPastShiftEnd = date < todayStr;
  if (date === todayStr) {
    try {
      const timeStr = now.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
      });
      const [h, m] = timeStr.split(':').map(Number);
      if (h > 18 || (h === 18 && m >= 30)) {
        isPastShiftEnd = true;
      }
    } catch {
      // fallback
    }
  }

  const activeUsers = await prisma.user.findMany({
    where: { active: true, role: { not: 'ADMIN' } },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      designation: true,
      department: true,
      routingAvailable: true,
      team: { select: { name: true } },
    },
    orderBy: { name: 'asc' },
  });

  let attendanceRecords = await prisma.attendance.findMany({
    where: { date },
  });

  // Auto Mark-Out uncompleted records if shift has ended
  if (isPastShiftEnd) {
    const shiftEnd = getShiftEndDateTime(date);
    const unclocked = attendanceRecords.filter((r) => r.clockIn && !r.clockOut);
    if (unclocked.length > 0) {
      for (const rec of unclocked) {
        const diffMs = Math.max(0, shiftEnd.getTime() - new Date(rec.clockIn!).getTime());
        const workHours = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));
        await prisma.attendance.update({
          where: { id: rec.id },
          data: {
            clockOut: shiftEnd,
            workHours,
            notes: rec.notes
              ? `${rec.notes} (Auto Mark-out at 6:30 PM)`
              : 'Auto Mark-out at 6:30 PM (Shift End)',
          },
        });
        await prisma.user.update({
          where: { id: rec.userId },
          data: { routingAvailable: false },
        }).catch(() => {});
      }
      attendanceRecords = await prisma.attendance.findMany({
        where: { date },
      });
    }
  }

  const attendanceMap = new Map(attendanceRecords.map((a) => [a.userId, a]));

  const roster = activeUsers.map((u) => {
    const record = attendanceMap.get(u.id);
    return {
      userId: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      designation: u.designation,
      department: u.department,
      teamName: u.team?.name,
      routingAvailable: u.routingAvailable,
      attendanceId: record?.id || null,
      date,
      status: record?.status || 'NOT_LOGGED',
      clockIn: record?.clockIn || null,
      clockOut: record?.clockOut || null,
      workHours: record?.workHours || null,
      notes: record?.notes || null,
    };
  });

  return {
    date,
    total: roster.length,
    present: roster.filter((r) => r.status === 'PRESENT').length,
    absent: roster.filter((r) => r.status === 'ABSENT').length,
    onLeave: roster.filter((r) => r.status === 'ON_LEAVE').length,
    halfDay: roster.filter((r) => r.status === 'HALF_DAY').length,
    onField: roster.filter((r) => r.status === 'ON_FIELD').length,
    notLogged: roster.filter((r) => r.status === 'NOT_LOGGED').length,
    roster,
  };
}

export interface AttendanceDailyExportRow {
  date: string;
  name: string;
  email: string;
  role: string;
  designation: string;
  department: string;
  team: string;
  status: string;
  clockIn: string;
  clockOut: string;
  workHours: number;
  notes: string;
}

export interface AttendanceSummaryExportRow {
  name: string;
  email: string;
  role: string;
  designation: string;
  department: string;
  team: string;
  totalDaysInRange: number;
  presentDays: number;
  halfDays: number;
  onFieldDays: number;
  leaveDays: number;
  absentDays: number;
  notLoggedDays: number;
  totalWorkHours: number;
  attendanceRate: string;
}

export async function getAttendanceExportData(startDate: string, endDate: string) {
  const activeUsers = await prisma.user.findMany({
    where: { active: true, role: { not: 'ADMIN' } },
    orderBy: { name: 'asc' },
    include: { team: { select: { name: true } } },
  });

  const records = await prisma.attendance.findMany({
    where: {
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: [{ date: 'asc' }, { userId: 'asc' }],
  });

  const recordMap = new Map<string, typeof records[0]>();
  for (const rec of records) {
    recordMap.set(`${rec.userId}_${rec.date}`, rec);
  }

  // Generate list of all date strings in the range [startDate, endDate]
  const dateList: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  const current = new Date(start);

  while (current <= end) {
    dateList.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  const formatTime = (d?: Date | null) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '—';
    }
  };

  const dailyRows: AttendanceDailyExportRow[] = [];
  for (const dt of dateList) {
    for (const u of activeUsers) {
      const rec = recordMap.get(`${u.id}_${dt}`);
      dailyRows.push({
        date: dt,
        name: u.name,
        email: u.email,
        role: u.role,
        designation: u.designation || 'Staff',
        department: u.department || 'General',
        team: u.team?.name || 'Unassigned',
        status: rec?.status || 'NOT_LOGGED',
        clockIn: formatTime(rec?.clockIn),
        clockOut: formatTime(rec?.clockOut),
        workHours: rec?.workHours || 0,
        notes: rec?.notes || '',
      });
    }
  }

  const summaryRows: AttendanceSummaryExportRow[] = activeUsers.map((u) => {
    const userRecords = records.filter((r) => r.userId === u.id);
    const presentDays = userRecords.filter((r) => r.status === 'PRESENT').length;
    const halfDays = userRecords.filter((r) => r.status === 'HALF_DAY').length;
    const onFieldDays = userRecords.filter((r) => r.status === 'ON_FIELD').length;
    const leaveDays = userRecords.filter((r) => r.status === 'ON_LEAVE').length;
    const absentDays = userRecords.filter((r) => r.status === 'ABSENT').length;
    const recordedDays = userRecords.length;
    const notLoggedDays = Math.max(0, dateList.length - recordedDays);
    const totalWorkHours = parseFloat(
      userRecords.reduce((acc, r) => acc + (r.workHours || 0), 0).toFixed(2)
    );

    const effectivePresent = presentDays + onFieldDays + halfDays * 0.5;
    const attendanceRate = dateList.length > 0 ? `${Math.round((effectivePresent / dateList.length) * 100)}%` : '0%';

    return {
      name: u.name,
      email: u.email,
      role: u.role,
      designation: u.designation || 'Staff',
      department: u.department || 'General',
      team: u.team?.name || 'Unassigned',
      totalDaysInRange: dateList.length,
      presentDays,
      halfDays,
      onFieldDays,
      leaveDays,
      absentDays,
      notLoggedDays,
      totalWorkHours,
      attendanceRate,
    };
  });

  return {
    startDate,
    endDate,
    totalDays: dateList.length,
    totalEmployees: activeUsers.length,
    dailyRows,
    summaryRows,
  };
}

/**
 * Check if the user is before the daily mark-in gate (09:30 AM IST)
 */
export function isBefore930AM(dateObj: Date = new Date()): boolean {
  try {
    const timeStr = dateObj.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Kolkata',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    });
    const [hourStr, minStr] = timeStr.split(':');
    const h = parseInt(hourStr, 10);
    const m = parseInt(minStr, 10);
    return h < 9 || (h === 9 && m < 30);
  } catch {
    const h = dateObj.getHours();
    const m = dateObj.getMinutes();
    return h < 9 || (h === 9 && m < 30);
  }
}

/**
 * Check if a timestamp is on or before 10:10 AM in Indian Standard Time (Asia/Kolkata)
 */
export function isBeforeOrAt1010AM(dateObj: Date = new Date()): boolean {
  try {
    const timeStr = dateObj.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Kolkata',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    });
    const [hourStr, minStr] = timeStr.split(':');
    const h = parseInt(hourStr, 10);
    const m = parseInt(minStr, 10);
    return h < 10 || (h === 10 && m <= 10);
  } catch {
    const h = dateObj.getHours();
    const m = dateObj.getMinutes();
    return h < 10 || (h === 10 && m <= 10);
  }
}

function getIndiaDateKey(dateObj: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(dateObj);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/**
 * Get 6:30 PM (18:30 IST) date object for a given date string YYYY-MM-DD
 */
export function getShiftEndDateTime(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  // 18:30 IST is 13:00 UTC
  const end = new Date(Date.UTC(y, m - 1, d, 13, 0, 0));
  return end;
}

export async function getMyTodayAttendance(userId: string) {
  const now = new Date();
  const date = getIndiaDateKey(now);

  let record = await prisma.attendance.findUnique({
    where: { userId_date: { userId, date } },
  });

  // Auto Clock-Out check: If clocked in, clockOut is null, and current time is >= 18:30 IST
  if (record && record.clockIn && !record.clockOut) {
    try {
      const timeStr = now.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
      });
      const [h, m] = timeStr.split(':').map(Number);
      const isPast1830 = h > 18 || (h === 18 && m >= 30);

      if (isPast1830) {
        const shiftEnd = getShiftEndDateTime(date);
        const diffMs = Math.max(0, shiftEnd.getTime() - new Date(record.clockIn).getTime());
        const workHours = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));

        record = await prisma.attendance.update({
          where: { id: record.id },
          data: {
            clockOut: shiftEnd,
            workHours,
            notes: record.notes
              ? `${record.notes} (Auto Mark-out at 6:30 PM)`
              : 'Auto Mark-out at 6:30 PM (Shift End)',
          },
        });

        await prisma.user.update({
          where: { id: userId },
          data: { routingAvailable: false },
        });
      }
    } catch (e) {
      console.error('Auto mark out check error:', e);
    }
  }

  return record;
}

export async function getMarkOutRequest(userId: string, date = getIndiaDateKey()) {
  return prisma.markOutRequest.findUnique({
    where: { userId_date: { userId, date } },
    select: { id: true, status: true, reason: true, reviewedAt: true },
  });
}

export async function recordClockInOut(
  userId: string,
  type: 'CLOCK_IN' | 'CLOCK_OUT',
  notes?: string,
  customTime?: Date
) {
  const now = customTime || new Date();
  const date = getIndiaDateKey(now);

  const existing = await prisma.attendance.findUnique({
    where: { userId_date: { userId, date } },
  });

  if (type === 'CLOCK_IN') {
    if (isBefore930AM(now)) {
      throw new Error('Mark in is available daily after 9:30 AM.');
    }

    // Clock-in is once per India calendar day. A refresh or repeated click must
    // return the existing shift instead of resetting its original clock-in.
    if (existing?.clockIn) {
      return existing;
    }

    // 10:10 AM Threshold: On or before 10:10 AM => PRESENT, after 10:10 AM => HALF_DAY
    const isFullDay = isBeforeOrAt1010AM(now);
    const status = isFullDay ? 'PRESENT' : 'HALF_DAY';
    const defaultNote = isFullDay
      ? 'On-time Mark In (Before 10:10 AM)'
      : 'Late Mark In (After 10:10 AM) - Marked Half Day';

    const record = await prisma.attendance.upsert({
      where: { userId_date: { userId, date } },
      create: {
        userId,
        date,
        status,
        clockIn: now,
        notes: notes || defaultNote,
      },
      update: {
        clockIn: now,
        status,
        notes: notes || defaultNote,
      },
    });

    // Make executive available for lead routing
    await prisma.user.update({
      where: { id: userId },
      data: { routingAvailable: true },
    });

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    await notifyLeaveApprovers(
      'Employee Marked In',
      `${user?.name || 'An employee'} marked in for ${date} (${status}).`,
      '/dashboard/hr/attendance'
    );
    return record;
  } else {
    // CLOCK_OUT
    let workHours: number | undefined;
    if (existing?.clockIn) {
      const diffMs = now.getTime() - new Date(existing.clockIn).getTime();
      workHours = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));
    }

    const record = await prisma.attendance.upsert({
      where: { userId_date: { userId, date } },
      create: {
        userId,
        date,
        status: existing?.status || 'PRESENT',
        clockOut: now,
        workHours,
        notes: notes || 'Marked Out',
      },
      update: {
        clockOut: now,
        workHours,
        ...(notes && { notes }),
      },
    });

    // Make executive unavailable for lead routing when clocked out
    await prisma.user.update({
      where: { id: userId },
      data: { routingAvailable: false },
    });

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    await notifyLeaveApprovers(
      'Employee Marked Out',
      `${user?.name || 'An employee'} marked out for ${date}.`,
      '/dashboard/hr/attendance'
    );
    return record;
  }
}

export async function setAttendanceStatus(data: {
  userId: string;
  date: string;
  status: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'ON_LEAVE' | 'ON_FIELD';
  notes?: string;
  actorId: string;
}) {
  const record = await prisma.attendance.upsert({
    where: { userId_date: { userId: data.userId, date: data.date } },
    create: {
      userId: data.userId,
      date: data.date,
      status: data.status,
      notes: data.notes,
    },
    update: {
      status: data.status,
      notes: data.notes,
    },
  });

  // If absent or on leave, automatically suspend lead routing
  const routingAvailable = data.status === 'PRESENT' || data.status === 'ON_FIELD';
  await prisma.user.update({
    where: { id: data.userId },
    data: { routingAvailable },
  });

  const user = await prisma.user.findUnique({ where: { id: data.userId }, select: { name: true } });
  await notifyLeaveApprovers(
    'Attendance Status Updated',
    `${user?.name || 'An employee'} was marked ${data.status} for ${data.date}.`,
    '/dashboard/hr/attendance'
  );

  return record;
}

// ==========================================
// 3. LEAVE MANAGEMENT
// ==========================================

export async function getLeaveRequests(status?: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (status) where.status = status;

  return prisma.leaveRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          designation: true,
          department: true,
          team: { select: { name: true } },
        },
      },
      reviewedBy: {
        select: { id: true, name: true },
      },
    },
  });
}

export async function submitLeaveRequest(data: {
  userId: string;
  leaveType: 'CASUAL' | 'SICK' | 'HALF_DAY' | 'UNPAID';
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string;
}) {
  const leave = await prisma.leaveRequest.create({
    data: {
      userId: data.userId,
      leaveType: data.leaveType,
      startDate: data.startDate,
      endDate: data.endDate,
      daysCount: data.daysCount,
      reason: data.reason,
      status: 'PENDING',
    },
  });
  const user = await prisma.user.findUnique({ where: { id: data.userId }, select: { name: true } });
  await notifyLeaveApprovers(
    'New Leave Request',
    `${user?.name || 'An employee'} submitted a ${data.leaveType} leave request for ${data.startDate} to ${data.endDate}.`,
    '/dashboard/hr/leaves'
  );
  return leave;
}

export async function reviewLeaveRequest(
  requestId: string,
  reviewerId: string,
  status: 'APPROVED' | 'REJECTED',
  reviewComment?: string
) {
  const leave = await prisma.leaveRequest.findUnique({ where: { id: requestId } });
  if (!leave) throw new Error('Leave request not found');

  const updated = await prisma.leaveRequest.update({
    where: { id: requestId },
    data: {
      status,
      reviewedById: reviewerId,
      reviewComment,
      reviewedAt: new Date(),
    },
  });

  // If approved and current date falls in range, update routing availability
  if (status === 'APPROVED') {
    const todayStr = new Date().toISOString().split('T')[0];
    if (todayStr >= leave.startDate && todayStr <= leave.endDate) {
      await prisma.user.update({
        where: { id: leave.userId },
        data: { routingAvailable: false },
      });
    }
  }

  await createNotification({
    userId: leave.userId,
    type: 'SYSTEM',
    title: `Leave Request ${status === 'APPROVED' ? 'Approved' : 'Declined'}`,
    message: `Your leave request for ${leave.startDate} to ${leave.endDate} was ${status.toLowerCase()}.${reviewComment ? ` HR note: ${reviewComment}` : ''}`,
    link: '/dashboard/profile',
  });

  return updated;
}

// ==========================================
// 4. TARGETS & PAYROLL / COMMISSIONS
// (Zero Lead Details Exposed to HR!)
// ==========================================

export async function getTargetsAndCommissions(period?: string) {
  const currentPeriod = period || new Date().toISOString().substring(0, 7); // "2026-09"
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(currentPeriod)) {
    throw new Error('Period must use YYYY-MM format');
  }
  const [yearStr, monthStr] = currentPeriod.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const endOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  // Fetch sales staff (executives & team leads)
  const staff = await prisma.user.findMany({
    where: {
      active: true,
      role: { in: ['EXECUTIVE', 'TEAM_LEAD'] },
    },
    include: {
      team: { select: { name: true } },
      salesTargets: {
        where: { period: currentPeriod },
        take: 1,
      },
    },
    orderBy: { name: 'asc' },
  });

  // Calculate aggregated performance strictly without exposing any lead details to HR
  const staffPerformance = await Promise.all(
    staff.map(async (u) => {
      const target = u.salesTargets[0] || {
        targetCalls: 1000,
        targetMeetings: 15,
        targetRevenue: 5000000, // 50 Lakhs
        commissionRate: 2.0,
        bonus: 0,
        deductions: 0,
      };

      // Aggregated deal closures count & closed value within selected period
      // Note: We use count and aggregate sum only. ZERO lead records or customer names returned!
      const closedDeals = await prisma.lead.findMany({
        where: {
          currentOwnerId: u.id,
          currentStatus: 'CLOSED_WON',
          lastUpdatedAt: { gte: startOfMonth, lte: endOfMonth },
        },
        select: { estimatedValue: true },
      });

      const closedDealsCount = closedDeals.length;
      // Only recorded deal values contribute to revenue; missing values remain zero.
      const closedRevenue = closedDeals.reduce(
        (sum, l) => sum + (l.estimatedValue && l.estimatedValue > 0 ? l.estimatedValue : 0),
        0
      );

      // Call actions completed count within period
      const callsCompletedCount = await prisma.leadUpdate.count({
        where: {
          userId: u.id,
          createdAt: { gte: startOfMonth, lte: endOfMonth },
        },
      });

      // Meetings conducted count within period
      const meetingsCount = await prisma.meeting.count({
        where: {
          createdById: u.id,
          status: 'COMPLETED',
          scheduledAt: { gte: startOfMonth, lte: endOfMonth },
        },
      });

      const baseSalary = u.baseSalary || 35000;
      const commissionEarned = (closedRevenue * target.commissionRate) / 100;
      const bonus = target.bonus || 0;
      const deductions = target.deductions || 0;
      const netPayout = baseSalary + commissionEarned + bonus - deductions;

      return {
        userId: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        teamName: u.team?.name || 'Unassigned',
        designation: u.designation || 'Sales Executive',
        period: currentPeriod,
        baseSalary,
        // Quota Goals
        targetCalls: target.targetCalls,
        targetMeetings: target.targetMeetings,
        targetRevenue: target.targetRevenue,
        commissionRate: target.commissionRate,
        bonus,
        deductions,
        // Actual Aggregated Counts (ZERO Lead IDs or details)
        callsCompletedCount,
        meetingsCount,
        closedDealsCount,
        closedRevenue,
        // Calculated Compensation
        commissionEarned,
        netPayout,
        achievementPercent: target.targetRevenue > 0 ? Math.min(150, Math.round((closedRevenue / target.targetRevenue) * 100)) : 0,
      };
    })
  );

  const totalPayroll = staffPerformance.reduce((acc, s) => acc + s.netPayout, 0);
  const totalCommission = staffPerformance.reduce((acc, s) => acc + s.commissionEarned, 0);
  const totalRevenueGenerated = staffPerformance.reduce((acc, s) => acc + s.closedRevenue, 0);

  return {
    period: currentPeriod,
    totalStaff: staffPerformance.length,
    totalPayroll,
    totalCommission,
    totalRevenueGenerated,
    staff: staffPerformance,
  };
}

export async function saveSalesTarget(data: {
  userId: string;
  period: string;
  targetCalls: number;
  targetMeetings: number;
  targetRevenue: number;
  commissionRate: number;
  bonus?: number;
  deductions?: number;
}) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(data.period)) {
    throw new Error('Period must use YYYY-MM format');
  }
  if ([data.targetCalls, data.targetMeetings, data.targetRevenue, data.commissionRate, data.bonus || 0, data.deductions || 0]
    .some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error('Payroll target values cannot be negative');
  }
  const targetUser = await prisma.user.findUnique({
    where: { id: data.userId },
    select: { active: true, role: true },
  });
  if (!targetUser || !targetUser.active || !['EXECUTIVE', 'TEAM_LEAD'].includes(targetUser.role)) {
    throw new Error('Sales targets can only be assigned to active sales staff');
  }
  return prisma.salesTarget.upsert({
    where: { userId_period: { userId: data.userId, period: data.period } },
    create: {
      userId: data.userId,
      period: data.period,
      targetCalls: data.targetCalls,
      targetMeetings: data.targetMeetings,
      targetRevenue: data.targetRevenue,
      commissionRate: data.commissionRate,
      bonus: data.bonus || 0,
      deductions: data.deductions || 0,
    },
    update: {
      targetCalls: data.targetCalls,
      targetMeetings: data.targetMeetings,
      targetRevenue: data.targetRevenue,
      commissionRate: data.commissionRate,
      bonus: data.bonus || 0,
      deductions: data.deductions || 0,
    },
  });
}

// ==========================================
// 5. RECRUITMENT & HIRING PIPELINE
// ==========================================

export async function getJobOpenings() {
  return prisma.jobOpening.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: { candidates: true },
      },
    },
  });
}

export async function createJobOpening(data: {
  title: string;
  department?: string;
  location?: string;
  openingsCount?: number;
  experience: string;
  description?: string;
}) {
  return prisma.jobOpening.create({
    data: {
      title: data.title,
      department: data.department || 'Sales',
      location: data.location || 'Ahmedabad',
      openingsCount: data.openingsCount || 1,
      experience: data.experience,
      description: data.description,
      status: 'OPEN',
    },
  });
}

export async function getCandidates(jobOpeningId?: string, stage?: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (jobOpeningId) where.jobOpeningId = jobOpeningId;
  if (stage) where.stage = stage;

  return prisma.candidate.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      jobOpening: {
        select: { id: true, title: true, department: true },
      },
    },
  });
}

export async function createCandidate(data: {
  fullName: string;
  email: string;
  phone: string;
  jobOpeningId?: string;
  currentCompany?: string;
  experienceYears?: number;
  currentCtc?: number;
  expectedCtc?: number;
  noticePeriodDays?: number;
  notes?: string;
}) {
  return prisma.candidate.create({
    data: {
      fullName: data.fullName,
      email: data.email,
      phone: data.phone,
      jobOpeningId: data.jobOpeningId || null,
      currentCompany: data.currentCompany,
      experienceYears: data.experienceYears,
      currentCtc: data.currentCtc,
      expectedCtc: data.expectedCtc,
      noticePeriodDays: data.noticePeriodDays,
      notes: data.notes,
      stage: 'APPLIED',
    },
  });
}

export async function updateCandidateStage(
  candidateId: string,
  stage: 'APPLIED' | 'SCREENING' | 'INTERVIEW_1' | 'MOCK_PITCH' | 'OFFER' | 'HIRED' | 'REJECTED',
  rating?: number,
  notes?: string
) {
  return prisma.candidate.update({
    where: { id: candidateId },
    data: {
      stage,
      ...(rating !== undefined && { rating }),
      ...(notes && { notes }),
    },
  });
}

export async function convertCandidateToEmployee(data: {
  candidateId: string;
  role: UserRole;
  teamId?: string;
  baseSalary: number;
  designation: string;
  department?: string;
  actorId: string;
}) {
  const candidate = await prisma.candidate.findUnique({
    where: { id: data.candidateId },
  });
  if (!candidate) throw new Error('Candidate not found');

  // Check if user exists
  const existing = await prisma.user.findUnique({ where: { email: candidate.email } });
  if (existing) throw new Error(`User with email ${candidate.email} already exists`);

  const passwordHash = await hashPassword('Password@123');

  const user = await prisma.user.create({
    data: {
      name: candidate.fullName,
      email: candidate.email,
      phone: candidate.phone,
      passwordHash,
      role: data.role,
      designation: data.designation,
      department: data.department || 'Sales',
      teamId: data.teamId || null,
      baseSalary: data.baseSalary,
      dateOfJoining: new Date(),
      active: true,
      routingAvailable: true,
    },
  });

  // Mark candidate stage as HIRED
  await prisma.candidate.update({
    where: { id: data.candidateId },
    data: { stage: 'HIRED' },
  });

  await logAudit({
    actorId: data.actorId,
    action: 'HIRE_CANDIDATE',
    entity: 'USER',
    entityId: user.id,
    metadata: { candidateId: data.candidateId, name: user.name, role: user.role },
  });

  return user;
}
