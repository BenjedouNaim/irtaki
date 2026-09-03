import {
  PaymentCycleDto,
  PaymentCycleStatus,
} from '@/shared/api/payments.client';
import { CycleStatus } from '@/shared/components/CycleRow';
import {
  ARABIC_MONTHS,
  formatArabicDayMonth,
  formatArabicFullDate,
  parseIsoDate,
} from '@/features/dailyReports/utils/arabicDate';

/**
 * BR-31 — the fee is a fixed, public 30 TND per 3-month cycle, so the
 * arrears total is client-side arithmetic on a known constant (UF §18);
 * the API deliberately returns no money amount.
 */
export const CYCLE_AMOUNT_TND = 30;

/** Figma SCR-16 subtitle of an unpaid cycle row. */
export const CYCLE_AMOUNT_LABEL = `${CYCLE_AMOUNT_TND} دينار`;

/** API status → the Figma CycleRow.Status variant of the shared component. */
export const CYCLE_STATUS_VARIANT: Record<PaymentCycleStatus, CycleStatus> = {
  Paid: 'paid',
  'Due Soon': 'dueSoon',
  Unpaid: 'unpaid',
};

/**
 * "الدورة 3 · 1 جوان — 30 جوان" (Figma). The cycle number is the 0-based
 * `index` presented 1-based, since no reader counts a first cycle as zero.
 * The year is added on both ends only when the cycle crosses one, where
 * bare day/month would be ambiguous.
 */
export function formatCycleTitle(cycle: PaymentCycleDto): string {
  const start = parseIsoDate(cycle.start_date);
  const end = parseIsoDate(cycle.end_date);
  const range =
    start && end && start.year !== end.year
      ? `${formatArabicFullDate(cycle.start_date)} — ${formatArabicFullDate(
          cycle.end_date,
        )}`
      : `${formatArabicDayMonth(cycle.start_date)} — ${formatArabicDayMonth(
          cycle.end_date,
        )}`;
  return `الدورة ${cycle.index + 1} · ${range}`;
}

/** "دُفعت في 12 جوان 2026" on a Paid cycle, the fixed fee otherwise (Figma). */
export function formatCycleSubtitle(cycle: PaymentCycleDto): string {
  if (cycle.status === 'Paid' && cycle.paid_at) {
    return `دُفعت في ${formatArabicInstantDate(cycle.paid_at)}`;
  }
  return CYCLE_AMOUNT_LABEL;
}

/** "12 جوان 2026" from an ISO-8601 instant, read in the device calendar. */
export function formatArabicInstantDate(instant: string): string {
  const d = new Date(instant);
  if (Number.isNaN(d.getTime())) return instant;
  return `${d.getDate()} ${ARABIC_MONTHS[d.getMonth() + 1]} ${d.getFullYear()}`;
}

/**
 * "3 دورات غير مدفوعة — الإجمالي 90 دينارًا" (Figma arrears banner, UF §18).
 * The count agrees in Arabic number: singular, dual, then the plural forms.
 */
export function formatArrearsMessage(arrearsCount: number): string {
  const total = arrearsCount * CYCLE_AMOUNT_TND;
  return `${describeUnpaidCycles(arrearsCount)} — الإجمالي ${total} دينارًا`;
}

function describeUnpaidCycles(count: number): string {
  if (count === 1) return 'دورة واحدة غير مدفوعة';
  if (count === 2) return 'دورتان غير مدفوعتان';
  if (count <= 10) return `${count} دورات غير مدفوعة`;
  return `${count} دورة غير مدفوعة`;
}

/**
 * SCR-20's row subtitle, "الدورة الحالية · 30 سبتمبر" (Figma 36:459): the
 * label plus the current cycle's end date. The year is added when the cycle
 * ends in another year, where a bare day/month would be ambiguous.
 */
export function formatCurrentCycleSubtitle(cycle: PaymentCycleDto): string {
  const start = parseIsoDate(cycle.start_date);
  const end = parseIsoDate(cycle.end_date);
  const endLabel =
    start && end && start.year !== end.year
      ? formatArabicFullDate(cycle.end_date)
      : formatArabicDayMonth(cycle.end_date);
  return `الدورة الحالية · ${endLabel}`;
}

/** SCR-20's arrears badge, "3 متأخرة" (Figma 36:466). */
export function formatArrearsBadgeLabel(arrearsCount: number): string {
  return `${arrearsCount} متأخرة`;
}

/**
 * SCR-20's group-selector subtitle, "18 طالبًا · 4 متابعات" (Figma 36:435):
 * how many students the ledger holds and how many of them carry arrears.
 * Both halves agree in Arabic number.
 */
export function formatGroupLedgerSummary(
  studentCount: number,
  followUpCount: number,
): string {
  return `${describeStudents(studentCount)} · ${describeFollowUps(followUpCount)}`;
}

function describeStudents(count: number): string {
  if (count === 0) return 'لا طلاب';
  if (count === 1) return 'طالب واحد';
  if (count === 2) return 'طالبان';
  if (count <= 10) return `${count} طلاب`;
  return `${count} طالبًا`;
}

function describeFollowUps(count: number): string {
  if (count === 0) return 'لا متابعات';
  if (count === 1) return 'متابعة واحدة';
  if (count === 2) return 'متابعتان';
  if (count <= 10) return `${count} متابعات`;
  return `${count} متابعة`;
}
