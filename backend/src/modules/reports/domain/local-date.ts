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

/** Days in `month` (1-12) of `year`, Gregorian, leap years included. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * The `YYYY-MM-DD` calendar date `months` months after (negative: before)
 * `isoDate`, clamping the day to the last valid day of the target month —
 * the convention SAS §18.5 recommends for the same calendar arithmetic
 * (⚠️ ISS-14 leaves it formally open there; it is chosen here only for the
 * relative `month` / `3months` performance windows, which no document
 * defines otherwise, and never for a payment cycle boundary).
 *
 * `addMonths('2026-03-31', -1) = '2026-02-28'`.
 */
export function addMonths(isoDate: string, months: number): string {
  if (!ISO_DATE_REGEX.test(isoDate)) {
    throw new RangeError(`Invalid ISO calendar date: ${isoDate}`);
  }
  const [year, month, day] = isoDate.split('-').map(Number);
  const shifted = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(shifted / 12);
  const targetMonth = shifted - targetYear * 12 + 1;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${targetYear}-${pad(targetMonth)}-${pad(
    Math.min(day, daysInMonth(targetYear, targetMonth)),
  )}`;
}

/**
 * Whole days from `from` to `to` (`to − from`), negative when `to` precedes
 * `from`. UTC arithmetic on date-only values — no DST or offset interferes.
 */
export function daysBetween(from: string, to: string): number {
  if (!ISO_DATE_REGEX.test(from) || !ISO_DATE_REGEX.test(to)) {
    throw new RangeError(`Invalid ISO calendar date: ${from}..${to}`);
  }
  const utc = (iso: string): number => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

/**
 * Minutes since local midnight (0..1439) of `now` in the given IANA
 * timezone — the wall-clock half of `localDateInTimezone`, kept in the same
 * file so `Intl`'s timezone conversion has exactly one home in the codebase.
 *
 * ADR-030's scheduler filters on this: a single 15-minute tick decides, per
 * row, whether THAT user's local clock has just reached the job's boundary
 * (student-local 20:00 for FR-NOTIF-02's reminder, local midnight for a day
 * boundary). Throws a RangeError for an unrecognised timezone identifier,
 * exactly as `localDateInTimezone` does.
 */
export function localMinutesInTimezone(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const pick = (type: 'hour' | 'minute'): number =>
    Number(parts.find((p) => p.type === type)?.value ?? NaN);

  const hour = pick('hour');
  const minute = pick('minute');
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new RangeError(`Invalid IANA timezone: ${timeZone}`);
  }
  return hour * 60 + minute;
}

/**
 * True when `now`, in `timeZone`, falls inside the `[boundaryMinutes,
 * boundaryMinutes + windowMinutes)` bucket of the local day — the ADR-030
 * "filtered to local HH:MM" predicate, with the window set to the tick's
 * own period so every local boundary is caught exactly once per local day.
 */
export function isWithinLocalWindow(
  now: Date,
  timeZone: string,
  boundaryMinutes: number,
  windowMinutes: number,
): boolean {
  const minutes = localMinutesInTimezone(now, timeZone);
  return (
    minutes >= boundaryMinutes && minutes < boundaryMinutes + windowMinutes
  );
}
