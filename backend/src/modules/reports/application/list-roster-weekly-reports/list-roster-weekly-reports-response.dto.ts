import { ListOwnWeeklyReportsResponseDto } from '../list-own-weekly-reports/list-own-weekly-reports-response.dto';

/**
 * API-036 payload — identical to API-035's (APIS §10.8 "same pattern"):
 * `WeeklyReportDto[]` (TS §13) in the APIS §9.1 collection envelope with
 * the cursor block, no totals.
 */
export type ListRosterWeeklyReportsResponseDto =
  ListOwnWeeklyReportsResponseDto;
