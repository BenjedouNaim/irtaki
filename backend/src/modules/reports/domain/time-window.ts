import { DailyReportValidationError } from './daily-report.errors';

const HOUR_MINUTE_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * VO-03 TimeWindow (DMS §8, SAS §9.5): `[from: Time, to: Time]` with
 * `to > from` (VR-15). Local wall-clock times, no date component — carried as
 * `HH:MM` strings exactly as APIS §10.7 speaks them, so a lexical comparison
 * of the zero-padded values is the chronological one.
 *
 * Framework-free (TS §9). Equality is structural.
 */
export class TimeWindow {
  private constructor(
    public readonly from: string,
    public readonly to: string,
  ) {}

  /**
   * @param field the API field the window came from (`memo_time` / `rev_time`)
   *   — only used to address the VR-15 violation in `details[]`.
   */
  static of(from: string, to: string, field: string): TimeWindow {
    if (!TimeWindow.isHourMinute(from) || !TimeWindow.isHourMinute(to)) {
      throw new DailyReportValidationError([
        {
          field,
          rule: 'VR-15',
          message: 'يجب إدخال الوقت بصيغة ساعة:دقيقة (HH:MM)',
        },
      ]);
    }
    if (to <= from) {
      throw new DailyReportValidationError([
        {
          field,
          rule: 'VR-15',
          message: 'يجب أن يكون وقت الانتهاء بعد وقت البداية',
        },
      ]);
    }
    return new TimeWindow(from, to);
  }

  static isHourMinute(value: unknown): value is string {
    return typeof value === 'string' && HOUR_MINUTE_REGEX.test(value);
  }

  equals(other: TimeWindow): boolean {
    return this.from === other.from && this.to === other.to;
  }
}
