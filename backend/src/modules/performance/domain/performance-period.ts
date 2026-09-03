import { addMonths } from '../../reports/domain/local-date';
import { reportingWeekContaining } from '../../reports/domain/reporting-week';

/**
 * The `?period=` filter of every performance endpoint (APIS §9.3, §10.9;
 * FR-PERF-03 "Week, Month, 3 Months, Custom range"). `custom` requires
 * `from`/`to`; the other three are relative to the student's own today.
 */
export type PerformancePeriodName = 'week' | 'month' | '3months' | 'custom';

/** An inclusive `YYYY-MM-DD` calendar range — SAS §18.3's period `P`. */
export interface PerformancePeriod {
  from: string;
  to: string;
}

export interface ResolvePerformancePeriodInput {
  /** Omitted → the current reporting week (UC-07 step 1's stated default). */
  period?: PerformancePeriodName;
  /** `YYYY-MM-DD`, required (and only read) when `period = 'custom'`. */
  from?: string;
  to?: string;
  /** Today in the student's own `users.timezone` (T-01, INV-27). */
  today: string;
  /** `groups.recitation_day`, ISO day-of-week 1..7 — BR-15's week anchor. */
  recitationDay: number;
}

/**
 * Resolves `?period=` to SAS §18.3's period `P`.
 *
 * - `week` (and the default) → the VO-04 reporting week containing today
 *   (UC-07 step 1: "default is the current reporting week"), NOT a rolling
 *   seven days: §18.3 quantifies over whole reporting weeks.
 * - `month` / `3months` → the calendar window ending today, with the
 *   day-of-month clamped (§18.5's recommended convention; no document
 *   defines these two windows further).
 * - `custom` → the caller's `from`/`to` verbatim; the DTO has already
 *   rejected a `custom` without both (APIS §10.9).
 *
 * The result is still intersected with the membership's window by the
 * caller (FR-PERF-07) — this function only reads the calendar.
 */
export function resolvePerformancePeriod(
  input: ResolvePerformancePeriodInput,
): PerformancePeriod {
  switch (input.period ?? 'week') {
    case 'month':
      return { from: addMonths(input.today, -1), to: input.today };
    case '3months':
      return { from: addMonths(input.today, -3), to: input.today };
    case 'custom':
      return { from: input.from as string, to: input.to as string };
    case 'week':
    default: {
      const week = reportingWeekContaining(input.today, input.recitationDay);
      return { from: week.weekStart, to: week.weekEnd };
    }
  }
}
