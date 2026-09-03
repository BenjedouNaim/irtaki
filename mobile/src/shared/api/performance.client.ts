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

/**
 * Fetches ONE student's dashboard (API-039) and unwraps the APIS §9.1
 * envelope. The payload is `PerformanceDto` verbatim — APIS §10.9: "same
 * shape as `/me/performance`" — so SCR-24 renders it with SCR-13's own
 * components.
 *
 * Reachable by a Teacher on an assigned group, the Admin, or the Student on
 * their OWN membership (APIS §6.1). Errors surface as `ApiError` unchanged:
 * an out-of-scope membership is a `403 SCOPE_DENIED`, which navigation never
 * offers (UF §8/§24).
 */
export async function getMembershipPerformance(
  membershipId: string,
  params: PerformanceParams = {},
): Promise<PerformanceDto> {
  const response = await apiClient.get<PerformanceResponse>(
    `/memberships/${membershipId}/performance`,
    { params: toQuery(params) },
  );
  return response.data;
}

/** One row of API-038's weakest-first student list. */
export interface GroupStudentPerformanceDto {
  membership_id: string;
  /** Null when the student never completed their profile — never "". */
  full_name: string | null;
  /** Null renders "بيانات غير كافية", never `0%` (DEC-B04, UF §17). */
  commitment_score: number | null;
}

/** The AbsenceReason tally over the period (VR-19: Sick / Studying / Other). */
export interface GroupAbsenceBreakdownDto {
  sick: number;
  studying: number;
  other: number;
}

/**
 * API-038 `GET /groups/{id}/performance?period=` resource
 * (`GroupPerformanceDto`, TS §13; APIS §10.9).
 *
 * The `students` array arrives ALREADY ordered weakest-first and with the
 * FR-PERF-09/10 member set already applied — UF §17: "Historical periods
 * incl. removed students · rendered as returned, the server already applies
 * FR-PERF-09/10". The client never re-sorts and never re-filters it.
 */
export interface GroupPerformanceDto {
  commitment_average: number | null;
  students: GroupStudentPerformanceDto[];
  absence_breakdown: GroupAbsenceBreakdownDto;
  submission_rate: number | null;
}

/** APIS §9.1 single-resource envelope. */
export interface GroupPerformanceResponse {
  data: GroupPerformanceDto;
}

/**
 * Fetches a group's performance dashboard (Teacher on an assigned group or
 * Admin, API-038) and unwraps the APIS §9.1 envelope. Errors surface as
 * `ApiError` unchanged — an out-of-scope group is a `403 SCOPE_DENIED`,
 * which navigation never offers (UF §24).
 */
export async function getGroupPerformance(
  groupId: string,
  params: PerformanceParams = {},
): Promise<GroupPerformanceDto> {
  const response = await apiClient.get<GroupPerformanceResponse>(
    `/groups/${groupId}/performance`,
    { params: toQuery(params) },
  );
  return response.data;
}
