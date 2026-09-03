import { reportingWeekContaining } from './reporting-week';

describe('reportingWeekContaining (VO-04 ReportingWeek, SAS §18.1, BR-15)', () => {
  // 2026-09-02 is a Wednesday (ISO 3).
  it('ends on the next date bearing the recitation day and starts six days earlier', () => {
    // Recitation day Friday (5): Wed 2026-09-02 → week_end Fri 2026-09-04.
    expect(reportingWeekContaining('2026-09-02', 5)).toEqual({
      weekStart: '2026-08-29',
      weekEnd: '2026-09-04',
    });
  });

  it('uses the date itself as week_end when it IS the recitation day', () => {
    expect(reportingWeekContaining('2026-09-02', 3)).toEqual({
      weekStart: '2026-08-27',
      weekEnd: '2026-09-02',
    });
  });

  it('starts a new week on the day after the recitation day (BR-15)', () => {
    // Recitation day Tuesday (2): Wed 2026-09-02 → next Tuesday 2026-09-08.
    expect(reportingWeekContaining('2026-09-02', 2)).toEqual({
      weekStart: '2026-09-02',
      weekEnd: '2026-09-08',
    });
  });

  it('handles Sunday (7) and month boundaries', () => {
    // Sat 2026-08-29, recitation day Sunday (7) → week_end 2026-08-30.
    expect(reportingWeekContaining('2026-08-29', 7)).toEqual({
      weekStart: '2026-08-24',
      weekEnd: '2026-08-30',
    });
    // Mon 2026-08-31, recitation day Sunday (7) → week_end 2026-09-06.
    expect(reportingWeekContaining('2026-08-31', 7)).toEqual({
      weekStart: '2026-08-31',
      weekEnd: '2026-09-06',
    });
  });

  it('is stable for every date of the same week', () => {
    const expected = { weekStart: '2026-08-29', weekEnd: '2026-09-04' };
    for (const date of [
      '2026-08-29',
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
    ]) {
      expect(reportingWeekContaining(date, 5)).toEqual(expected);
    }
  });

  it('rejects an out-of-range recitation day', () => {
    expect(() => reportingWeekContaining('2026-09-02', 0)).toThrow(RangeError);
    expect(() => reportingWeekContaining('2026-09-02', 8)).toThrow(RangeError);
  });
});

describe('reportingWeeksIntersecting (SAS §18.3 week set W(P))', () => {
  const { reportingWeeksIntersecting } =
    jest.requireActual<typeof import('./reporting-week')>('./reporting-week');

  // Recitation day Friday (5). The week containing 2026-09-02 (Wed) is
  // Sat 2026-08-29 … Fri 2026-09-04.
  it('returns the single week containing a one-day range', () => {
    expect(reportingWeeksIntersecting('2026-09-02', '2026-09-02', 5)).toEqual([
      { weekStart: '2026-08-29', weekEnd: '2026-09-04' },
    ]);
  });

  it('returns every week the range touches, oldest first, contiguously', () => {
    const weeks = reportingWeeksIntersecting('2026-08-20', '2026-09-02', 5);
    expect(weeks).toEqual([
      { weekStart: '2026-08-15', weekEnd: '2026-08-21' },
      { weekStart: '2026-08-22', weekEnd: '2026-08-28' },
      { weekStart: '2026-08-29', weekEnd: '2026-09-04' },
    ]);
    // BR-15: each week starts the day after the previous one ends.
    expect(weeks[1].weekStart).toBe('2026-08-22');
    expect(weeks[0].weekEnd).toBe('2026-08-21');
  });

  it('includes a trailing week the range only partially covers', () => {
    // Range ends mid-week: the week containing the end date still counts.
    const weeks = reportingWeeksIntersecting('2026-08-29', '2026-09-08', 5);
    expect(weeks).toHaveLength(2);
    expect(weeks[1]).toEqual({
      weekStart: '2026-09-05',
      weekEnd: '2026-09-11',
    });
  });

  it('is empty when the range is inverted (an empty period)', () => {
    expect(reportingWeeksIntersecting('2026-09-04', '2026-08-29', 5)).toEqual(
      [],
    );
  });

  it('covers roughly thirteen weeks over a three-month window', () => {
    expect(
      reportingWeeksIntersecting('2026-06-02', '2026-09-02', 5),
    ).toHaveLength(14);
  });
});
