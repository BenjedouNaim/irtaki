import type { AbsenceReason, DailyReportType } from './daily-report.entity';

/**
 * VO-09 DayClassification (DMS §8, SAS §17.4 / §18): "the single input to
 * every weekly metric" — exactly one value per (Membership, date), a pure
 * classification result that is never stored (DBD §21).
 */
export type DayClassification =
  'NO_REPORT' | 'NORMAL' | 'REVISION' | 'ABSENT_EXCUSED' | 'ABSENT_OTHER';

/**
 * The slice of one live E-05 row that `classify()` and the six weekly
 * metrics read (SAS §18.2 inputs). Ranges appear only as presence
 * (`hasMemoRange`) — ordinals never enter the calculation.
 */
export interface DailyReportDaySnapshot {
  type: DailyReportType;
  absenceReason: AbsenceReason | null;
  noMemorizationToday: boolean | null;
  noRevisionToday: boolean | null;
  hasMemoRange: boolean;
  completed50Repetitions: boolean | null;
  repetitionsInSingleSession: boolean | null;
}

/**
 * `classify(m, d) → DayClassification` (TS §22, SAS §18.1):
 *  - no live report for the date → `NO_REPORT` (BR-23; never excused by a
 *    revision period, BR-28a)
 *  - `Normal`   → `NORMAL`
 *  - `Revision` → `REVISION` (the day IS within a Revision Period, DEC-A04)
 *  - `Absent`, reason `Sick` / `Studying` → `ABSENT_EXCUSED` (BR-24)
 *  - `Absent`, reason `Other`            → `ABSENT_OTHER` (BR-25)
 */
export function classifyDay(
  report: DailyReportDaySnapshot | null,
): DayClassification {
  if (report === null) {
    return 'NO_REPORT';
  }
  switch (report.type) {
    case 'Normal':
      return 'NORMAL';
    case 'Revision':
      return 'REVISION';
    case 'Absent':
      return report.absenceReason === 'Other'
        ? 'ABSENT_OTHER'
        : 'ABSENT_EXCUSED';
    default:
      throw new RangeError(`Unknown daily report type: ${String(report.type)}`);
  }
}
