import { describe, expect, test } from 'bun:test';
import { formatWhatsAppUrl, formatTelUrl } from '../lib/contact';

describe('ORVION Direct Contact Utilities (Call & WhatsApp)', () => {
  test('1. formatWhatsAppUrl generates valid wa.me link with 10-digit Indian phone', () => {
    const url = formatWhatsAppUrl('9876543210', 'Aarav Patel');
    expect(url).toContain('https://wa.me/919876543210?text=');
    expect(url).toContain(encodeURIComponent('Hello Aarav Patel, this is regarding your property inquiry with ORVION.'));
  });

  test('2. formatWhatsAppUrl correctly preserves country code if already present', () => {
    const url = formatWhatsAppUrl('+91 98765 43210', 'Priya Sharma');
    expect(url).toContain('https://wa.me/919876543210?text=');
  });

  test('3. formatWhatsAppUrl strips leading 0 from 11-digit numbers and normalizes', () => {
    const url = formatWhatsAppUrl('09876543210', 'Rahul Verma');
    expect(url).toContain('https://wa.me/919876543210?text=');
  });

  test('4. formatTelUrl produces standard tel: format', () => {
    expect(formatTelUrl('+91 98765 43210')).toBe('tel:+919876543210');
    expect(formatTelUrl('9876543210')).toBe('tel:9876543210');
  });
});
