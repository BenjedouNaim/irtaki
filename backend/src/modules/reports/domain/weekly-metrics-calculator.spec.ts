import { DailyReportDaySnapshot } from './day-classification';
import {
  computeEffectiveWindow,
  computeWeeklyMetrics,
  DatedDailyReportSnapshot,
  WeeklyMetrics,
} from './weekly-metrics-calculator';

/** Recitation day Friday: the week Sat 2026-08-29 … Fri 2026-09-04. */
const WEEK = { weekStart: '2026-08-29', weekEnd: '2026-09-04' };
const FULL_WINDOW = { from: '2026-08-01', to: '2026-09-04' };
const DAY = [
  '2026-08-29',
  '2026-08-30',
  '2026-08-31',
  '2026-09-01',
  '2026-09-02',
  '2026-09-03',
] as const;

const base: DailyReportDaySnapshot = {
  type: 'Normal',
  absenceReason: null,
  noMemorizationToday: false,
  noRevisionToday: false,
  hasMemoRange: true,
  completed50Repetitions: true,
  repetitionsInSingleSession: true,
};

function on(
  reportDate: string,
  overrides: Partial<DailyReportDaySnapshot>,
): DatedDailyReportSnapshot {
  return { ...base, ...overrides, reportDate };
}

/** Fixture builders — one per DayClassification and per §18.2 input. */
const normalFull = (d: string) => on(d, {});
const normalNoMemo = (d: string) =>
  on(d, {
    hasMemoRange: false,
    noMemorizationToday: true,
    completed50Repetitions: null,
    repetitionsInSingleSession: null,
  });
const normalNoRevision = (d: string) => on(d, { noRevisionToday: true });
const normalNeither = (d: string) =>
  on(d, {
    hasMemoRange: false,
    noMemorizationToday: true,
    noRevisionToday: true,
    completed50Repetitions: null,
    repetitionsInSingleSession: null,
  });
const normalMissed50 = (d: string) =>
  on(d, { completed50Repetitions: false, repetitionsInSingleSession: false });
const normalSplitSessions = (d: string) =>
  on(d, { completed50Repetitions: true, repetitionsInSingleSession: false });
const revision = (d: string) =>
  on(d, {
    type: 'Revision',
    hasMemoRange: false,
    noMemorizationToday: null,
    noRevisionToday: false,
    completed50Repetitions: null,
    repetitionsInSingleSession: null,
  });
const absent = (d: string, reason: 'Sick' | 'Studying' | 'Other') =>
  on(d, {
    type: 'Absent',
    absenceReason: reason,
    hasMemoRange: false,
    noMemorizationToday: null,
    noRevisionToday: null,
    completed50Repetitions: null,
    repetitionsInSingleSession: null,
  });

function compute(reports: DatedDailyReportSnapshot[], window = FULL_WINDOW) {
  return computeWeeklyMetrics({ week: WEEK, effectiveWindow: window, reports });
}

const zeroMetrics: Omit<WeeklyMetrics, 'expectedDays'> = {
  missedDailyReports: 0,
  missedDailyMemorization: 0,
  missedDailyRevision: 0,
  missed50Repetitions: 0,
  missedSingleSession: 0,
  effectiveDays: 0,
  memorizationExpectedDays: 0,
  memorizationDays: 0,
  dayBreakdown: {
    normal: 0,
    revision: 0,
    absentExcused: 0,
    absentOther: 0,
    noReport: 0,
  },
};

describe('computeEffectiveWindow (SAS §18.1 EffectiveWindow)', () => {
  it('runs from started_at to today for an Active membership in an Active group', () => {
    expect(
      computeEffectiveWindow({
        startedAt: '2026-08-01',
        today: '2026-09-02',
        endedAt: null,
        archivedAt: null,
      }),
    ).toEqual({ from: '2026-08-01', to: '2026-09-02' });
  });

  it('truncates at the earliest of today, ended_at and archived_at (FR-WR-10, DEC-C03)', () => {
    expect(
      computeEffectiveWindow({
        startedAt: '2026-08-01',
        today: '2026-09-02',
        endedAt: '2026-08-31',
        archivedAt: '2026-09-01',
      }),
    ).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(
      computeEffectiveWindow({
        startedAt: '2026-08-01',
        today: '2026-09-02',
        endedAt: null,
        archivedAt: '2026-08-30',
      }),
    ).toEqual({ from: '2026-08-01', to: '2026-08-30' });
  });
});

describe('computeWeeklyMetrics (WeeklyMetricsCalculator, SAS §18.2 / TS §22)', () => {
  describe('one fixture week covering every DayClassification', () => {
    // Sat NORMAL (50 done, split sessions) · Sun NORMAL (memo, 50 missed, no
    // revision) · Mon REVISION · Tue ABSENT_EXCUSED (Sick) · Wed ABSENT_OTHER
    // · Thu NO_REPORT.
    const week = [
      normalSplitSessions(DAY[0]),
      { ...normalMissed50(DAY[1]), noRevisionToday: true },
      revision(DAY[2]),
      absent(DAY[3], 'Sick'),
      absent(DAY[4], 'Other'),
    ];
    const result = compute(week);

    it('counts the six prorated days and the three denominators (§18.1)', () => {
      expect(result.expectedDays).toBe(6);
      expect(result.effectiveDays).toBe(5); // minus the Sick day (BR-24)
      expect(result.memorizationExpectedDays).toBe(4); // minus the Revision day (BR-28a)
      expect(result.memorizationDays).toBe(2); // Sat, Sun bear a memo range
    });

    it('missed_daily_reports = NO_REPORT days among EffectiveDays (BR-23, BR-24)', () => {
      expect(result.missedDailyReports).toBe(1);
    });

    it('missed_daily_memorization = NO_REPORT + ABSENT_OTHER over MemorizationExpectedDays (BR-25, BR-27)', () => {
      expect(result.missedDailyMemorization).toBe(2);
    });

    it('missed_daily_revision = NO_REPORT + ABSENT_OTHER + Normal-without-revision over EffectiveDays; REVISION never a miss (BR-47)', () => {
      expect(result.missedDailyRevision).toBe(3);
    });

    it('missed_50_repetitions = Normal days with a memo range and the 50 not completed (BR-26)', () => {
      expect(result.missed50Repetitions).toBe(1);
    });

    it('missed_single_session = Normal days with the 50 completed but split across sessions (ISS-13)', () => {
      expect(result.missedSingleSession).toBe(1);
    });
  });

  describe('each classification in isolation against an otherwise perfect week', () => {
    const perfect = DAY.map(normalFull);
    const replace = (index: number, report: DatedDailyReportSnapshot) =>
      perfect.map((r, i) => (i === index ? report : r));
    const drop = (index: number) => perfect.filter((_, i) => i !== index);

    it('a perfect week misses nothing', () => {
      expect(compute(perfect)).toEqual({
        expectedDays: 6,
        ...zeroMetrics,
        effectiveDays: 6,
        memorizationExpectedDays: 6,
        memorizationDays: 6,
        dayBreakdown: {
          normal: 6,
          revision: 0,
          absentExcused: 0,
          absentOther: 0,
          noReport: 0,
        },
      });
    });

    it('NO_REPORT counts once in reports, memorization and revision (BR-23)', () => {
      expect(compute(drop(2))).toMatchObject({
        expectedDays: 6,
        missedDailyReports: 1,
        missedDailyMemorization: 1,
        missedDailyRevision: 1,
        missed50Repetitions: 0,
        missedSingleSession: 0,
        effectiveDays: 6,
        memorizationExpectedDays: 6,
        memorizationDays: 5,
      });
    });

    it('ABSENT_EXCUSED (Sick / Studying) leaves every calculation and every denominator (BR-24)', () => {
      for (const reason of ['Sick', 'Studying'] as const) {
        expect(compute(replace(0, absent(DAY[0], reason)))).toEqual({
          expectedDays: 6,
          ...zeroMetrics,
          effectiveDays: 5,
          memorizationExpectedDays: 5,
          memorizationDays: 5,
          dayBreakdown: {
            normal: 5,
            revision: 0,
            absentExcused: 1,
            absentOther: 0,
            noReport: 0,
          },
        });
      }
    });

    it('ABSENT_OTHER is a memorization and revision miss but not a missing report (BR-25)', () => {
      expect(compute(replace(0, absent(DAY[0], 'Other')))).toMatchObject({
        missedDailyReports: 0,
        missedDailyMemorization: 1,
        missedDailyRevision: 1,
        missed50Repetitions: 0,
        missedSingleSession: 0,
        effectiveDays: 6,
        memorizationExpectedDays: 6,
        memorizationDays: 5,
      });
    });

    it('REVISION satisfies revision, excuses memorization, and stays in EffectiveDays (BR-47, DEC-A08)', () => {
      expect(compute(replace(0, revision(DAY[0])))).toEqual({
        expectedDays: 6,
        ...zeroMetrics,
        effectiveDays: 6,
        memorizationExpectedDays: 5,
        memorizationDays: 5,
        dayBreakdown: {
          normal: 5,
          revision: 1,
          absentExcused: 0,
          absentOther: 0,
          noReport: 0,
        },
      });
    });

    it('NORMAL without memorization is a memorization miss only (BR-48)', () => {
      expect(compute(replace(0, normalNoMemo(DAY[0])))).toMatchObject({
        missedDailyReports: 0,
        missedDailyMemorization: 1,
        missedDailyRevision: 0,
        missed50Repetitions: 0,
        missedSingleSession: 0,
        memorizationDays: 5,
      });
    });

    it('NORMAL without revision is a revision miss even though memorization occurred (BR-47)', () => {
      expect(compute(replace(0, normalNoRevision(DAY[0])))).toMatchObject({
        missedDailyReports: 0,
        missedDailyMemorization: 0,
        missedDailyRevision: 1,
        memorizationDays: 6,
      });
    });

    it('NORMAL with neither counts as both misses (DEC-B08)', () => {
      expect(compute(replace(0, normalNeither(DAY[0])))).toMatchObject({
        missedDailyReports: 0,
        missedDailyMemorization: 1,
        missedDailyRevision: 1,
        missed50Repetitions: 0,
        missedSingleSession: 0,
        memorizationDays: 5,
      });
    });

    it('a missed 50 repetitions is never double-counted as a missed single session (ISS-13, VR-18)', () => {
      expect(compute(replace(0, normalMissed50(DAY[0])))).toMatchObject({
        missed50Repetitions: 1,
        missedSingleSession: 0,
        memorizationDays: 6,
      });
    });

    it('split sessions after completing the 50 count once, here only', () => {
      expect(compute(replace(0, normalSplitSessions(DAY[0])))).toMatchObject({
        missed50Repetitions: 0,
        missedSingleSession: 1,
      });
    });
  });

  describe('zero-denominator case (UC-06 3a, DEC-B04)', () => {
    it('all six days excused → every metric 0, every denominator 0, expected_days still the prorated 6', () => {
      const result = compute([
        absent(DAY[0], 'Sick'),
        absent(DAY[1], 'Studying'),
        absent(DAY[2], 'Sick'),
        absent(DAY[3], 'Studying'),
        absent(DAY[4], 'Sick'),
        absent(DAY[5], 'Studying'),
      ]);
      expect(result).toEqual({
        expectedDays: 6,
        ...zeroMetrics,
        dayBreakdown: {
          normal: 0,
          revision: 0,
          absentExcused: 6,
          absentOther: 0,
          noReport: 0,
        },
      });
    });

    it('a week with zero reports is produced with every daily miss counted (FR-WR-08, DEC-A07)', () => {
      expect(compute([])).toEqual({
        expectedDays: 6,
        missedDailyReports: 6,
        missedDailyMemorization: 6,
        missedDailyRevision: 6,
        missed50Repetitions: 0,
        missedSingleSession: 0,
        effectiveDays: 6,
        memorizationExpectedDays: 6,
        memorizationDays: 0,
        dayBreakdown: {
          normal: 0,
          revision: 0,
          absentExcused: 0,
          absentOther: 0,
          noReport: 6,
        },
      });
    });
  });

  describe('day breakdown (VO-09 over ExpectedDays, APIS §10.9)', () => {
    it('tallies every classification and sums to expectedDays', () => {
      const week: DatedDailyReportSnapshot[] = [
        normalFull(DAY[0]),
        normalNoMemo(DAY[1]),
        revision(DAY[2]),
        absent(DAY[3], 'Sick'),
        absent(DAY[4], 'Other'),
        // DAY[5] left unreported.
      ];
      const result = compute(week);
      expect(result.dayBreakdown).toEqual({
        normal: 2,
        revision: 1,
        absentExcused: 1,
        absentOther: 1,
        noReport: 1,
      });
      const b = result.dayBreakdown;
      expect(
        b.normal + b.revision + b.absentExcused + b.absentOther + b.noReport,
      ).toBe(result.expectedDays);
    });

    it('keeps ABSENT_EXCUSED days visible even though they leave every metric (BR-24)', () => {
      const result = compute([absent(DAY[0], 'Studying')]);
      expect(result.effectiveDays).toBe(5);
      expect(result.dayBreakdown.absentExcused).toBe(1);
      expect(result.dayBreakdown.noReport).toBe(5);
    });

    it('never counts the recitation day, even when a report sits on it (BR-45)', () => {
      const result = compute([
        ...DAY.map(normalFull),
        normalFull(WEEK.weekEnd),
      ]);
      expect(result.dayBreakdown.normal).toBe(6);
    });
  });

  describe('expected days (SAS §18.1 ExpectedDays)', () => {
    it('always excludes the recitation day, even when a report sits on that date (BR-45)', () => {
      const result = compute([
        ...DAY.map(normalFull),
        normalFull(WEEK.weekEnd),
      ]);
      expect(result.expectedDays).toBe(6);
      expect(result.memorizationDays).toBe(6);
    });

    it('ignores reports dated outside the week', () => {
      const result = compute([
        normalFull('2026-08-28'),
        normalFull('2026-09-05'),
      ]);
      expect(result.expectedDays).toBe(6);
      expect(result.missedDailyReports).toBe(6);
    });

    it('prorates from started_at when the membership began mid-week (FR-WR-09)', () => {
      const result = compute([], { from: DAY[4], to: '2026-09-04' });
      expect(result.expectedDays).toBe(2);
      expect(result.missedDailyReports).toBe(2);
    });

    it('is 0 when the membership starts on the recitation day (EC-13)', () => {
      const result = compute([], { from: WEEK.weekEnd, to: WEEK.weekEnd });
      expect(result).toEqual({ expectedDays: 0, ...zeroMetrics });
    });

    it('truncates at the window end — a live mid-week read counts only days up to today', () => {
      // Today is Tuesday: Sat, Sun, Mon, Tue expected; Wed and Thu not yet.
      const result = compute([normalFull(DAY[0])], {
        from: '2026-08-01',
        to: DAY[3],
      });
      expect(result.expectedDays).toBe(4);
      expect(result.missedDailyReports).toBe(3);
    });

    it('truncates at archived_at / ended_at (FR-WR-10)', () => {
      const result = compute(DAY.map(normalFull), {
        from: '2026-08-01',
        to: DAY[1],
      });
      expect(result.expectedDays).toBe(2);
      expect(result.missedDailyReports).toBe(0);
    });
  });
});
