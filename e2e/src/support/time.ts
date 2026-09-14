import { env } from './env.js';

/** Calendar parts of `date` as seen in the center's timezone. */
function partsIn(date: Date, timeZone = env.timezone): { y: number; m: number; d: number; wd: string } {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), wd: String(p.weekday) };
}

/** `YYYY-MM-DD` for today (or `date`) in the center's timezone. */
export function localDate(date: Date = new Date()): string {
  const { y, m, d } = partsIn(date);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** ISO-8601 weekday (1 = Monday … 7 = Sunday), the encoding of `groups.recitation_day`. */
export function isoWeekday(date: Date = new Date()): number {
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[partsIn(date).wd];
}

/** `YYYY-MM-DD` shifted by whole days from a `YYYY-MM-DD` string. */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** A recitation day that is guaranteed not to be today (so daily reports are allowed). */
export function notToday(offset = 3): number {
  return ((isoWeekday() - 1 + offset) % 7) + 1;
}

/** Minutes until local midnight in the center's timezone. */
export function minutesToLocalMidnight(now: Date = new Date()): number {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: env.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const [h, mi] = f.format(now).split(':').map(Number);
  return 24 * 60 - (h * 60 + mi);
}

/** `YYYY-MM-DD` shifted by whole months, clamped to the last day of the target month (ISS-14). */
export function addMonths(ymd: string, months: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}
