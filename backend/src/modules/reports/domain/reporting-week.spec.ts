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
