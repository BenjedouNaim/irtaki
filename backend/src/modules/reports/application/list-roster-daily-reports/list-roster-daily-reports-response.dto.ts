import { ListOwnDailyReportsResponseDto } from '../list-own-daily-reports/list-own-daily-reports-response.dto';

/**
 * API-032 payload — identical to API-031's (APIS §10.7 "same shape"):
 * `DailyReportDto[]` (TS §13) in the APIS §9.1 collection envelope with
 * the cursor block, no totals.
 */
export type ListRosterDailyReportsResponseDto = ListOwnDailyReportsResponseDto;
