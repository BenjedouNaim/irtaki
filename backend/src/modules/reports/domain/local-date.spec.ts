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

describe('addMonths (relative performance windows, SAS §18.5 clamping)', () => {
  const { addMonths } =
    jest.requireActual<typeof import('./local-date')>('./local-date');

  it('walks whole months backwards and forwards', () => {
    expect(addMonths('2026-09-02', -1)).toBe('2026-08-02');
    expect(addMonths('2026-09-02', -3)).toBe('2026-06-02');
    expect(addMonths('2026-09-02', 1)).toBe('2026-10-02');
  });

  it('crosses year boundaries in both directions', () => {
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
    expect(addMonths('2026-01-15', -3)).toBe('2025-10-15');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
  });

  it('clamps the day to the last valid day of the target month', () => {
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-05-31', -3)).toBe('2026-02-28');
    // 2028 is a leap year.
    expect(addMonths('2028-03-31', -1)).toBe('2028-02-29');
    expect(addMonths('2026-10-31', -1)).toBe('2026-09-30');
  });

  it('rejects a malformed date string', () => {
    expect(() => addMonths('2026/09/02', -1)).toThrow(RangeError);
  });
});

describe('daysBetween', () => {
  const { daysBetween } =
    jest.requireActual<typeof import('./local-date')>('./local-date');

  it('counts whole days, signed, across month and year boundaries', () => {
    expect(daysBetween('2026-08-29', '2026-09-04')).toBe(6);
    expect(daysBetween('2026-09-04', '2026-08-29')).toBe(-6);
    expect(daysBetween('2026-09-02', '2026-09-02')).toBe(0);
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
  });

  it('is unaffected by a DST transition inside the range', () => {
    // Europe/Paris springs forward on 2026-03-29; date-only UTC arithmetic
    // must still report 7 whole days.
    expect(daysBetween('2026-03-25', '2026-04-01')).toBe(7);
  });

  it('rejects a malformed date string', () => {
    expect(() => daysBetween('2026-09-02', 'yesterday')).toThrow(RangeError);
  });
});

describe('local wall-clock helpers (ADR-030 per-timezone tick filter)', () => {
  const { isWithinLocalWindow, localMinutesInTimezone } =
    jest.requireActual<typeof import('./local-date')>('./local-date');

  describe('localMinutesInTimezone', () => {
    it('returns minutes since local midnight, not since UTC midnight', () => {
      const now = new Date('2026-09-07T19:00:00.000Z');
      expect(localMinutesInTimezone(now, 'Africa/Tunis')).toBe(20 * 60);
      expect(localMinutesInTimezone(now, 'UTC')).toBe(19 * 60);
      // Pacific/Auckland is UTC+12 in September: 07:00 the NEXT day.
      expect(localMinutesInTimezone(now, 'Pacific/Auckland')).toBe(7 * 60);
    });

    it('reports local midnight as 0, never 1440 (h23, not h24)', () => {
      // 23:00Z is 00:00 in Africa/Tunis.
      expect(
        localMinutesInTimezone(
          new Date('2026-09-07T23:00:00.000Z'),
          'Africa/Tunis',
        ),
      ).toBe(0);
    });

    it('follows a DST transition rather than a fixed offset', () => {
      // Auckland moves to UTC+13 on 2026-09-27.
      const before = new Date('2026-09-20T08:00:00.000Z');
      const after = new Date('2026-10-05T08:00:00.000Z');
      expect(localMinutesInTimezone(before, 'Pacific/Auckland')).toBe(20 * 60);
      expect(localMinutesInTimezone(after, 'Pacific/Auckland')).toBe(21 * 60);
    });

    it('rejects an unrecognised timezone identifier', () => {
      expect(() =>
        localMinutesInTimezone(new Date(), 'Mars/Olympus_Mons'),
      ).toThrow(RangeError);
    });
  });

  describe('isWithinLocalWindow', () => {
    const boundary = 20 * 60;

    it('is true from the boundary up to, but not including, the next tick', () => {
      expect(
        isWithinLocalWindow(
          new Date('2026-09-07T19:00:00.000Z'),
          'Africa/Tunis',
          boundary,
          15,
        ),
      ).toBe(true);
      expect(
        isWithinLocalWindow(
          new Date('2026-09-07T19:14:00.000Z'),
          'Africa/Tunis',
          boundary,
          15,
        ),
      ).toBe(true);
      expect(
        isWithinLocalWindow(
          new Date('2026-09-07T19:15:00.000Z'),
          'Africa/Tunis',
          boundary,
          15,
        ),
      ).toBe(false);
      expect(
        isWithinLocalWindow(
          new Date('2026-09-07T18:59:00.000Z'),
          'Africa/Tunis',
          boundary,
          15,
        ),
      ).toBe(false);
    });

    it('catches the same local boundary at a different instant per timezone', () => {
      const tunisEvening = new Date('2026-09-07T19:00:00.000Z');
      const aucklandEvening = new Date('2026-09-07T08:00:00.000Z');

      expect(
        isWithinLocalWindow(tunisEvening, 'Africa/Tunis', boundary, 15),
      ).toBe(true);
      expect(
        isWithinLocalWindow(tunisEvening, 'Pacific/Auckland', boundary, 15),
      ).toBe(false);
      expect(
        isWithinLocalWindow(aucklandEvening, 'Pacific/Auckland', boundary, 15),
      ).toBe(true);
      expect(
        isWithinLocalWindow(aucklandEvening, 'Africa/Tunis', boundary, 15),
      ).toBe(false);
    });

    it('matches the local-midnight bucket at boundary 0', () => {
      expect(
        isWithinLocalWindow(
          new Date('2026-09-07T23:05:00.000Z'),
          'Africa/Tunis',
          0,
          15,
        ),
      ).toBe(true);
    });
  });
});
