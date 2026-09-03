import { countExpectedDaysSinceLastReport } from './expected-day-counting';

// Recitation day Friday (5). 2026-09-02 is a Wednesday.
const RECITATION_DAY = 5;
const WINDOW = { from: '2026-08-01', to: '2026-09-02' };

function count(
  lastReportDate: string | null,
  window = WINDOW,
  recitationDay = RECITATION_DAY,
): number {
  return countExpectedDaysSinceLastReport({
    lastReportDate,
    window,
    recitationDay,
  });
}

describe('countExpectedDaysSinceLastReport (SAS §18.4, TS §24)', () => {
  it('is 0 when today already carries a report', () => {
    expect(count('2026-09-02')).toBe(0);
  });

  it('counts today itself when today is an expected day with no report', () => {
    expect(count('2026-09-01')).toBe(1);
  });

  it('skips the recitation day rather than counting it (SAS §18.4)', () => {
    // Last report Thu 2026-08-27; Fri 28 is the recitation day, so the
    // expected days are Sat 29, Sun 30, Mon 31, Tue 1, Wed 2 — five, not six.
    expect(count('2026-08-27')).toBe(5);
  });

  it('skips several recitation days across a long gap', () => {
    // Last report Fri 2026-08-07 (itself a recitation day): 8 Aug … 2 Sep is
    // 26 calendar days containing Fridays 14, 21, 28 Aug → 23 expected days.
    expect(count('2026-08-07')).toBe(23);
  });

  it('counts every expected day of the window when no report exists at all', () => {
    // 1 Aug … 2 Sep is 33 calendar days containing four Fridays
    // (7, 14, 21, 28 Aug), leaving 29 expected days.
    expect(count(null)).toBe(29);
  });

  it('never counts days before the membership started (EffectiveWindow, FR-WR-09)', () => {
    expect(count(null, { from: '2026-09-01', to: '2026-09-02' })).toBe(2);
    // A report predating the window does not extend it backwards.
    expect(count('2026-06-01', { from: '2026-09-01', to: '2026-09-02' })).toBe(
      2,
    );
  });

  it('stops at the window end for a terminated or archived membership (FR-WR-10)', () => {
    expect(count('2026-08-30', { from: '2026-08-01', to: '2026-08-31' })).toBe(
      1,
    );
  });

  it('is 0 when the last report is on or after the window end', () => {
    expect(count('2026-09-02', { from: '2026-08-01', to: '2026-09-02' })).toBe(
      0,
    );
    expect(count('2026-09-05', { from: '2026-08-01', to: '2026-09-02' })).toBe(
      0,
    );
  });

  it('is 0 for an empty window (a membership starting on the recitation day)', () => {
    expect(count(null, { from: '2026-09-04', to: '2026-09-03' })).toBe(0);
  });

  it('reaches the at-risk threshold of 3 after three unreported expected days', () => {
    // Last report Sat 2026-08-29 → Sun 30, Mon 31, Tue 1 unreported.
    expect(count('2026-08-29', { from: '2026-08-01', to: '2026-09-01' })).toBe(
      3,
    );
  });

  it('honours a different recitation day', () => {
    // Recitation day Wednesday (3): 28 Aug … 2 Sep excludes Wed 2 Sep.
    expect(
      count('2026-08-27', { from: '2026-08-01', to: '2026-09-02' }, 3),
    ).toBe(5);
  });
});
