import { WeeklyReportState } from '../../domain/weekly-report.repository.interface';

/**
 * `WeeklyReportLiveDto` (TS §13) — the API-033 payload (APIS §10.8):
 * `{ id?, week_start, week_end, expected_days, missed_daily_reports,
 *    missed_daily_memorization, missed_daily_revision, missed_50_repetitions,
 *    missed_single_session, attended_recitation_call, state, can_confirm }`.
 * `id` is `null` and `can_confirm` is `false` on every day except the
 * recitation day itself.
 */
export interface WeeklyReportLiveDto {
  id: string | null;
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
  can_confirm: boolean;
}

/** APIS §9.1 single-resource envelope. */
export interface WeeklyReportLiveResponseDto {
  data: WeeklyReportLiveDto;
}
