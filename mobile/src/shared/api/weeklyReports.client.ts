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

/**
 * SAS §9 E-06 `finalised_by` — `Student` / `Scheduler`; null while `Open`.
 */
export type WeeklyReportFinalisedBy = 'Student' | 'Scheduler';

/**
 * One stored E-06 row as API-034/035/036 return it (`WeeklyReportDto`,
 * TS §13): the six snapshotted metrics, the attendance answer and the
 * finalisation facts. Unlike `WeeklyReportLiveDto` it always has an `id`
 * and carries no `can_confirm`.
 */
export interface WeeklyReportDto {
  id: string;
  week_start: string;
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
  finalised_by: WeeklyReportFinalisedBy | null;
}

/** API-034 `POST /weekly-reports/{id}/confirm` request body (APIS §10.8). */
export interface ConfirmWeeklyReportPayload {
  attended_recitation_call: boolean;
}

/** APIS §9.1 single-resource envelope. */
export interface ConfirmWeeklyReportResponse {
  data: WeeklyReportDto;
}

/**
 * Confirms recitation attendance and finalises the week (Student only,
 * API-034), unwrapping the APIS §9.1 envelope. Errors surface as `ApiError`
 * unchanged: `422 NOT_RECITATION_DAY` (VR-21), `409 ALREADY_FINALISED`
 * (VR-36), `403 SCOPE_DENIED` for anyone else's report.
 */
export async function confirmWeeklyReport(
  reportId: string,
  payload: ConfirmWeeklyReportPayload,
): Promise<WeeklyReportDto> {
  const response = await apiClient.post<ConfirmWeeklyReportResponse>(
    `/weekly-reports/${encodeURIComponent(reportId)}/confirm`,
    payload,
  );
  return response.data;
}

/**
 * Query of the weekly history lists — API-035 `GET /weekly-reports` (and
 * API-036 `GET /memberships/{id}/weekly-reports`, "same pagination/scope
 * pattern", APIS §10.8): APIS §9.2 cursor params, §9.3 `from`/`to` as
 * `YYYY-MM-DD` on `week_start`. SCR-14 sends no date filter (UF §15: "no
 * date-range filter control despite API support") — the fields mirror the
 * contract, not a screen.
 */
export interface WeeklyReportListParams {
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

/** APIS §9.1 collection envelope — cursor block, no totals. */
export interface WeeklyReportListResponse {
  data: WeeklyReportDto[];
  pagination: {
    next_cursor: string | null;
    has_more: boolean;
  };
}

function toListQuery(
  params: WeeklyReportListParams,
): Record<string, string | number> {
  return {
    ...(params.from ? { from: params.from } : {}),
    ...(params.to ? { to: params.to } : {}),
    ...(params.cursor ? { cursor: params.cursor } : {}),
    ...(params.limit !== undefined ? { limit: params.limit } : {}),
  };
}

/**
 * Fetches one page of the caller's own weekly report history (Student
 * only, API-035), `week_start DESC`. Returns the whole `{ data, pagination }`
 * envelope because the cursor block is part of the resource the list
 * screen consumes (APIS §9.2). Errors surface as `ApiError` unchanged.
 */
export async function listOwnWeeklyReports(
  params: WeeklyReportListParams = {},
): Promise<WeeklyReportListResponse> {
  return apiClient.get<WeeklyReportListResponse>('/weekly-reports', {
    params: toListQuery(params),
  });
}
