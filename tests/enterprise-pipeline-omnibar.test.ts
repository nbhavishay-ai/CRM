import { describe, it, expect, beforeEach } from 'bun:test';
import { prisma } from '../lib/db';
import {
  createNotification,
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearAllNotifications,
} from '../services/notification.service';
import { generateICS, buildGoogleCalendarUrl } from '../lib/calendar-utils';

describe('ORVION Real-Time Notification Center & Feature #4 Suite', () => {
  let testUser: any;

  beforeEach(async () => {
    // Ensure or retrieve test user
    testUser = await prisma.user.findFirst({
      where: { email: 'admin@orvion.internal' },
    });
    if (!testUser) {
      testUser = await prisma.user.create({
        data: {
          name: 'Test Admin',
          email: 'admin@orvion.internal',
          passwordHash: 'dummy',
          role: 'ADMIN',
        },
      });
    }

    // Clean notifications for test user
    await prisma.notification.deleteMany({
      where: { userId: testUser.id },
    });
  });

  it('1. Create Categorized Notifications & Fetch via Service', async () => {
    // SLA alert
    await createNotification({
      userId: testUser.id,
      type: 'SYSTEM',
      title: '🚨 SLA Alert: Lead Pending > 2 Hours',
      message: 'Lead ORV-000101 (Mr. Rajat) has had no updates.',
      link: '/dashboard/leads/dummy-id-1',
    });

    // Lead assignment
    await createNotification({
      userId: testUser.id,
      type: 'LEAD_ASSIGNED',
      title: '👤 New Lead Assigned',
      message: 'New lead Mrs. Sunita Sharma allocated.',
      link: '/dashboard/leads/dummy-id-2',
    });

    // Meeting reminder
    await createNotification({
      userId: testUser.id,
      type: 'MEETING_REMINDER',
      title: '📅 Meeting in 30 Mins',
      message: 'Site visit with Ananya Gupta at 3:00 PM.',
      link: '/dashboard/meetings',
    });

    const notifs = await getUserNotifications(testUser.id);
    expect(notifs.length).toBe(3);
    expect(notifs.filter((n) => !n.read).length).toBe(3);
    expect(notifs.some((n) => n.title.includes('SLA'))).toBe(true);
    expect(notifs.some((n) => n.title.includes('Assigned'))).toBe(true);
    expect(notifs.some((n) => n.title.includes('Meeting'))).toBe(true);
  });

  it('2. Mark Single and All Notifications as Read', async () => {
    const n1 = await createNotification({
      userId: testUser.id,
      type: 'SYSTEM',
      title: 'Alert 1',
      message: 'Message 1',
    });
    const n2 = await createNotification({
      userId: testUser.id,
      type: 'SYSTEM',
      title: 'Alert 2',
      message: 'Message 2',
    });

    // Mark single read
    await markNotificationRead(n1!.id, testUser.id);

    let notifs = await getUserNotifications(testUser.id);
    const updatedN1 = notifs.find((n) => n.id === n1!.id);
    const updatedN2 = notifs.find((n) => n.id === n2!.id);

    expect(updatedN1?.read).toBe(true);
    expect(updatedN2?.read).toBe(false);

    // Mark all read
    await markAllNotificationsRead(testUser.id);
    notifs = await getUserNotifications(testUser.id);
    expect(notifs.every((n) => n.read)).toBe(true);
  });

  it('3. Delete Single & Clear All Notifications', async () => {
    const n1 = await createNotification({
      userId: testUser.id,
      type: 'SYSTEM',
      title: 'Alert To Delete',
      message: 'Message To Delete',
    });
    const n2 = await createNotification({
      userId: testUser.id,
      type: 'SYSTEM',
      title: 'Alert To Keep',
      message: 'Message To Keep',
    });

    // Delete single
    await deleteNotification(n1!.id, testUser.id);
    let notifs = await getUserNotifications(testUser.id);
    expect(notifs.length).toBe(1);
    expect(notifs[0].id).toBe(n2!.id);

    // Clear all
    await clearAllNotifications(testUser.id);
    notifs = await getUserNotifications(testUser.id);
    expect(notifs.length).toBe(0);
  });

  it('4. Calendar Utilities Generate Valid RFC-5545 & Google Calendar URLs', () => {
    const event = {
      title: 'Site Visit: Mrs. Kapoor',
      description: 'Luxury Villa Boundary Tour & Layout Discussion',
      location: 'ORVION Palm Estate Site 4',
      startDate: '2026-09-20',
      startTime: '14:30',
      durationMinutes: 60,
      clientName: 'Mrs. Kapoor',
      clientPhone: '+919876543210',
    };

    const icsContent = generateICS(event);
    expect(icsContent).toContain('BEGIN:VCALENDAR');
    expect(icsContent).toContain('VERSION:2.0');
    expect(icsContent).toContain('BEGIN:VEVENT');
    expect(icsContent).toContain('SUMMARY:Site Visit: Mrs. Kapoor');
    expect(icsContent).toContain('LOCATION:ORVION Palm Estate Site 4');
    expect(icsContent).toContain('STATUS:CONFIRMED');
    expect(icsContent).toContain('END:VEVENT');
    expect(icsContent).toContain('END:VCALENDAR');

    const gCalUrl = buildGoogleCalendarUrl(event);
    expect(gCalUrl).toContain('https://calendar.google.com/calendar/render?');
    expect(gCalUrl).toContain('action=TEMPLATE');
    expect(gCalUrl).toContain('text=Site+Visit%3A+Mrs.+Kapoor');
  });
});
