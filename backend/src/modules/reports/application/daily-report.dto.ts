/**
 * `DailyReportDto` (TS §13) — the API shape of one E-05 DailyReport, using
 * the field names of APIS §10.7 (`memo_range`, `memo_time`, `rev_range`,
 * `rev_time`, …). Ranges are surah/ayah pairs, never ordinals (APIS §11).
 * Type-conditional groups are `null` when not populated (DBD §11).
 */
export interface AyahPositionDto {
  surah: number;
  ayah: number;
}

export interface AyahRangeDto {
  from: AyahPositionDto;
  to: AyahPositionDto;
}

export interface TimeWindowDto {
  /** `HH:MM` */
  from: string;
  to: string;
}

export type DailyReportTypeDto = 'Normal' | 'Absent' | 'Revision';
export type AbsenceReasonDto = 'Sick' | 'Studying' | 'Other';

export interface DailyReportDto {
  id: string;
  /** `YYYY-MM-DD`, the student's local date (VR-10). */
  report_date: string;
  type: DailyReportTypeDto;
  /** ISO-8601 instant (UTC, T-04). */
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
  absence_reason: AbsenceReasonDto | null;
}
