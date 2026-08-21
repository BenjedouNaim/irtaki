import { isValidIanaTimezone } from './timezone.util';

describe('isValidIanaTimezone', () => {
  it('returns true for valid standard IANA timezones', () => {
    expect(isValidIanaTimezone('Africa/Tunis')).toBe(true);
    expect(isValidIanaTimezone('UTC')).toBe(true);
    expect(isValidIanaTimezone('Europe/Paris')).toBe(true);
    expect(isValidIanaTimezone('America/New_York')).toBe(true);
    expect(isValidIanaTimezone('Asia/Riyadh')).toBe(true);
  });

  it('handles surrounding whitespace gracefully', () => {
    expect(isValidIanaTimezone('  Africa/Tunis  ')).toBe(true);
  });

  it('returns false for invalid or unsupported timezone strings', () => {
    expect(isValidIanaTimezone('Invalid/Timezone')).toBe(false);
    expect(isValidIanaTimezone('Mars/Olympus_Mons')).toBe(false);
    expect(isValidIanaTimezone('RandomString')).toBe(false);
    expect(isValidIanaTimezone('GMT+25')).toBe(false);
  });

  it('returns false for empty or non-string inputs', () => {
    expect(isValidIanaTimezone('')).toBe(false);
    expect(isValidIanaTimezone('   ')).toBe(false);
    expect(isValidIanaTimezone(null as unknown as string)).toBe(false);
    expect(isValidIanaTimezone(undefined as unknown as string)).toBe(false);
  });
});
