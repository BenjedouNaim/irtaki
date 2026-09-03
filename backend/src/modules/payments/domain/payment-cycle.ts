import { addDays } from '../../reports/domain/local-date';

/**
 * VO-05 `PaymentCycle` (DMS §8.4/§23, SAS §18.5) — one 3-month billing
 * period, derived arithmetically from `Membership.started_at` and never
 * stored (ADR-006): only *paid* cycles produce a `payment_records` row.
 *
 * Framework-free (TS §9); calendar arithmetic only — the `addDays` helper
 * is the Reports module's `LocalDate` primitive, reused rather than
 * duplicated.
 */

/** BR-31 — the fee is a fixed 3-month cycle, identical for every student. */
export const PAYMENT_CYCLE_MONTHS = 3;

/** BR-31 / DB-CHK-17 — 30 TND per cycle, fixed for MVP. */
export const PAYMENT_CYCLE_AMOUNT = 30;

/** BR-33 / FR-PAY-04 — `Due Soon` opens 10 days before the cycle end. */
export const DUE_SOON_WINDOW_DAYS = 10;

/** SRS enum, unchanged: arrears are a count, not a fourth value (BR-55). */
export type PaymentCycleStatus = 'Paid' | 'Due Soon' | 'Unpaid';

export interface PaymentCycle {
  /** 0-based (DBD `payment_records.cycle_index`, DB-CHK-18). */
  index: number;
  /** `YYYY-MM-DD` */
  startDate: string;
  /** `YYYY-MM-DD` */
  endDate: string;
}

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function parseIsoDate(isoDate: string): [number, number, number] {
  if (!ISO_DATE_REGEX.test(isoDate)) {
    throw new RangeError(`Invalid ISO calendar date: ${isoDate}`);
  }
  const [year, month, day] = isoDate.split('-').map(Number);
  return [year, month, day];
}

/** Days in a 1-based (year, month) — day 0 of the next month, in UTC. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * `isoDate` shifted by whole calendar months, **clamped** to the last valid
 * day of the target month (ISS-14, resolved: clamp, never roll forward).
 * 30 November + 3 months is 28 February in a common year and 29 February in
 * a leap year — never 1 or 2 March.
 *
 * The shift is always measured from the original date, so a clamp never
 * accumulates: 30 Nov + 3 = 28 Feb, but 30 Nov + 6 = 30 May.
 */
export function addMonthsClamped(isoDate: string, months: number): string {
  const [year, month, day] = parseIsoDate(isoDate);
  const monthsFromYearZero = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(monthsFromYearZero / 12);
  const targetMonth = monthsFromYearZero - targetYear * 12 + 1;
  const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return `${targetYear}-${pad(targetMonth)}-${pad(clampedDay)}`;
}

/** `C0 + 3i months` (SAS §18.5), clamped per ISS-14. */
export function cycleStartDate(startedAt: string, index: number): string {
  return addMonthsClamped(startedAt, PAYMENT_CYCLE_MONTHS * index);
}

/**
 * `C0 + 3(i+1) months − 1 day` (SAS §18.5): the day before the next cycle
 * starts, so consecutive cycles are contiguous and never overlap even when
 * one end of the pair was clamped.
 */
export function cycleEndDate(startedAt: string, index: number): string {
  return addDays(cycleStartDate(startedAt, index + 1), -1);
}

export function paymentCycle(startedAt: string, index: number): PaymentCycle {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError(
      `Cycle index must be a non-negative integer: ${index}`,
    );
  }
  return {
    index,
    startDate: cycleStartDate(startedAt, index),
    endDate: cycleEndDate(startedAt, index),
  };
}
