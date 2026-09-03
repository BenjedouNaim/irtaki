import { apiClient } from './client';

/**
 * `?period=` on every performance endpoint (APIS §9.3, §10.9; FR-PERF-03
 * "Week, Month, 3 Months, Custom range"). `custom` REQUIRES `from`/`to`.
 */
export type PerformancePeriod = 'week' | 'month' | '3months' | 'custom';

/** VO-09 day tally over the period's expected days — the SCR-13 donut. */
export interface PerformanceDayBreakdownDto {
  normal: number;
  revision: number;
  absent_excused: number;
  absent_other: number;
  no_report: number;
}

/**
 * API-037 `GET /me/performance?period=` resource (`PerformanceDto`, TS §13;
 * APIS §10.9).
 *
 * EVERY rate is nullable and is `null` — never `0` — when its denominator is
 * empty (DEC-B04 / API-X07). `null` renders as "بيانات غير كافية", never as
 * `0%` (UF §17). `repetition_quality` is a standalone indicator, deliberately
 * NOT folded into `commitment_score` (SAS §18.3).
 */
export interface PerformanceDto {
  commitment_score: number | null;
  submission_rate: number | null;
  memorization_rate: number | null;
  revision_rate: number | null;
  attendance_rate: number | null;
  repetition_quality: number | null;
  day_breakdown: PerformanceDayBreakdownDto;
  /** Expected days since the last report — not raw calendar days (SAS §18.4). */
  days_since_last_report: number;
}

/** APIS §9.1 single-resource envelope. */
export interface PerformanceResponse {
  data: PerformanceDto;
}

export interface PerformanceParams {
  period?: PerformancePeriod;
  /** `YYYY-MM-DD`; sent (and required by the API) only for `custom`. */
  from?: string;
  to?: string;
}

function toQuery(params: PerformanceParams): Record<string, string> {
  return {
    ...(params.period ? { period: params.period } : {}),
    ...(params.period === 'custom' && params.from ? { from: params.from } : {}),
    ...(params.period === 'custom' && params.to ? { to: params.to } : {}),
  };
}

/**
 * Fetches the caller's own commitment score and breakdown (Student only,
 * API-037) and unwraps the APIS §9.1 envelope `{ data: {...} }`. Errors
 * surface as `ApiError` unchanged — a Student with no Active membership is
 * a `404`, exactly as on `GET /me/progress`.
 */
export async function getMyPerformance(
  params: PerformanceParams = {},
): Promise<PerformanceDto> {
  const response = await apiClient.get<PerformanceResponse>('/me/performance', {
    params: toQuery(params),
  });
  return response.data;
}
