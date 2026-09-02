import { apiClient } from './client';

/** APIS §10.7 `block_reason` enumeration — exact wire values. */
export type DailyReportBlockReason =
  | 'already_submitted'
  | 'recitation_day'
  | 'group_archived'
  | 'membership_inactive';

export type DailyReportType = 'Normal' | 'Absent' | 'Revision';
export type AbsenceReason = 'Sick' | 'Studying' | 'Other';

export interface AyahPositionRef {
  surah: number;
  ayah: number;
}

export interface AyahRangeDto {
  from: AyahPositionRef;
  to: AyahPositionRef;
}

export interface TimeWindowDto {
  /** `HH:MM` */
  from: string;
  to: string;
}

/**
 * One E-05 DailyReport as the API returns it (`DailyReportDto`, TS §13):
 * APIS §10.7 field names, surah/ayah ranges (never ordinals, APIS §11),
 * type-conditional groups `null` when not populated.
 */
export interface DailyReportDto {
  id: string;
  report_date: string;
  type: DailyReportType;
  submitted_at: string;
  submitted_timezone: string;
  no_memorization_today: boolean | null;
  memo_range: AyahRangeDto | null;
  memo_time: TimeWindowDto | null;
  completed_50_repetitions: boolean | null;
  repetitions_in_single_session: boolean | null;
  no_revision_today: boolean | null;
  rev_range: AyahRangeDto | null;
  rev_time: TimeWindowDto | null;
  read_tafsir: boolean | null;
  absence_reason: AbsenceReason | null;
}

/**
 * API-029 `GET /daily-reports/today` resource (APIS §10.7):
 * `{ can_submit, block_reason?, existing_report? }`. The server always
 * states the reason — the client never infers it (SAS §23 API-05).
 */
export interface TodayReportStatusDto {
  can_submit: boolean;
  block_reason?: DailyReportBlockReason;
  existing_report?: DailyReportDto;
}

/** APIS §9.1 single-resource envelope. */
export interface TodayReportStatusResponse {
  data: TodayReportStatusDto;
}

/**
 * Fetches whether the caller can submit today's report (Student only, API-029)
 * and unwraps the APIS §9.1 envelope `{ data: {...} }`.
 */
export async function getTodayReportStatus(): Promise<TodayReportStatusDto> {
  const response = await apiClient.get<TodayReportStatusResponse>(
    '/daily-reports/today',
  );
  return response.data;
}

/**
 * API-030 `POST /daily-reports` request body — a discriminated union on
 * `type` per the APIS §10.7 field table. `report_date` is the student-local
 * `YYYY-MM-DD` the form was opened for; the server answers `422 BACKDATED`
 * when it is no longer today (VR-10, no grace period).
 */
interface SubmitDailyReportBase {
  report_date: string;
}

export interface SubmitNormalDailyReportPayload extends SubmitDailyReportBase {
  type: 'Normal';
  memo_range?: AyahRangeDto;
  /** Required iff `memo_range` (VR-16). */
  memo_time?: TimeWindowDto;
  /** Required iff `memo_range`. */
  completed_50_repetitions?: boolean;
  /** Only `true` if `completed_50_repetitions` (VR-18). */
  repetitions_in_single_session?: boolean;
  rev_range?: AyahRangeDto;
  /** Required iff `rev_range` (VR-17). */
  rev_time?: TimeWindowDto;
  /** Informational only (ISS-12). */
  read_tafsir?: boolean;
}

export interface SubmitAbsentDailyReportPayload extends SubmitDailyReportBase {
  type: 'Absent';
  absence_reason: AbsenceReason;
}

export interface SubmitRevisionDailyReportPayload extends SubmitDailyReportBase {
  type: 'Revision';
  rev_range: AyahRangeDto;
  rev_time: TimeWindowDto;
}

export type SubmitDailyReportPayload =
  | SubmitNormalDailyReportPayload
  | SubmitAbsentDailyReportPayload
  | SubmitRevisionDailyReportPayload;

/**
 * API-030 `201` resource (APIS §10.7): the post-submission `ahzab_completed`
 * (the coverage merge ran synchronously server-side) and whether it ran.
 */
export interface SubmitDailyReportResultDto {
  id: string;
  report_date: string;
  type: DailyReportType;
  ahzab_completed: number | null;
  coverage_updated: boolean;
}

/** APIS §9.1 single-resource envelope. */
export interface SubmitDailyReportResponse {
  data: SubmitDailyReportResultDto;
}

/**
 * Submits today's report (Student only, API-030) and unwraps the APIS §9.1
 * envelope. Errors surface as `ApiError` unchanged — a `409 DUPLICATE_REPORT`
 * carries `existingReport` (APIQ-09) and is the caller's to treat as success.
 */
export async function submitDailyReport(
  payload: SubmitDailyReportPayload,
): Promise<SubmitDailyReportResultDto> {
  const response = await apiClient.post<SubmitDailyReportResponse>(
    '/daily-reports',
    payload,
  );
  return response.data;
}

/**
 * Query of both daily-report history lists — API-031 `GET /daily-reports`
 * and API-032 `GET /memberships/{id}/daily-reports` share it (APIS §10.7
 * "same shape"): APIS §9.2 cursor params, §9.3 `from`/`to` as `YYYY-MM-DD`.
 * Neither SCR-14 nor SCR-25 sends a date filter (UF §15: "no date-range
 * filter control despite API support") — the fields exist so the client
 * mirrors the contract, not because a screen uses them.
 */
export interface DailyReportListParams {
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

/** APIS §9.1 collection envelope — cursor block, no totals. */
export interface DailyReportListResponse {
  data: DailyReportDto[];
  pagination: {
    next_cursor: string | null;
    has_more: boolean;
  };
}

/** API-031 names kept for the own-history callers; same shapes as above. */
export type ListOwnDailyReportsParams = DailyReportListParams;
export type ListOwnDailyReportsResponse = DailyReportListResponse;

function toListQuery(
  params: DailyReportListParams,
): Record<string, string | number> {
  return {
    ...(params.from ? { from: params.from } : {}),
    ...(params.to ? { to: params.to } : {}),
    ...(params.cursor ? { cursor: params.cursor } : {}),
    ...(params.limit !== undefined ? { limit: params.limit } : {}),
  };
}

/**
 * Fetches one page of the caller's own daily report history (Student only,
 * API-031), `report_date DESC`. Returns the whole `{ data, pagination }`
 * envelope because the cursor block is part of the resource the list
 * screen consumes (APIS §9.2).
 */
export async function listOwnDailyReports(
  params: DailyReportListParams = {},
): Promise<DailyReportListResponse> {
  return apiClient.get<DailyReportListResponse>('/daily-reports', {
    params: toListQuery(params),
  });
}

/**
 * Fetches one page of ONE student's raw daily report list as staff
 * (Teacher of the assigned group / Admin, API-032) — the same page shape
 * as API-031. An out-of-scope, non-existent or terminated membership is a
 * uniform `403 SCOPE_DENIED` (SA §14), surfaced unchanged as `ApiError`.
 */
export async function listMembershipDailyReports(
  membershipId: string,
  params: DailyReportListParams = {},
): Promise<DailyReportListResponse> {
  return apiClient.get<DailyReportListResponse>(
    `/memberships/${encodeURIComponent(membershipId)}/daily-reports`,
    { params: toListQuery(params) },
  );
}
