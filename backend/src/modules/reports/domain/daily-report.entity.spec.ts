import { AyahRange } from '../../progress/domain/ayah-range';
import { SurahOrdinalInfo } from '../../progress/domain/ayah-position';
import { DailyReport, SubmitDailyReportProps } from './daily-report.entity';
import { DailyReportValidationError } from './daily-report.errors';
import { TimeWindow } from './time-window';

const surahs: SurahOrdinalInfo[] = [
  { number: 1, ayahCount: 7, ordinalOffset: 0 },
  { number: 2, ayahCount: 286, ordinalOffset: 7 },
];

const memoRange = AyahRange.fromSurahAyah(
  { surah: 2, ayah: 1 },
  { surah: 2, ayah: 20 },
  surahs,
);
const revRange = AyahRange.fromSurahAyah(
  { surah: 1, ayah: 1 },
  { surah: 1, ayah: 7 },
  surahs,
);
const memoTime = TimeWindow.of('18:00', '18:45', 'memo_time');
const revTime = TimeWindow.of('19:00', '19:10', 'rev_time');

const base = {
  membershipId: 'membership-1',
  reportDate: '2026-09-02',
  submittedAt: new Date('2026-09-02T08:30:00.000Z'),
  submittedTimezone: 'Africa/Tunis',
};

function details(props: SubmitDailyReportProps) {
  try {
    DailyReport.submit(props);
  } catch (err) {
    if (err instanceof DailyReportValidationError) {
      return err.details;
    }
    throw err;
  }
  return null;
}

describe('DailyReport (E-05) constructor rules', () => {
  describe('Normal', () => {
    it('accepts a full report and derives the no_* flags from range presence', () => {
      const report = DailyReport.submit({
        ...base,
        type: 'Normal',
        memoRange,
        memoTime,
        completed50Repetitions: true,
        repetitionsInSingleSession: true,
        revRange,
        revTime,
        readTafsir: false,
      });

      expect(report.type).toBe('Normal');
      expect(report.noMemorizationToday).toBe(false);
      expect(report.noRevisionToday).toBe(false);
      expect(report.memoRange).toBe(memoRange);
      expect(report.revTime).toBe(revTime);
      expect(report.completed50Repetitions).toBe(true);
      expect(report.repetitionsInSingleSession).toBe(true);
      expect(report.readTafsir).toBe(false);
      expect(report.absenceReason).toBeNull();
      expect(Object.isFrozen(report)).toBe(true);
    });

    it('accepts a report with neither range (BR-48) — a miss on both, not an error', () => {
      const report = DailyReport.submit({ ...base, type: 'Normal' });

      expect(report.noMemorizationToday).toBe(true);
      expect(report.noRevisionToday).toBe(true);
      expect(report.memoRange).toBeNull();
      expect(report.memoTime).toBeNull();
      expect(report.completed50Repetitions).toBeNull();
      expect(report.repetitionsInSingleSession).toBeNull();
      expect(report.revRange).toBeNull();
      expect(report.revTime).toBeNull();
      expect(report.readTafsir).toBeNull();
    });

    it('requires memo_time when memo_range is present (VR-16)', () => {
      expect(
        details({
          ...base,
          type: 'Normal',
          memoRange,
          completed50Repetitions: false,
        }),
      ).toEqual([
        expect.objectContaining({ field: 'memo_time', rule: 'VR-16' }),
      ]);
    });

    it('forbids memo_time without memo_range (VR-16)', () => {
      expect(details({ ...base, type: 'Normal', memoTime })).toEqual([
        expect.objectContaining({ field: 'memo_time', rule: 'VR-16' }),
      ]);
    });

    it('requires completed_50_repetitions when memo_range is present', () => {
      expect(details({ ...base, type: 'Normal', memoRange, memoTime })).toEqual(
        [expect.objectContaining({ field: 'completed_50_repetitions' })],
      );
    });

    it('rejects repetitions_in_single_session=true when the 50 repetitions were not completed (VR-18)', () => {
      expect(
        details({
          ...base,
          type: 'Normal',
          memoRange,
          memoTime,
          completed50Repetitions: false,
          repetitionsInSingleSession: true,
        }),
      ).toEqual([
        expect.objectContaining({
          field: 'repetitions_in_single_session',
          rule: 'VR-18',
        }),
      ]);
    });

    it('forces repetitions_in_single_session to false when the 50 repetitions were not completed (VR-18)', () => {
      const report = DailyReport.submit({
        ...base,
        type: 'Normal',
        memoRange,
        memoTime,
        completed50Repetitions: false,
      });
      expect(report.repetitionsInSingleSession).toBe(false);
    });

    it('requires repetitions_in_single_session when the 50 repetitions were completed (VR-18)', () => {
      expect(
        details({
          ...base,
          type: 'Normal',
          memoRange,
          memoTime,
          completed50Repetitions: true,
        }),
      ).toEqual([
        expect.objectContaining({
          field: 'repetitions_in_single_session',
          rule: 'VR-18',
        }),
      ]);
    });

    it('forbids repetition flags without memo_range', () => {
      expect(
        details({ ...base, type: 'Normal', completed50Repetitions: true }),
      ).toEqual([
        expect.objectContaining({
          field: 'completed_50_repetitions',
          rule: 'E-05',
        }),
      ]);
    });

    it('requires rev_time iff rev_range (VR-17)', () => {
      expect(details({ ...base, type: 'Normal', revRange })).toEqual([
        expect.objectContaining({ field: 'rev_time', rule: 'VR-17' }),
      ]);
      expect(details({ ...base, type: 'Normal', revTime })).toEqual([
        expect.objectContaining({ field: 'rev_time', rule: 'VR-17' }),
      ]);
    });

    it('forbids absence_reason on a Normal report', () => {
      expect(
        details({ ...base, type: 'Normal', absenceReason: 'Sick' }),
      ).toEqual([
        expect.objectContaining({ field: 'absence_reason', rule: 'E-05' }),
      ]);
    });
  });

  describe('Absent', () => {
    it('accepts a reason and nulls every other group', () => {
      const report = DailyReport.submit({
        ...base,
        type: 'Absent',
        absenceReason: 'Studying',
      });
      expect(report.absenceReason).toBe('Studying');
      expect(report.noMemorizationToday).toBeNull();
      expect(report.noRevisionToday).toBeNull();
      expect(report.memoRange).toBeNull();
      expect(report.revRange).toBeNull();
      expect(report.readTafsir).toBeNull();
    });

    it('requires absence_reason (VR-19)', () => {
      expect(details({ ...base, type: 'Absent' })).toEqual([
        expect.objectContaining({ field: 'absence_reason', rule: 'VR-19' }),
      ]);
    });

    it('forbids memorisation, revision and tafsir fields', () => {
      const result = details({
        ...base,
        type: 'Absent',
        absenceReason: 'Sick',
        memoRange,
        revRange,
        readTafsir: true,
      });
      expect(result?.map((d) => d.field)).toEqual([
        'memo_range',
        'rev_range',
        'read_tafsir',
      ]);
      expect(result?.every((d) => d.rule === 'E-05')).toBe(true);
    });
  });

  describe('Revision', () => {
    it('accepts rev_range + rev_time and sets no_revision_today=false', () => {
      const report = DailyReport.submit({
        ...base,
        type: 'Revision',
        revRange,
        revTime,
      });
      expect(report.revRange).toBe(revRange);
      expect(report.revTime).toBe(revTime);
      expect(report.noRevisionToday).toBe(false);
      expect(report.noMemorizationToday).toBeNull();
      expect(report.readTafsir).toBeNull();
      expect(report.absenceReason).toBeNull();
    });

    it('requires rev_range (VR-20) and rev_time (VR-17)', () => {
      expect(details({ ...base, type: 'Revision' })).toEqual([
        expect.objectContaining({ field: 'rev_range', rule: 'VR-20' }),
        expect.objectContaining({ field: 'rev_time', rule: 'VR-17' }),
      ]);
    });

    it('forbids memorisation, repetition, tafsir and absence fields (UF §15)', () => {
      const result = details({
        ...base,
        type: 'Revision',
        revRange,
        revTime,
        memoRange,
        memoTime,
        completed50Repetitions: true,
        readTafsir: true,
        absenceReason: 'Other',
      });
      expect(result?.map((d) => d.field)).toEqual([
        'absence_reason',
        'memo_range',
        'memo_time',
        'completed_50_repetitions',
        'read_tafsir',
      ]);
    });
  });

  it('rejects an unknown type', () => {
    expect(details({ ...base, type: 'Weekly' as unknown as 'Normal' })).toEqual(
      [expect.objectContaining({ field: 'type' })],
    );
  });
  describe('INV-12 — a submitted report is never modified or deleted (BR-22)', () => {
    const report = DailyReport.submit({
      ...base,
      type: 'Normal',
      memoRange,
      memoTime,
      completed50Repetitions: true,
      repetitionsInSingleSession: true,
      revRange,
      revTime,
      readTafsir: true,
    });

    it('is frozen — ST-05 is terminal on creation', () => {
      expect(Object.isFrozen(report)).toBe(true);
    });

    it.each([
      'membershipId',
      'reportDate',
      'type',
      'memoRange',
      'memoTime',
      'completed50Repetitions',
      'repetitionsInSingleSession',
      'revRange',
      'revTime',
      'readTafsir',
      'absenceReason',
      'noMemorizationToday',
      'noRevisionToday',
      'submittedAt',
      'submittedTimezone',
    ])('throws on a write to %s and leaves the value intact', (field) => {
      const before = (report as unknown as Record<string, unknown>)[field];

      expect(() => {
        (report as unknown as Record<string, unknown>)[field] = 'tampered';
      }).toThrow(TypeError);

      expect((report as unknown as Record<string, unknown>)[field]).toBe(
        before,
      );
    });

    it('accepts no new property either — the shape is sealed', () => {
      expect(() => {
        (report as unknown as Record<string, unknown>).amended = true;
      }).toThrow(TypeError);
      expect(
        (report as unknown as Record<string, unknown>).amended,
      ).toBeUndefined();
    });

    it('offers no amend, correct or delete transition on the surface', () => {
      const surface = [
        ...Object.getOwnPropertyNames(Object.getPrototypeOf(report)),
        ...Object.getOwnPropertyNames(report),
      ];

      for (const forbidden of [
        'amend',
        'correct',
        'edit',
        'update',
        'delete',
        'softDelete',
      ]) {
        expect(surface).not.toContain(forbidden);
      }
    });

    it('carries the submitting timezone with the row, so the date is auditable (INV-27)', () => {
      expect(report.submittedTimezone).toBe('Africa/Tunis');
      expect(report.reportDate).toBe('2026-09-02');
    });
  });
});
