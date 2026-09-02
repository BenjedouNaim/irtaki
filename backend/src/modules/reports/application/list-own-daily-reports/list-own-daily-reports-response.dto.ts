import { DailyReportDto } from '../daily-report.dto';

/**
 * API-031 payload — APIS §9.1 collection envelope: `DailyReportDto[]`
 * (TS §13) plus the cursor block. `next_cursor` is `null` whenever
 * `has_more` is `false` (APIS §9.2, ISS-18); no totals are ever returned.
 */
export interface ListOwnDailyReportsResponseDto {
  data: DailyReportDto[];
  pagination: {
    next_cursor: string | null;
    has_more: boolean;
  };
}
