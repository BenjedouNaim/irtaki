import { DailyReportTypeDto } from '../daily-report.dto';

/**
 * API-030 `201` payload (APIS §10.7):
 * `{ id, report_date, type, ahzab_completed, coverage_updated }` — the
 * post-submission `ahzab_completed`, available because the DS-05 merge ran
 * synchronously before the response was built. `coverage_updated` is `true`
 * only when a memorisation range was merged; `ahzab_completed` is `null`
 * only in the INV-17 anomaly of a membership with no live coverage row.
 */
export interface SubmitDailyReportResultDto {
  id: string;
  /** `YYYY-MM-DD`, the student's local date (VR-10). */
  report_date: string;
  type: DailyReportTypeDto;
  ahzab_completed: number | null;
  coverage_updated: boolean;
}

/** APIS §9.1 single-resource envelope. */
export interface SubmitDailyReportResponseDto {
  data: SubmitDailyReportResultDto;
}
