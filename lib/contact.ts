/**
 * Utility functions for direct phone calling and WhatsApp messaging across ORVION CRM.
 */

export function formatWhatsAppUrl(phone: string, clientName?: string): string {
  if (!phone) return '#';
  
  // Remove all non-digits
  let digits = phone.replace(/\D/g, '');
  
  // If starts with 0 and has 11 digits (e.g. 09876543210), strip leading 0
  if (digits.startsWith('0') && digits.length === 11) {
    digits = digits.slice(1);
  }
  
  // If 10 digits (standard Indian mobile number without country code), prepend 91
  if (digits.length === 10) {
    digits = `91${digits}`;
  }
  
  const greeting = clientName
    ? `Hello ${clientName}, this is regarding your property inquiry with ORVION.`
    : `Hello, this is regarding your property inquiry with ORVION.`;
    
  return `https://wa.me/${digits}?text=${encodeURIComponent(greeting)}`;
}

export function formatTelUrl(phone: string): string {
  if (!phone) return '#';
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}
