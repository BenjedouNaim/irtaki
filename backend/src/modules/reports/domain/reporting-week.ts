import { addDays, isoDayOfWeek } from './local-date';

/**
 * VO-04 ReportingWeek (DMS §8, SAS §18.1): "the 7-day window a Weekly
 * Report summarises — `end_date` is a recitation-day date; `start = end − 6`".
 * BR-15: the reporting week runs from the day after one recitation day
 * through the next recitation day inclusive.
 *
 * Structural value object, framework-free (TS §9). Both dates are
 * `YYYY-MM-DD` calendar dates in the student's timezone (DEC-B03).
 */
export interface ReportingWeek {
  weekStart: string;
  /** The recitation-day date (E-06 `week_end`). */
  weekEnd: string;
}

/**
 * `ReportingWeek(group g, date d)` (SAS §18.1):
 *   week_end   = the date of the recitation day of the week containing d
 *   week_start = week_end − 6 days
 *
 * "The week containing d" is BR-15's window, so `week_end` is the first
 * date ≥ `d` whose ISO day-of-week is the group's `recitation_day` — `d`
 * itself when `d` IS the recitation day. Never independently created:
 * fully determined by (recitation day, any date within it) (DMS VO-04).
 */
export function reportingWeekContaining(
  date: string,
  recitationDay: number,
): ReportingWeek {
  if (
    !Number.isInteger(recitationDay) ||
    recitationDay < 1 ||
    recitationDay > 7
  ) {
    throw new RangeError(`Invalid ISO recitation day: ${recitationDay}`);
  }
  const today = isoDayOfWeek(date);
  const daysUntilRecitation = (recitationDay - today + 7) % 7;
  const weekEnd = addDays(date, daysUntilRecitation);
  return { weekStart: addDays(weekEnd, -6), weekEnd };
}
