/**
 * Calendar-date helpers for the Reports module (SAS §19, DMS §18.3).
 *
 * `User.timezone` is the single authority for every day-boundary evaluation
 * (T-01, INV-27, DEC-B03): "today" is the student's local calendar date, never
 * the server's. All instants stay UTC — only dates are timezone-derived (T-04).
 *
 * Framework-free (TS §9): relies on `Intl` only.
 */

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The calendar date (`YYYY-MM-DD`) of `now` in the given IANA timezone.
 * Throws a RangeError for an unrecognised timezone identifier — the value is
 * validated at write time (VR-28) so this is a programming error, not input.
 */
export function localDateInTimezone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const pick = (type: 'year' | 'month' | 'day'): string =>
    parts.find((p) => p.type === type)?.value ?? '';

  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

/**
 * ISO-8601 day of week (1 = Monday … 7 = Sunday) of a `YYYY-MM-DD` calendar
 * date, matching `groups.recitation_day` (DBD DBT-02: "ISO day-of-week").
 */
export function isoDayOfWeek(isoDate: string): number {
  if (!ISO_DATE_REGEX.test(isoDate)) {
    throw new RangeError(`Invalid ISO calendar date: ${isoDate}`);
  }
  const [year, month, day] = isoDate.split('-').map(Number);
  // UTC arithmetic on a date-only value: no DST or offset can interfere.
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday
  return jsDay === 0 ? 7 : jsDay;
}

/**
 * The `YYYY-MM-DD` calendar date `days` days after (negative: before)
 * `isoDate`. UTC arithmetic on a date-only value — no DST or offset can
 * interfere. Used for reporting-week boundaries (VO-04: `start = end − 6`).
 */
export function addDays(isoDate: string, days: number): string {
  if (!ISO_DATE_REGEX.test(isoDate)) {
    throw new RangeError(`Invalid ISO calendar date: ${isoDate}`);
  }
  const [year, month, day] = isoDate.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(
    shifted.getUTCDate(),
  )}`;
}
