/**
 * Calendar Utilities for ORVION CRM
 * RFC-5545 iCalendar (.ics) generation & Google Calendar URL Builder
 */

export interface CalendarEventData {
  title: string;
  description: string;
  location?: string;
  startDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM (24h)
  durationMinutes?: number;
  clientName?: string;
  clientPhone?: string;
  organizerName?: string;
}

/**
 * Format a Date object or date+time string to iCalendar UTC timestamp: YYYYMMDDTHHmmSSZ
 */
export function formatToICSDate(dateStr: string, timeStr: string, offsetMinutes: number = 0): string {
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hour, minute] = timeStr.split(':').map(Number);
    const d = new Date(Date.UTC(year, month - 1, day, hour, minute));
    if (offsetMinutes) {
      d.setUTCMinutes(d.getUTCMinutes() + offsetMinutes);
    }
    return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  } catch {
    const now = new Date();
    return now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  }
}

/**
 * Generates an RFC-5545 compliant .ics file content string
 */
export function generateICS(event: CalendarEventData): string {
  const dtStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const dtStart = formatToICSDate(event.startDate, event.startTime, 0);
  const dtEnd = formatToICSDate(event.startDate, event.startTime, event.durationMinutes || 45);
  const uid = `orvion-${Date.now()}-${Math.random().toString(36).substring(2, 9)}@orvion-one.vercel.app`;

  const cleanDescription = (event.description || '')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');

  const cleanTitle = (event.title || 'Client Meeting')
    .replace(/\n/g, ' ')
    .replace(/,/g, '\\,');

  const cleanLocation = (event.location || 'ORVION Sales Center / On-Site')
    .replace(/\n/g, ' ')
    .replace(/,/g, '\\,');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ORVION CRM//Enterprise Calendar 2.0//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${cleanTitle}`,
    `DESCRIPTION:${cleanDescription}`,
    `LOCATION:${cleanLocation}`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    `DESCRIPTION:Reminder: ${cleanTitle}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/**
 * Triggers a browser download of the generated .ics file
 */
export function downloadICS(filename: string, icsContent: string): void {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename.endsWith('.ics') ? filename : `${filename}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Builds a direct Google Calendar web event creation URL
 */
export function buildGoogleCalendarUrl(event: CalendarEventData): string {
  const dtStart = formatToICSDate(event.startDate, event.startTime, 0);
  const dtEnd = formatToICSDate(event.startDate, event.startTime, event.durationMinutes || 45);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title || 'ORVION Client Meeting',
    dates: `${dtStart}/${dtEnd}`,
    details: event.description || '',
    location: event.location || 'ORVION Center / Client Site',
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
