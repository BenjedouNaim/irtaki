import { DayCellState } from '@/shared/components/DayCell';
import { WeeklyStripDay } from '@/shared/components/WeeklyStrip';
import { WeeklyReportLiveDto } from '@/shared/api/weeklyReports.client';
import {
  addDays,
  ARABIC_WEEKDAY_LETTERS,
  ARABIC_WEEKDAYS,
  isoWeekday,
  parseIsoDate,
  toIsoDate,
} from '@/features/dailyReports/utils/arabicDate';

/**
 * The seven DayCells of the SCR-08 WeekCard, derived ONLY from what API-033
 * (F-WR-01) returns: the reporting week is `week_start … week_end` (SAS
 * §18.1: `week_end` = recitation day, `week_start` = `week_end − 6`).
 *
 * - `recitation`: the `week_end` date (the recitation day itself);
 * - `today`: the device's local date when it falls inside the week;
 * - `future`: every other day. API-033 carries only aggregate counts
 *   (`missed_daily_reports`, …), not a per-day status, so past days cannot
 *   be told apart as reported / excused / missed and render as `future`
 *   (empty) until a per-day source exists.
 *
 * Day 1 (`week_start`) is first — the strip renders it rightmost (UF §31).
 */
export function buildWeekStrip(
  report: Pick<WeeklyReportLiveDto, 'week_start' | 'week_end'>,
  todayIso: string,
): WeeklyStripDay[] {
  const start = parseIsoDate(report.week_start);
  if (!start) return [];

  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index);
    const iso = toIsoDate(date);
    const weekday = isoWeekday(date);
    let state: DayCellState = 'future';
    if (iso === report.week_end) {
      state = 'recitation';
    } else if (iso === todayIso) {
      state = 'today';
    }
    return {
      key: iso,
      day: ARABIC_WEEKDAY_LETTERS[weekday],
      state,
      accessibilityLabel: ARABIC_WEEKDAYS[weekday],
    };
  });
}

/**
 * Days with a report so far, straight from the two server counts (TS §22:
 * `missed_daily_reports` = expected days with `NO_REPORT`), clamped at 0.
 */
export function reportedDaysSoFar(
  report: Pick<WeeklyReportLiveDto, 'expected_days' | 'missed_daily_reports'>,
): number {
  return Math.max(0, report.expected_days - report.missed_daily_reports);
}
