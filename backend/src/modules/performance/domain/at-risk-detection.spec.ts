import {
  AT_RISK_CONSECUTIVE_EXPECTED_DAYS,
  AtRiskDetectionService,
} from './at-risk-detection';

/**
 * A calendar the fixtures below read literally. Recitation day = Friday (5),
 * so every Friday is skipped and every other date is an expected day:
 *
 * ```
 * Mon 31 Aug · Tue 1 Sep · Wed 2 Sep · Thu 3 Sep · [Fri 4 Sep] · Sat 5 Sep
 * Sun 6 Sep  · Mon 7 Sep · Tue 8 Sep · Wed 9 Sep · [Fri 11 Sep]
 * ```
 */
const RECITATION_DAY = 5;
const WINDOW = { from: '2026-08-01', to: '2026-09-09' };

function evaluate(lastReportDate: string | null, window = WINDOW) {
  return AtRiskDetectionService.evaluate({
    lastReportDate,
    window,
    recitationDay: RECITATION_DAY,
  });
}

describe('DS-04 AtRiskDetectionService (SAS §18.4, DEC-B05, FR-PERF-08)', () => {
  it('uses the three-consecutive-expected-days threshold of DEC-B05', () => {
    expect(AT_RISK_CONSECUTIVE_EXPECTED_DAYS).toBe(3);
  });

  describe('3 consecutive expected days with no report → at risk', () => {
    it('flags a membership whose last report was 3 expected days ago', () => {
      // Last report Sun 6 Sep. Expected days after it: Mon 7, Tue 8, Wed 9
      // (today) — exactly three, all NO_REPORT.
      expect(evaluate('2026-09-06')).toEqual({
        atRisk: true,
        daysSinceLastReport: 3,
      });
    });

    it('keeps flagging a longer silence', () => {
      // Sat 5 Sep → Sun 6, Mon 7, Tue 8, Wed 9.
      expect(evaluate('2026-09-05')).toEqual({
        atRisk: true,
        daysSinceLastReport: 4,
      });
    });

    it('does NOT flag two consecutive misses', () => {
      // Mon 7 Sep → Tue 8, Wed 9. Two expected days is not three.
      expect(evaluate('2026-09-07')).toEqual({
        atRisk: false,
        daysSinceLastReport: 2,
      });
    });

    it('does NOT flag a membership that reported today', () => {
      expect(evaluate('2026-09-09')).toEqual({
        atRisk: false,
        daysSinceLastReport: 0,
      });
    });

    it('flags a membership that has never reported once three expected days have passed', () => {
      // Enrolled Mon 7 Sep, never reported: Mon 7, Tue 8, Wed 9.
      expect(evaluate(null, { from: '2026-09-07', to: '2026-09-09' })).toEqual({
        atRisk: true,
        daysSinceLastReport: 3,
      });
    });

    it('does NOT flag a membership younger than three expected days', () => {
      // Enrolled Tue 8 Sep, never reported: only Tue 8 and Wed 9 exist, so
      // the window does not hold the three days §18.4 quantifies over.
      expect(evaluate(null, { from: '2026-09-08', to: '2026-09-09' })).toEqual({
        atRisk: false,
        daysSinceLastReport: 2,
      });
    });
  });

  describe('an excused absence BREAKS the streak (DEC-B05, AC-15)', () => {
    /**
     * `ABSENT_EXCUSED` "counts as REPORTED and therefore BREAKS the
     * streak" — the rule AC-15 singles out. The service sees it as what it
     * is: a live E-05 row on that date, exactly like a `Normal` one.
     * `ABSENT_OTHER` breaks it identically (§18.4's third bullet).
     */
    it('resets the count to 0 on the day the excused absence was filed', () => {
      // Sick note on Wed 9 Sep (today) after a long silence.
      expect(evaluate('2026-09-09')).toEqual({
        atRisk: false,
        daysSinceLastReport: 0,
      });
    });

    it('restarts the streak from the excused day, so two later misses are not enough', () => {
      // Excused Mon 7 Sep → the streak restarts at Tue 8; Tue 8 and Wed 9
      // are two expected days, one short of the predicate.
      expect(evaluate('2026-09-07')).toEqual({
        atRisk: false,
        daysSinceLastReport: 2,
      });
    });

    it('re-flags only once three expected days have passed since the excused day', () => {
      expect(evaluate('2026-09-06')).toEqual({
        atRisk: true,
        daysSinceLastReport: 3,
      });
    });
  });

  describe('a recitation day is SKIPPED — never counted, never breaking', () => {
    it('does not count the recitation day itself towards the streak', () => {
      // Last report Thu 3 Sep. Fri 4 Sep is the recitation day: expected
      // days are Sat 5, Sun 6, Mon 7, Tue 8, Wed 9 — five, not the six
      // calendar days between them.
      expect(evaluate('2026-09-03')).toEqual({
        atRisk: true,
        daysSinceLastReport: 5,
      });
    });

    it('does not let the recitation day break a streak that spans it', () => {
      // Last report Wed 2 Sep, today Sun 6 Sep: the streak Thu 3 →
      // [Fri 4 skipped] → Sat 5 → Sun 6 is three consecutive EXPECTED days
      // even though a fourth calendar day sits in the middle of it. Were the
      // recitation day treated as a miss the count would read 4; were it
      // treated as a report it would break the streak entirely.
      const spanning = evaluate('2026-09-02', {
        from: '2026-08-01',
        to: '2026-09-06',
      });
      expect(spanning).toEqual({ atRisk: true, daysSinceLastReport: 3 });
    });

    it('keeps a two-day streak short when the recitation day falls inside it', () => {
      // Thu 3 Sep reported, today Sat 5 Sep: Fri 4 is skipped, leaving only
      // Sat 5 — one expected day, not two, and certainly not three.
      expect(
        evaluate('2026-09-03', { from: '2026-08-01', to: '2026-09-04' }),
      ).toEqual({ atRisk: false, daysSinceLastReport: 0 });
      expect(
        evaluate('2026-09-03', { from: '2026-08-01', to: '2026-09-05' }),
      ).toEqual({ atRisk: false, daysSinceLastReport: 1 });
    });

    it('skips several recitation days across a long silence', () => {
      // Last report Fri 7 Aug (a recitation day it could never carry, kept
      // only to prove the arithmetic): 8 Aug … 9 Sep is 33 calendar days
      // containing Fridays 14, 21, 28 Aug and 4 Sep → 29 expected days.
      expect(evaluate('2026-08-07')).toEqual({
        atRisk: true,
        daysSinceLastReport: 29,
      });
    });
  });

  describe('EffectiveWindow bounds (SAS §18.1, FR-WR-09/10)', () => {
    it('never looks before the membership started', () => {
      // A report predating the window does not extend it backwards.
      expect(
        evaluate('2026-06-01', { from: '2026-09-08', to: '2026-09-09' }),
      ).toEqual({ atRisk: false, daysSinceLastReport: 2 });
    });

    it('stops at an archived group’s last day rather than at today', () => {
      // Window truncated at Sun 6 Sep (group archived): only Sat 5 and
      // Sun 6 follow the last report, so the membership is not at risk even
      // though three calendar days have passed since.
      expect(
        evaluate('2026-09-03', { from: '2026-08-01', to: '2026-09-06' }),
      ).toEqual({ atRisk: false, daysSinceLastReport: 2 });
    });
  });
});
