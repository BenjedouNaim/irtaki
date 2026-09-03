import {
  addDays,
  daysBetween,
  isoDayOfWeek,
} from '../../reports/domain/local-date';
import type { EffectiveWindow } from '../../reports/domain/weekly-metrics-calculator';

export interface DaysSinceLastReportInput {
  /** `YYYY-MM-DD` of the membership's newest live report; null when none. */
  lastReportDate: string | null;
  /** `EffectiveWindow(m)` — SAS §18.1, already timezone-resolved. */
  window: EffectiveWindow;
  /** `groups.recitation_day`, ISO day-of-week 1..7. */
  recitationDay: number;
}

/**
 * Count of dates in the inclusive range whose ISO day-of-week equals
 * `dayOfWeek`. O(1) — no day-by-day walk, so an unbounded custom range
 * cannot turn into an unbounded loop.
 */
function countWeekdayOccurrences(
  from: string,
  to: string,
  dayOfWeek: number,
): number {
  const first = addDays(from, (dayOfWeek - isoDayOfWeek(from) + 7) % 7);
  if (first > to) {
    return 0;
  }
  return Math.floor(daysBetween(first, to) / 7) + 1;
}

/**
 * `days_since_last_report` (APIS §10.9) — "the same expected-day counting
 * as `AtRisk`, not raw calendar days, so the two dashboards can never
 * disagree" (SAS §18.4, TS §24, closing CON-07).
 *
 * `ExpectedDays(m, w)` is every day of a reporting week except its
 * recitation day, intersected with `EffectiveWindow(m)` (SAS §18.1), so
 * across weeks the expected days are exactly the dates inside the window
 * whose ISO day-of-week is not the group's recitation day. This counts
 * those that fall strictly after the last report — every one of them
 * classifies as `NO_REPORT` by construction, which is the streak the
 * at-risk predicate walks backwards from today.
 *
 * Pure and framework-free (TS §9). Today counts when today is an expected
 * day and today's report is not in yet — the reading that makes "red at
 * ≥3" (UF §17) coincide with the three-day predicate of §18.4.
 */
export function countExpectedDaysSinceLastReport(
  input: DaysSinceLastReportInput,
): number {
  const from =
    input.lastReportDate !== null &&
    addDays(input.lastReportDate, 1) > input.window.from
      ? addDays(input.lastReportDate, 1)
      : input.window.from;
  const to = input.window.to;
  if (from > to) {
    return 0;
  }
  const calendarDays = daysBetween(from, to) + 1;
  return calendarDays - countWeekdayOccurrences(from, to, input.recitationDay);
}
