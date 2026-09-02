import {
  buildSubmitPayload,
  DailyReportFormValues,
  EMPTY_FORM_VALUES,
  isDailyReportType,
  isFormComplete,
  localTodayIsoDate,
  timeWindowError,
  TIME_ORDER_MESSAGE,
} from '../dailyReportForm';

const memoRange = { from: { surah: 2, ayah: 1 }, to: { surah: 2, ayah: 20 } };
const revRange = { from: { surah: 1, ayah: 1 }, to: { surah: 1, ayah: 7 } };

function values(
  partial: Partial<DailyReportFormValues>,
): DailyReportFormValues {
  return { ...EMPTY_FORM_VALUES, ...partial };
}

describe('dailyReportForm utils (SCR-10)', () => {
  describe('localTodayIsoDate', () => {
    it('formats the device-local calendar date as YYYY-MM-DD', () => {
      expect(localTodayIsoDate(new Date(2026, 8, 2, 23, 59))).toBe(
        '2026-09-02',
      );
      expect(localTodayIsoDate(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05');
    });
  });

  describe('isDailyReportType', () => {
    it('accepts only the three APIS types', () => {
      expect(isDailyReportType('Normal')).toBe(true);
      expect(isDailyReportType('Absent')).toBe(true);
      expect(isDailyReportType('Revision')).toBe(true);
      expect(isDailyReportType('Weekly')).toBe(false);
      expect(isDailyReportType(undefined)).toBe(false);
    });
  });

  describe('timeWindowError (VR-15 client nudge)', () => {
    it('flags to <= from once both are set, and nothing while incomplete', () => {
      expect(timeWindowError({ from: '18:00', to: '18:00' })).toBe(
        TIME_ORDER_MESSAGE,
      );
      expect(timeWindowError({ from: '18:30', to: '18:00' })).toBe(
        TIME_ORDER_MESSAGE,
      );
      expect(timeWindowError({ from: '18:00', to: '18:45' })).toBeUndefined();
      expect(timeWindowError({ from: '18:00', to: null })).toBeUndefined();
    });
  });

  describe('isFormComplete (UF §15 "submit disabled until minimum fields")', () => {
    it('Absent needs a reason', () => {
      expect(isFormComplete('Absent', values({}))).toBe(false);
      expect(
        isFormComplete('Absent', values({ absence_reason: 'Other' })),
      ).toBe(true);
    });

    it('Revision needs range and an ordered time window', () => {
      expect(isFormComplete('Revision', values({ rev_range: revRange }))).toBe(
        false,
      );
      expect(
        isFormComplete(
          'Revision',
          values({
            rev_range: revRange,
            rev_time: { from: '19:00', to: '18:00' },
          }),
        ),
      ).toBe(false);
      expect(
        isFormComplete(
          'Revision',
          values({
            rev_range: revRange,
            rev_time: { from: '19:00', to: '19:10' },
          }),
        ),
      ).toBe(true);
    });

    it('Normal needs both gates answered; both "No" is complete (BR-48)', () => {
      expect(isFormComplete('Normal', values({}))).toBe(false);
      expect(isFormComplete('Normal', values({ memoGate: 'no' }))).toBe(false);
      expect(
        isFormComplete('Normal', values({ memoGate: 'no', revGate: 'no' })),
      ).toBe(true);
    });

    it('Normal with memorisation needs range, time, the 50-reps answer and, only when Yes, the single-session answer', () => {
      const base = values({ memoGate: 'yes', revGate: 'no' });
      expect(isFormComplete('Normal', base)).toBe(false);
      const withRange = {
        ...base,
        memo_range: memoRange,
        memo_time: { from: '18:00', to: '18:45' },
      };
      expect(isFormComplete('Normal', withRange)).toBe(false);
      expect(
        isFormComplete('Normal', {
          ...withRange,
          completed_50_repetitions: false,
        }),
      ).toBe(true);
      expect(
        isFormComplete('Normal', {
          ...withRange,
          completed_50_repetitions: true,
        }),
      ).toBe(false);
      expect(
        isFormComplete('Normal', {
          ...withRange,
          completed_50_repetitions: true,
          repetitions_in_single_session: false,
        }),
      ).toBe(true);
    });

    it('Normal with revision needs range and time', () => {
      const base = values({ memoGate: 'no', revGate: 'yes' });
      expect(isFormComplete('Normal', base)).toBe(false);
      expect(
        isFormComplete('Normal', {
          ...base,
          rev_range: revRange,
          rev_time: { from: '19:00', to: '19:10' },
        }),
      ).toBe(true);
    });
  });

  describe('buildSubmitPayload (APIS §10.7 field table)', () => {
    it('Absent sends the reason only', () => {
      expect(
        buildSubmitPayload(
          'Absent',
          values({ absence_reason: 'Sick' }),
          '2026-09-02',
        ),
      ).toEqual({
        type: 'Absent',
        report_date: '2026-09-02',
        absence_reason: 'Sick',
      });
    });

    it('Revision sends rev_range + rev_time only', () => {
      expect(
        buildSubmitPayload(
          'Revision',
          values({
            rev_range: revRange,
            rev_time: { from: '19:00', to: '19:10' },
          }),
          '2026-09-02',
        ),
      ).toEqual({
        type: 'Revision',
        report_date: '2026-09-02',
        rev_range: revRange,
        rev_time: { from: '19:00', to: '19:10' },
      });
    });

    it('Normal with both gates "No" sends nothing but the type (BR-48)', () => {
      expect(
        buildSubmitPayload(
          'Normal',
          values({ memoGate: 'no', revGate: 'no' }),
          '2026-09-02',
        ),
      ).toEqual({ type: 'Normal', report_date: '2026-09-02' });
    });

    it('Normal sends each opted-in section, omits single-session unless the 50 reps were completed (VR-18), and tafsir only when answered', () => {
      const full = values({
        memoGate: 'yes',
        memo_range: memoRange,
        memo_time: { from: '18:00', to: '18:45' },
        completed_50_repetitions: true,
        repetitions_in_single_session: true,
        revGate: 'yes',
        rev_range: revRange,
        rev_time: { from: '19:00', to: '19:10' },
        read_tafsir: false,
      });
      expect(buildSubmitPayload('Normal', full, '2026-09-02')).toEqual({
        type: 'Normal',
        report_date: '2026-09-02',
        memo_range: memoRange,
        memo_time: { from: '18:00', to: '18:45' },
        completed_50_repetitions: true,
        repetitions_in_single_session: true,
        rev_range: revRange,
        rev_time: { from: '19:00', to: '19:10' },
        read_tafsir: false,
      });

      const noFifty = buildSubmitPayload(
        'Normal',
        { ...full, completed_50_repetitions: false, read_tafsir: null },
        '2026-09-02',
      );
      expect(noFifty).not.toHaveProperty('repetitions_in_single_session');
      expect(noFifty).not.toHaveProperty('read_tafsir');
      expect(noFifty).toMatchObject({ completed_50_repetitions: false });
    });

    it('a section answered "No" is dropped even if stale values remain from an earlier "Yes"', () => {
      const payload = buildSubmitPayload(
        'Normal',
        values({
          memoGate: 'no',
          memo_range: memoRange,
          memo_time: { from: '18:00', to: '18:45' },
          completed_50_repetitions: true,
          revGate: 'no',
          rev_range: revRange,
        }),
        '2026-09-02',
      );
      expect(payload).toEqual({ type: 'Normal', report_date: '2026-09-02' });
    });
  });
});
