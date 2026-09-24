import { describe, it, expect, beforeEach } from 'bun:test';
import { prisma } from '../lib/db';
import {
  recordClockInOut,
  isBefore930AM,
  isBeforeOrAt1010AM,
  getShiftEndDateTime,
  getMyTodayAttendance,
} from '../services/hr.service';

describe('ORVION Smart Attendance Rules (10:10 AM Cutoff & 6:30 PM Auto Clock-Out)', () => {
  let executiveUser: any;

  beforeEach(async () => {
    executiveUser = await prisma.user.findFirst({
      where: { email: 'exec.attendance.test@orvion.com' },
    });

    if (!executiveUser) {
      executiveUser = await prisma.user.create({
        data: {
          name: 'Priya Sharma',
          email: 'exec.attendance.test@orvion.com',
          passwordHash: 'dummy',
          role: 'EXECUTIVE',
          routingAvailable: false,
        },
      });
    }

    // Clean attendance records for test user
    await prisma.attendance.deleteMany({
      where: { userId: executiveUser.id },
    });
  });

  it('1. isBefore930AM and isBeforeOrAt1010AM correctly classify attendance timing gates', () => {
    // 09:29 AM IST (03:59 UTC) => before availability gate
    const before930 = new Date('2026-09-15T03:59:00Z');
    expect(isBefore930AM(before930)).toBe(true);

    // 09:30 AM IST (04:00 UTC) => availability gate is open
    const at930 = new Date('2026-09-15T04:00:00Z');
    expect(isBefore930AM(at930)).toBe(false);

    // 09:45 AM IST (04:15 UTC) => Before 10:10 AM
    const morningTime = new Date('2026-09-15T04:15:00Z');
    expect(isBeforeOrAt1010AM(morningTime)).toBe(true);

    // 10:10 AM IST (04:40 UTC) => On 10:10 AM
    const exactly1010 = new Date('2026-09-15T04:40:00Z');
    expect(isBeforeOrAt1010AM(exactly1010)).toBe(true);

    // 10:11 AM IST (04:41 UTC) => After 10:10 AM (Late)
    const late1011 = new Date('2026-09-15T04:41:00Z');
    expect(isBeforeOrAt1010AM(late1011)).toBe(false);

    // 11:30 AM IST (06:00 UTC) => After 10:10 AM (Late)
    const midday = new Date('2026-09-15T06:00:00Z');
    expect(isBeforeOrAt1010AM(midday)).toBe(false);
  });

  it('2. Clocking In before 09:30 AM is rejected and clocking in at or after 09:30 AM before 10:10 AM marks status as PRESENT', async () => {
    const earlyTime = new Date('2026-09-15T03:59:00Z');
    await expect(recordClockInOut(executiveUser.id, 'CLOCK_IN', undefined, earlyTime)).rejects.toThrow(
      'Mark in is available daily after 9:30 AM.'
    );

    // Simulate check-in at 09:45 AM IST (04:15 UTC)
    const checkInTime = new Date('2026-09-15T04:15:00Z');
    const record = await recordClockInOut(executiveUser.id, 'CLOCK_IN', undefined, checkInTime);

    expect(record.status).toBe('PRESENT');
    expect(record.clockIn).not.toBeNull();
    expect(record.notes).toContain('Before 10:10 AM');

    // Verify user lead routing is automatically enabled
    const userAfter = await prisma.user.findUnique({ where: { id: executiveUser.id } });
    expect(userAfter?.routingAvailable).toBe(true);
  });

  it('3. Clocking In after 10:10 AM marks status as HALF_DAY (Late Check-In)', async () => {
    // Simulate late check-in at 10:25 AM IST (04:55 UTC)
    const lateTime = new Date('2026-09-15T04:55:00Z');
    const record = await recordClockInOut(executiveUser.id, 'CLOCK_IN', undefined, lateTime);

    expect(record.status).toBe('HALF_DAY');
    expect(record.clockIn).not.toBeNull();
    expect(record.notes).toContain('Half Day');

    // Still enables lead routing for work during the shift
    const userAfter = await prisma.user.findUnique({ where: { id: executiveUser.id } });
    expect(userAfter?.routingAvailable).toBe(true);
  });

  it('4. Clocking in at exactly 10:11 AM is recorded as HALF_DAY', async () => {
    const record = await recordClockInOut(
      executiveUser.id,
      'CLOCK_IN',
      undefined,
      new Date('2026-09-15T04:41:00Z')
    );

    expect(record.status).toBe('HALF_DAY');
    expect(record.notes).toContain('Half Day');
  });

  it('5. Repeated clock-in on the same day keeps the original attendance record', async () => {
    const firstCheckIn = new Date();
    const repeatedCheckIn = new Date(firstCheckIn.getTime() + 60 * 60 * 1000);
    const firstRecord = await recordClockInOut(executiveUser.id, 'CLOCK_IN', undefined, firstCheckIn);
    const repeatedRecord = await recordClockInOut(executiveUser.id, 'CLOCK_IN', undefined, repeatedCheckIn);

    expect(repeatedRecord.id).toBe(firstRecord.id);
    expect(repeatedRecord.clockIn?.toISOString()).toBe(firstCheckIn.toISOString());
    expect((await getMyTodayAttendance(executiveUser.id))?.clockIn?.toISOString()).toBe(firstCheckIn.toISOString());
  });

  it('6. Manual Clock-Out calculates work hours and pauses lead routing', async () => {
    // Clock in at 09:30 AM IST (04:00 UTC)
    const inTime = new Date('2026-09-15T04:00:00Z');
    await recordClockInOut(executiveUser.id, 'CLOCK_IN', undefined, inTime);

    // Clock out at 06:30 PM IST (13:00 UTC) => exactly 9 hours
    const outTime = new Date('2026-09-15T13:00:00Z');
    const outRecord = await recordClockInOut(executiveUser.id, 'CLOCK_OUT', 'Leaving for day', outTime);

    expect(outRecord.clockOut).not.toBeNull();
    expect(outRecord.workHours).toBe(9);

    // Lead routing should be paused upon departure
    const userAfter = await prisma.user.findUnique({ where: { id: executiveUser.id } });
    expect(userAfter?.routingAvailable).toBe(false);
  });

  it('7. getShiftEndDateTime generates 18:30 IST shift end', () => {
    const shiftEnd = getShiftEndDateTime('2026-09-15');
    expect(shiftEnd.toISOString()).toBe('2026-09-15T13:00:00.000Z'); // 13:00 UTC = 18:30 IST
  });
});
