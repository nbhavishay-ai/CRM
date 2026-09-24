import { describe, expect, test, afterEach } from 'bun:test';
import { prisma } from '../lib/db';
import { createMeeting, getMeetings } from '../services/meeting.service';

describe('ORVION Weekly Meeting Visibility', () => {
  let meetingId: string | null = null;
  let leadId: string | null = null;

  afterEach(async () => {
    if (meetingId) await prisma.meeting.delete({ where: { id: meetingId } });
    if (leadId) {
      await prisma.leadUpdate.deleteMany({ where: { leadId } });
      await prisma.lead.delete({ where: { id: leadId } });
    }
    meetingId = null;
    leadId = null;
  });

  test('executive-created meeting is visible in weekly results for executive and admin', async () => {
    const executive = await prisma.user.findUniqueOrThrow({ where: { email: 'shubham@orvion.com' } });
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'nehra@orvion.com' } });
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const date = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    const phone = `+9199${Date.now().toString().slice(-8)}`;

    const lead = await prisma.lead.create({
      data: {
        leadNumber: `ORV-${Date.now().toString().slice(-6)}`,
        clientName: 'Weekly Meeting Visibility Test',
        phone,
        currentOwnerId: executive.id,
        currentStatus: 'INTERESTED',
        currentCategory: 'ACTIVE',
      },
    });
    leadId = lead.id;

    const meeting = await createMeeting({
      leadId: lead.id,
      date,
      time: '14:00',
      meetingType: 'Online',
      user: {
        id: executive.id,
        name: executive.name,
        email: executive.email,
        role: executive.role as 'EXECUTIVE',
      },
    });
    meetingId = meeting.id;

    const executiveMeetings = await getMeetings({
      user: {
        id: executive.id,
        name: executive.name,
        email: executive.email,
        role: executive.role as 'EXECUTIVE',
      },
      timeframe: 'week',
    });
    const adminMeetings = await getMeetings({
      user: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role as 'ADMIN',
      },
      timeframe: 'week',
    });

    expect(executiveMeetings.some((item) => item.id === meeting.id)).toBe(true);
    expect(adminMeetings.some((item) => item.id === meeting.id)).toBe(true);
  });
});