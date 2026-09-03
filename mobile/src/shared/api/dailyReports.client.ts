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
