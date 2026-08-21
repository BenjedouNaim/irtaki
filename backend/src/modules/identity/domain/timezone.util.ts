/**
 * Helper to validate IANA timezone identifiers.
 *
 * Uses Intl.DateTimeFormat with try/catch to check standard IANA identifiers.
 */
export function isValidIanaTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string' || tz.trim().length === 0) {
    return false;
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
}
