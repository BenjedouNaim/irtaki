import {
  hasRecitationDayPassed,
  isRecitationDayOf,
} from './weekly-report-finalisation';

describe('weekly-report-finalisation (ST-06 guards, VR-21 / FR-WR-06)', () => {
  // Recitation day Friday 2026-09-04 for a student in Africa/Tunis (UTC+1).
  const weekEnd = '2026-09-04';
  const tunis = 'Africa/Tunis';

  describe('isRecitationDayOf (VR-21)', () => {
    it('is true anywhere inside the recitation day in the student timezone', () => {
      // 00:00:00 local = 2026-09-03T23:00:00Z
      expect(
        isRecitationDayOf(weekEnd, new Date('2026-09-03T23:00:00.000Z'), tunis),
      ).toBe(true);
      // 23:59:59 local = 2026-09-04T22:59:59Z
      expect(
        isRecitationDayOf(weekEnd, new Date('2026-09-04T22:59:59.000Z'), tunis),
      ).toBe(true);
    });

    it('is false the day before and the day after (EC-41, EC-24)', () => {
      expect(
        isRecitationDayOf(weekEnd, new Date('2026-09-03T22:59:59.000Z'), tunis),
      ).toBe(false);
      expect(
        isRecitationDayOf(weekEnd, new Date('2026-09-04T23:00:00.000Z'), tunis),
      ).toBe(false);
    });

    it('evaluates against the student timezone, not UTC (T-01, DEC-B03)', () => {
      // 2026-09-04T23:30:00Z is still 2026-09-04 in Los Angeles (UTC−7) …
      const instant = new Date('2026-09-04T23:30:00.000Z');
      expect(isRecitationDayOf(weekEnd, instant, 'America/Los_Angeles')).toBe(
        true,
      );
      // … but already 2026-09-05 in Tunis and Auckland.
      expect(isRecitationDayOf(weekEnd, instant, tunis)).toBe(false);
      expect(isRecitationDayOf(weekEnd, instant, 'Pacific/Auckland')).toBe(
        false,
      );
    });
  });

  describe('hasRecitationDayPassed (FR-WR-06, AC-12)', () => {
    it('is false up to the last second of the recitation day', () => {
      expect(
        hasRecitationDayPassed(
          weekEnd,
          new Date('2026-09-04T22:59:59.999Z'),
          tunis,
        ),
      ).toBe(false);
    });

    it('is true from student-local midnight onward', () => {
      expect(
        hasRecitationDayPassed(
          weekEnd,
          new Date('2026-09-04T23:00:00.000Z'),
          tunis,
        ),
      ).toBe(true);
    });

    it('stays true on any later date so a missed run catches up (EC-39)', () => {
      expect(
        hasRecitationDayPassed(
          weekEnd,
          new Date('2026-09-20T12:00:00.000Z'),
          tunis,
        ),
      ).toBe(true);
    });

    it('is false before the recitation day (an Open row created early is left alone)', () => {
      expect(
        hasRecitationDayPassed(
          weekEnd,
          new Date('2026-09-03T12:00:00.000Z'),
          tunis,
        ),
      ).toBe(false);
    });

    it('differs per timezone for one and the same instant (ADR-030 per-timezone filtering)', () => {
      const instant = new Date('2026-09-04T23:30:00.000Z');
      expect(hasRecitationDayPassed(weekEnd, instant, tunis)).toBe(true);
      expect(hasRecitationDayPassed(weekEnd, instant, 'Pacific/Auckland')).toBe(
        true,
      );
      expect(
        hasRecitationDayPassed(weekEnd, instant, 'America/Los_Angeles'),
      ).toBe(false);
    });
  });
});
