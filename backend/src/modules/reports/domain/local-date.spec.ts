import { isoDayOfWeek, localDateInTimezone } from './local-date';

describe('local-date (SAS §19 timezone authority)', () => {
  describe('localDateInTimezone', () => {
    it('returns the calendar date in the given timezone, not in UTC', () => {
      // 2026-09-01T23:30:00Z is already 2026-09-02 in Africa/Tunis (UTC+1).
      const now = new Date('2026-09-01T23:30:00.000Z');
      expect(localDateInTimezone(now, 'Africa/Tunis')).toBe('2026-09-02');
      expect(localDateInTimezone(now, 'UTC')).toBe('2026-09-01');
    });

    it('handles a timezone behind UTC crossing midnight the other way', () => {
      // 2026-09-02T03:00:00Z is still 2026-09-01 in America/New_York (UTC-4).
      const now = new Date('2026-09-02T03:00:00.000Z');
      expect(localDateInTimezone(now, 'America/New_York')).toBe('2026-09-01');
    });

    it('zero-pads month and day', () => {
      const now = new Date('2026-01-05T12:00:00.000Z');
      expect(localDateInTimezone(now, 'Africa/Tunis')).toBe('2026-01-05');
    });

    it('throws for an unrecognised IANA identifier', () => {
      expect(() => localDateInTimezone(new Date(), 'Not/A_Zone')).toThrow(
        RangeError,
      );
    });
  });

  describe('isoDayOfWeek', () => {
    it('maps Monday to 1 and Sunday to 7 (ISO-8601, DBD DBT-02)', () => {
      expect(isoDayOfWeek('2026-08-31')).toBe(1); // Monday
      expect(isoDayOfWeek('2026-09-02')).toBe(3); // Wednesday
      expect(isoDayOfWeek('2026-09-05')).toBe(6); // Saturday
      expect(isoDayOfWeek('2026-09-06')).toBe(7); // Sunday
    });

    it('rejects a malformed date string', () => {
      expect(() => isoDayOfWeek('2026/09/02')).toThrow(RangeError);
      expect(() => isoDayOfWeek('')).toThrow(RangeError);
    });
  });
});

describe('addDays', () => {
  const { addDays } =
    jest.requireActual<typeof import('./local-date')>('./local-date');

  it('shifts across month and year boundaries with UTC arithmetic', () => {
    expect(addDays('2026-09-04', -6)).toBe('2026-08-29');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-09-02', 0)).toBe('2026-09-02');
  });

  it('rejects a malformed date string', () => {
    expect(() => addDays('2026/09/02', 1)).toThrow(RangeError);
  });
});
