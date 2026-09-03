/**
 * Arabic date copy for the Student screens (Figma "الأربعاء 3 سبتمبر",
 * "أسبوع 28 أوت — 3 سبتمبر"). Dates on the wire are plain `YYYY-MM-DD`
 * already resolved against `User.timezone` (APIS §"Clock"), so they are
 * read as calendar dates — never re-interpreted through a timezone. Western
 * numerals throughout (UF §31).
 */

/** ISO-8601 day-of-week names, index 1 = Monday … 7 = Sunday (DBD DB-CHK-20). */
export const ARABIC_WEEKDAYS: Record<number, string> = {
  1: 'الاثنين',
  2: 'الثلاثاء',
  3: 'الأربعاء',
  4: 'الخميس',
  5: 'الجمعة',
  6: 'السبت',
  7: 'الأحد',
};

/** Single-letter day markers of the Figma WeeklyStrip, keyed like `ARABIC_WEEKDAYS`. */
export const ARABIC_WEEKDAY_LETTERS: Record<number, string> = {
  1: 'ن',
  2: 'ث',
  3: 'ر',
  4: 'خ',
  5: 'ج',
  6: 'س',
  7: 'ح',
};

/** Tunisian month names, index 1 = January. */
export const ARABIC_MONTHS: Record<number, string> = {
  1: 'جانفي',
  2: 'فيفري',
  3: 'مارس',
  4: 'أفريل',
  5: 'ماي',
  6: 'جوان',
  7: 'جويلية',
  8: 'أوت',
  9: 'سبتمبر',
  10: 'أكتوبر',
  11: 'نوفمبر',
  12: 'ديسمبر',
};

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses `YYYY-MM-DD`; `null` for anything else (the caller falls back to the raw string). */
export function parseIsoDate(iso: string): CalendarDate | null {
  const match = ISO_DATE.exec(iso);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

export function toIsoDate(date: CalendarDate): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(
    date.day,
  ).padStart(2, '0')}`;
}

/** ISO day of week (1 = Monday … 7 = Sunday) of a calendar date. */
export function isoWeekday(date: CalendarDate): number {
  const day = new Date(date.year, date.month - 1, date.day).getDay();
  return day === 0 ? 7 : day;
}

/** The calendar date `days` days after `date` (local calendar arithmetic). */
export function addDays(date: CalendarDate, days: number): CalendarDate {
  const d = new Date(date.year, date.month - 1, date.day + days);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

/** "الأربعاء 3 سبتمبر" — falls back to the raw string when not `YYYY-MM-DD`. */
export function formatArabicDate(iso: string): string {
  const date = parseIsoDate(iso);
  if (!date) return iso;
  return `${ARABIC_WEEKDAYS[isoWeekday(date)]} ${date.day} ${
    ARABIC_MONTHS[date.month]
  }`;
}

/** "3 سبتمبر" */
export function formatArabicDayMonth(iso: string): string {
  const date = parseIsoDate(iso);
  if (!date) return iso;
  return `${date.day} ${ARABIC_MONTHS[date.month]}`;
}

/**
 * "أسبوع 28 أوت — 3 سبتمبر", collapsing the month when both ends share it
 * ("أسبوع 21 — 27 أوت").
 */
export function formatArabicWeekRange(
  startIso: string,
  endIso: string,
): string {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  if (!start || !end) return `أسبوع ${startIso} — ${endIso}`;
  if (start.month === end.month && start.year === end.year) {
    return `أسبوع ${start.day} — ${end.day} ${ARABIC_MONTHS[end.month]}`;
  }
  return `أسبوع ${start.day} ${ARABIC_MONTHS[start.month]} — ${end.day} ${
    ARABIC_MONTHS[end.month]
  }`;
}

/** "HH:MM" (device local time) of an ISO-8601 instant; empty when unparsable. */
export function formatLocalTime(instant: string): string {
  const d = new Date(instant);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`;
}

/** "السبت 27 أوت 20:05" (device local) of an ISO-8601 instant. */
export function formatLocalDateTime(instant: string): string {
  const d = new Date(instant);
  if (Number.isNaN(d.getTime())) return instant;
  const date: CalendarDate = {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
  };
  return `${ARABIC_WEEKDAYS[isoWeekday(date)]} ${date.day} ${
    ARABIC_MONTHS[date.month]
  } ${formatLocalTime(instant)}`;
}

/** "05:50 — 06:40" from an `HH:MM` window. */
export function formatTimeWindow(from: string, to: string): string {
  return `${from} — ${to}`;
}

/** Greeting by local hour — "صباح الخير" before noon, "مساء الخير" after. */
export function greetingForHour(hour: number): string {
  return hour < 12 ? 'صباح الخير' : 'مساء الخير';
}
