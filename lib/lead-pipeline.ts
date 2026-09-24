export const CALLING_SOURCE_PREFIX = 'Calling:';

export function isCallingLeadSource(source: string | null | undefined): boolean {
  return source?.startsWith(CALLING_SOURCE_PREFIX) === true;
}