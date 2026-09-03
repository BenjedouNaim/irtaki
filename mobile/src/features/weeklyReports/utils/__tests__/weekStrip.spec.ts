import { buildWeekStrip, reportedDaysSoFar } from '../weekStrip';

describe('buildWeekStrip (SCR-08 WeekCard from API-033 alone)', () => {
  const week = { week_start: '2026-08-28', week_end: '2026-09-03' };

  it('yields seven cells from week_start, day letters in Figma order, recitation on week_end and today outlined', () => {
    const days = buildWeekStrip(week, '2026-08-31');

    expect(days.map((d) => d.key)).toEqual([
      '2026-08-28',
      '2026-08-29',
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
    ]);
    expect(days.map((d) => d.day)).toEqual(['ج', 'س', 'ح', 'ن', 'ث', 'ر', 'خ']);
    expect(days.map((d) => d.state)).toEqual([
      'future',
      'future',
      'future',
      'today',
      'future',
      'future',
      'recitation',
    ]);
    expect(days[3].accessibilityLabel).toBe('الاثنين');
  });

  it('never invents a per-day reported / excused / missed state (API-033 carries only counts)', () => {
    const states = new Set(
      buildWeekStrip(week, '2026-09-02').map((d) => d.state),
    );
    expect(states.has('reported')).toBe(false);
    expect(states.has('excused')).toBe(false);
    expect(states.has('missed')).toBe(false);
  });

  it('shows the recitation cell even when today is the recitation day, and no today cell off-week', () => {
    expect(buildWeekStrip(week, '2026-09-03')[6].state).toBe('recitation');
    expect(
      buildWeekStrip(week, '2026-09-10').every((d) => d.state !== 'today'),
    ).toBe(true);
  });

  it('returns nothing for an unparsable week_start', () => {
    expect(buildWeekStrip({ week_start: 'x', week_end: 'y' }, 'z')).toEqual([]);
  });

  it('counts reported days from the two server counts, never below zero', () => {
    expect(
      reportedDaysSoFar({ expected_days: 6, missed_daily_reports: 2 }),
    ).toBe(4);
    expect(
      reportedDaysSoFar({ expected_days: 0, missed_daily_reports: 0 }),
    ).toBe(0);
    expect(
      reportedDaysSoFar({ expected_days: 1, missed_daily_reports: 3 }),
    ).toBe(0);
  });
});
