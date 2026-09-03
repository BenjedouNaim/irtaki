import { WeeklyReportState } from '../domain/weekly-report.repository.interface';

/**
 * SAS §9 E-06 `finalised_by` — `Student` / `Scheduler`. The row carries the
 * confirming Student's `users.id`, NULL for the scheduler default (DBD §14);
 * the wire shape restates the SAS enum rather than exposing the user id.
 */
export type WeeklyReportFinalisedBy = 'Student' | 'Scheduler';

/**
 * `WeeklyReportDto` (TS §13) — one stored E-06 row as API-034/035/036
 * return it: the six snapshotted metrics, the attendance answer and the
 * finalisation facts. Distinct from `WeeklyReportLiveDto` (API-033), which
 * may describe a week that has no row yet and carries `can_confirm`.
 */
export interface WeeklyReportDto {
  id: string;
  /** `YYYY-MM-DD` */
  week_start: string;
  /** `YYYY-MM-DD` — the recitation-day date. */
  week_end: string;
  expected_days: number;
  missed_daily_reports: number;
  missed_daily_memorization: number;
  missed_daily_revision: number;
  missed_50_repetitions: number;
  missed_single_session: number;
  attended_recitation_call: boolean;
  state: WeeklyReportState;
  /** ISO-8601 instant; null while `Open`. */
  finalised_at: string | null;
  /** Null while `Open`. */
  finalised_by: WeeklyReportFinalisedBy | null;
}
