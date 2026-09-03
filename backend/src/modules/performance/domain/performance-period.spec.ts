import { resolvePerformancePeriod } from './performance-period';

// 2026-09-02 is a Wednesday (ISO 3); recitation day Friday (5) puts it in
// the week Sat 2026-08-29 … Fri 2026-09-04.
const TODAY = '2026-09-02';
const RECITATION_DAY = 5;

describe('resolvePerformancePeriod (APIS §9.3 ?period=, FR-PERF-03)', () => {
  it('defaults to the current reporting week when period is omitted (UC-07 step 1)', () => {
    expect(
      resolvePerformancePeriod({ today: TODAY, recitationDay: RECITATION_DAY }),
    ).toEqual({ from: '2026-08-29', to: '2026-09-04' });
  });

  it('resolves week to the VO-04 reporting week, not a rolling seven days', () => {
    const period = resolvePerformancePeriod({
      period: 'week',
      today: TODAY,
      recitationDay: RECITATION_DAY,
    });

    expect(period).toEqual({ from: '2026-08-29', to: '2026-09-04' });
    // A rolling window would have started on 2026-08-27.
    expect(period.from).not.toBe('2026-08-27');
  });

  it('anchors week on the group’s own recitation day', () => {
    expect(
      resolvePerformancePeriod({
        period: 'week',
        today: TODAY,
        recitationDay: 3,
      }),
    ).toEqual({ from: '2026-08-27', to: '2026-09-02' });
  });

  it('resolves month to the calendar month ending today', () => {
    expect(
      resolvePerformancePeriod({
        period: 'month',
        today: TODAY,
        recitationDay: RECITATION_DAY,
      }),
    ).toEqual({ from: '2026-08-02', to: TODAY });
  });

  it('resolves 3months to the three calendar months ending today', () => {
    expect(
      resolvePerformancePeriod({
        period: '3months',
        today: TODAY,
        recitationDay: RECITATION_DAY,
      }),
    ).toEqual({ from: '2026-06-02', to: TODAY });
  });

  it('clamps the relative windows onto a shorter month', () => {
    expect(
      resolvePerformancePeriod({
        period: 'month',
        today: '2026-03-31',
        recitationDay: RECITATION_DAY,
      }),
    ).toEqual({ from: '2026-02-28', to: '2026-03-31' });
  });

  it('passes a custom range through verbatim', () => {
    expect(
      resolvePerformancePeriod({
        period: 'custom',
        from: '2026-01-01',
        to: '2026-01-31',
        today: TODAY,
        recitationDay: RECITATION_DAY,
      }),
    ).toEqual({ from: '2026-01-01', to: '2026-01-31' });
  });

  it('does not clamp a custom range to today here — the caller intersects it (FR-PERF-07)', () => {
    expect(
      resolvePerformancePeriod({
        period: 'custom',
        from: '2026-01-01',
        to: '2099-12-31',
        today: TODAY,
        recitationDay: RECITATION_DAY,
      }).to,
    ).toBe('2099-12-31');
  });
});
