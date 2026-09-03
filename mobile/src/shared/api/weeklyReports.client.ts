import { apiClient } from './client';

/** DMS §9 `WeeklyReportState` — `Open` → `Finalised`, one-way (ST-06). */
export type WeeklyReportState = 'Open' | 'Finalised';

/**
 * API-033 `GET /weekly-reports/current` resource (`WeeklyReportLiveDto`,
 * TS §13; APIS §10.8). Computed live, never stored, until the recitation
 * day: `id` is `null` and `can_confirm` is `false` on every day except the
 * recitation day itself, when the stored `Open` row is returned.
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
export interface WeeklyReportLiveResponse {
  data: WeeklyReportLiveDto;
}

/**
 * Fetches the caller's current-week report (Student only, API-033) and
 * unwraps the APIS §9.1 envelope `{ data: {...} }`. Errors surface as
 * `ApiError` unchanged (a Student with no Active membership is a `404`).
 */
export async function getCurrentWeeklyReport(): Promise<WeeklyReportLiveDto> {
  const response = await apiClient.get<WeeklyReportLiveResponse>(
    '/weekly-reports/current',
  );
  return response.data;
}
