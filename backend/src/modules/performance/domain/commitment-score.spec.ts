import type { WeeklyMetrics } from '../../reports/domain/weekly-metrics-calculator';
import { CommitmentScoreCalculator } from './commitment-score';

/**
 * One reporting week's metrics. Defaults are an EMPTY week — every
 * denominator zero — so each test states only the numbers it exercises.
 */
function week(overrides: Partial<WeeklyMetrics> = {}): WeeklyMetrics {
  return {
    expectedDays: 0,
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
    ...overrides,
  };
}

/** A full six-day week with nothing missed — every component at 100. */
const perfectWeek = week({
  expectedDays: 6,
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

describe('DS-03 CommitmentScoreCalculator (SAS §18.3, DMS §21)', () => {
  describe('the four components', () => {
    it('computes each rate as the complement of its weekly miss over its own denominator', () => {
      const score = CommitmentScoreCalculator.calculate({
        weeks: [
          week({
            effectiveDays: 10,
            memorizationExpectedDays: 8,
            missedDailyReports: 2, //  8/10 → 80
            missedDailyMemorization: 2, //  6/8  → 75
            missedDailyRevision: 5, //  5/10 → 50
          }),
        ],
        weekCount: 4,
        attendedWeeks: 3, //  3/4  → 75
      });

      expect(score.submissionRate).toBe(80);
      expect(score.memorizationRate).toBe(75);
      expect(score.revisionRate).toBe(50);
      expect(score.attendanceRate).toBe(75);
    });

    it('sums the denominators across every week of the period (D_eff, D_memo)', () => {
      const score = CommitmentScoreCalculator.calculate({
        weeks: [
          week({ effectiveDays: 6, memorizationExpectedDays: 6 }),
          week({
            effectiveDays: 4,
            memorizationExpectedDays: 4,
            missedDailyReports: 5,
            missedDailyMemorization: 5,
          }),
        ],
        weekCount: 2,
        attendedWeeks: 2,
      });

      // 10 effective days, 5 missed → 50 %; the same for memorization.
      expect(score.submissionRate).toBe(50);
      expect(score.memorizationRate).toBe(50);
    });

    it('keeps REVISION days in the revision denominator without ever counting them as a miss (BR-47)', () => {
      // A week of six revision days: effectiveDays 6, memorizationExpected 0.
      const score = CommitmentScoreCalculator.calculate({
        weeks: [week({ expectedDays: 6, effectiveDays: 6 })],
        weekCount: 1,
        attendedWeeks: 1,
      });

      expect(score.revisionRate).toBe(100);
      // D_memo is empty — memorization is UNDEFINED, not 0 (BR-27, DEC-B04).
      expect(score.memorizationRate).toBeNull();
    });
  });

  describe('nullability — DEC-B04 / API-X07, never 0 when undefined', () => {
    it('returns null for submission and revision when D_eff is empty', () => {
      const score = CommitmentScoreCalculator.calculate({
        weeks: [week({ expectedDays: 3 })], // three excused days: D_eff = 0
        weekCount: 1,
        attendedWeeks: 0,
      });

      expect(score.submissionRate).toBeNull();
      expect(score.revisionRate).toBeNull();
    });

    it('returns null for memorization when D_memo is empty', () => {
      const score = CommitmentScoreCalculator.calculate({
        weeks: [week({ effectiveDays: 5, memorizationExpectedDays: 0 })],
        weekCount: 1,
        attendedWeeks: 1,
      });

      expect(score.memorizationRate).toBeNull();
      expect(score.submissionRate).toBe(100);
    });

    it('returns null for attendance when W(P) is empty', () => {
      const score = CommitmentScoreCalculator.calculate({
        weeks: [perfectWeek],
        weekCount: 0,
        attendedWeeks: 0,
      });

      expect(score.attendanceRate).toBeNull();
    });

    it('distinguishes an undefined attendance rate from a real 0 %', () => {
      const undefinedRate = CommitmentScoreCalculator.calculate({
        weeks: [],
        weekCount: 0,
        attendedWeeks: 0,
      });
      const zeroRate = CommitmentScoreCalculator.calculate({
        weeks: [],
        weekCount: 4,
        attendedWeeks: 0,
      });

      expect(undefinedRate.attendanceRate).toBeNull();
      expect(zeroRate.attendanceRate).toBe(0);
    });

    it('returns a null score when no component is defined', () => {
      const score = CommitmentScoreCalculator.calculate({
        weeks: [],
        weekCount: 0,
        attendedWeeks: 0,
      });

      expect(score).toEqual({
        submissionRate: null,
        memorizationRate: null,
        revisionRate: null,
        attendanceRate: null,
        value: null,
      });
    });
  });

  describe('the mean', () => {
    it('averages the four defined components', () => {
      const score = CommitmentScoreCalculator.calculate({
        weeks: [
          week({
            effectiveDays: 10,
            memorizationExpectedDays: 10,
            missedDailyReports: 1, // 90
            missedDailyMemorization: 2, // 80
            missedDailyRevision: 3, // 70
          }),
        ],
        weekCount: 10,
        attendedWeeks: 6, // 60
      });

      expect(score.value).toBe((90 + 80 + 70 + 60) / 4);
    });

    it('divides by |defined| only — an undefined component is EXCLUDED, never coerced to 0', () => {
      const score = CommitmentScoreCalculator.calculate({
        weeks: [
          week({
            effectiveDays: 10,
            memorizationExpectedDays: 0, // memorization undefined
            missedDailyReports: 2, // 80
            missedDailyRevision: 4, // 60
          }),
        ],
        weekCount: 2,
        attendedWeeks: 1, // 50
      });

      expect(score.memorizationRate).toBeNull();
      expect(score.value).toBe((80 + 60 + 50) / 3);
      // Coercing the missing component to 0 would give 47.5 — the DEC-B04
      // failure mode that "punishes a legitimately sick student".
      expect(score.value).not.toBe((80 + 60 + 50 + 0) / 4);
    });

    it('is the single component itself when only one is defined', () => {
      const score = CommitmentScoreCalculator.calculate({
        weeks: [],
        weekCount: 5,
        attendedWeeks: 2,
      });

      expect(score.value).toBe(40);
    });

    it('is 100 for a perfect period', () => {
      const score = CommitmentScoreCalculator.calculate({
        weeks: [perfectWeek, perfectWeek],
        weekCount: 2,
        attendedWeeks: 2,
      });

      expect(score.value).toBe(100);
    });
  });

  describe('repetitionQuality (standalone, never folded into the score)', () => {
    it('divides completed-50 days by the days memorization actually happened', () => {
      expect(
        CommitmentScoreCalculator.repetitionQuality([
          week({ memorizationDays: 8, missed50Repetitions: 2 }),
          week({ memorizationDays: 2, missed50Repetitions: 0 }),
        ]),
      ).toBe(80);
    });

    it('is null — not 0 — when no memorization happened in the period', () => {
      expect(
        CommitmentScoreCalculator.repetitionQuality([
          week({ effectiveDays: 6, memorizationDays: 0 }),
        ]),
      ).toBeNull();
    });

    it('is 0 when memorization happened and the 50 repetitions never did', () => {
      expect(
        CommitmentScoreCalculator.repetitionQuality([
          week({ memorizationDays: 4, missed50Repetitions: 4 }),
        ]),
      ).toBe(0);
    });

    it('stays out of the commitment score (SAS §18.3 design intent)', () => {
      const weeks = [week({ memorizationDays: 4, missed50Repetitions: 4 })];
      const score = CommitmentScoreCalculator.calculate({
        weeks,
        weekCount: 1,
        attendedWeeks: 1,
      });

      expect(CommitmentScoreCalculator.repetitionQuality(weeks)).toBe(0);
      // Attendance is the only defined component; the 0 % quality does not
      // drag the mean down.
      expect(score.value).toBe(100);
    });
  });

  describe('dayBreakdown', () => {
    it('sums each classification across every week of the period', () => {
      const breakdown = CommitmentScoreCalculator.dayBreakdown([
        week({
          expectedDays: 6,
          dayBreakdown: {
            normal: 3,
            revision: 1,
            absentExcused: 1,
            absentOther: 0,
            noReport: 1,
          },
        }),
        week({
          expectedDays: 6,
          dayBreakdown: {
            normal: 2,
            revision: 0,
            absentExcused: 0,
            absentOther: 2,
            noReport: 2,
          },
        }),
      ]);

      expect(breakdown).toEqual({
        normal: 5,
        revision: 1,
        absentExcused: 1,
        absentOther: 2,
        noReport: 3,
      });
      expect(
        breakdown.normal +
          breakdown.revision +
          breakdown.absentExcused +
          breakdown.absentOther +
          breakdown.noReport,
      ).toBe(12);
    });

    it('is all zeros for an empty period', () => {
      expect(CommitmentScoreCalculator.dayBreakdown([])).toEqual({
        normal: 0,
        revision: 0,
        absentExcused: 0,
        absentOther: 0,
        noReport: 0,
      });
    });
  });

  it('is pure — the same input yields the same result and mutates nothing', () => {
    const weeks = [perfectWeek];
    const first = CommitmentScoreCalculator.calculate({
      weeks,
      weekCount: 1,
      attendedWeeks: 1,
    });
    const second = CommitmentScoreCalculator.calculate({
      weeks,
      weekCount: 1,
      attendedWeeks: 1,
    });

    expect(second).toEqual(first);
    expect(weeks[0]).toEqual(perfectWeek);
  });
});
