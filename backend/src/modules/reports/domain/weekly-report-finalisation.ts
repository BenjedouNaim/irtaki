import { localDateInTimezone } from './local-date';

/**
 * ST-06 `Open → Finalised` guards (SAS §11, DMS E-06), as pure predicates
 * over calendar dates in the student's timezone (T-01, INV-27, DEC-B03).
 * Framework-free (TS §9); shared by the Student path (API-034, VR-21) and
 * the Scheduler path (DS-02, FR-WR-06) so both agree, to the instant, on
 * where "the recitation day" ends.
 *
 * `weekEnd` is E-06 `week_end` — "the recitation day's date" (DBD DBT-07).
 */

/**
 * VR-21 — "Submission permitted only on the group's recitation day, in the
 * student's timezone": the student's local calendar date IS `week_end`.
 */
export function isRecitationDayOf(
  weekEnd: string,
  now: Date,
  timezone: string,
): boolean {
  return localDateInTimezone(now, timezone) === weekEnd;
}

/**
 * FR-WR-06 / AC-12 — the week is overdue once student-local midnight of the
 * recitation day has passed: the local calendar date is strictly after
 * `week_end` (ISO `YYYY-MM-DD` strings compare lexically as dates). Holds
 * for any later date too, so a missed tick is caught up on the next run
 * (SAS §19.6, EC-24/EC-39) and never becomes confirmable again (BR-30).
 */
export function hasRecitationDayPassed(
  weekEnd: string,
  now: Date,
  timezone: string,
): boolean {
  return localDateInTimezone(now, timezone) > weekEnd;
}
