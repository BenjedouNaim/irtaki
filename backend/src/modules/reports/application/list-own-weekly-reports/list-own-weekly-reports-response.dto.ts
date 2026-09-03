import { WeeklyReportDto } from '../weekly-report.dto';

/**
 * API-035 payload — APIS §9.1 collection envelope: `WeeklyReportDto[]`
 * (TS §13) plus the cursor block. `next_cursor` is `null` whenever
 * `has_more` is `false` (APIS §9.2, ISS-18); no totals are ever returned.
 */
export interface ListOwnWeeklyReportsResponseDto {
  data: WeeklyReportDto[];
  pagination: {
    next_cursor: string | null;
    has_more: boolean;
  };
}
