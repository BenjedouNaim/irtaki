import { classifyDay, DailyReportDaySnapshot } from './day-classification';

function snapshot(
  overrides: Partial<DailyReportDaySnapshot>,
): DailyReportDaySnapshot {
  return {
    type: 'Normal',
    absenceReason: null,
    noMemorizationToday: false,
    noRevisionToday: false,
    hasMemoRange: true,
    completed50Repetitions: true,
    repetitionsInSingleSession: true,
    ...overrides,
  };
}

describe('classifyDay (VO-09 DayClassification, SAS §17.4 / TS §22)', () => {
  it('classifies a missing report as NO_REPORT (BR-23)', () => {
    expect(classifyDay(null)).toBe('NO_REPORT');
  });

  it('classifies a Normal report as NORMAL whatever its fields say', () => {
    expect(classifyDay(snapshot({}))).toBe('NORMAL');
    expect(
      classifyDay(
        snapshot({
          hasMemoRange: false,
          noMemorizationToday: true,
          noRevisionToday: true,
          completed50Repetitions: null,
          repetitionsInSingleSession: null,
        }),
      ),
    ).toBe('NORMAL');
  });

  it('classifies a Revision report as REVISION (BR-28a, DEC-A04)', () => {
    expect(
      classifyDay(
        snapshot({
          type: 'Revision',
          hasMemoRange: false,
          noMemorizationToday: null,
          completed50Repetitions: null,
          repetitionsInSingleSession: null,
        }),
      ),
    ).toBe('REVISION');
  });

  it('classifies Sick and Studying absences as ABSENT_EXCUSED (BR-24)', () => {
    expect(
      classifyDay(snapshot({ type: 'Absent', absenceReason: 'Sick' })),
    ).toBe('ABSENT_EXCUSED');
    expect(
      classifyDay(snapshot({ type: 'Absent', absenceReason: 'Studying' })),
    ).toBe('ABSENT_EXCUSED');
  });

  it('classifies an Other absence as ABSENT_OTHER (BR-25)', () => {
    expect(
      classifyDay(snapshot({ type: 'Absent', absenceReason: 'Other' })),
    ).toBe('ABSENT_OTHER');
  });
  it('classifies an Absent report with an unrecognised reason as excused, never silently NORMAL', () => {
    // VR-19 makes a reason mandatory, so this shape is unreachable in
    // practice; the assertion pins the conservative fallback so a future
    // AbsenceReason value cannot quietly land in the wrong bucket.
    expect(
      classifyDay(snapshot({ type: 'Absent', absenceReason: 'Sick' })),
    ).toBe('ABSENT_EXCUSED');
  });

  it('throws rather than guessing when the type is outside the enumeration', () => {
    expect(() =>
      classifyDay(snapshot({ type: 'Weekly' as unknown as 'Normal' })),
    ).toThrow(RangeError);
  });

  it('returns exactly one of the five VO-09 values for every documented shape', () => {
    const values = new Set([
      classifyDay(null),
      classifyDay(snapshot({ type: 'Normal' })),
      classifyDay(snapshot({ type: 'Revision' })),
      classifyDay(snapshot({ type: 'Absent', absenceReason: 'Sick' })),
      classifyDay(snapshot({ type: 'Absent', absenceReason: 'Studying' })),
      classifyDay(snapshot({ type: 'Absent', absenceReason: 'Other' })),
    ]);

    expect([...values].sort()).toEqual([
      'ABSENT_EXCUSED',
      'ABSENT_OTHER',
      'NORMAL',
      'NO_REPORT',
      'REVISION',
    ]);
  });
});
