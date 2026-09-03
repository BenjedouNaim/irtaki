import { WeeklyReportDto } from '../weekly-report.dto';

/**
 * API-034 `200` — "the finalised report, metrics now snapshotted" (APIS
 * §10.8), in the APIS §9.1 single-resource envelope.
 */
export interface ConfirmWeeklyReportResponseDto {
  data: WeeklyReportDto;
}
