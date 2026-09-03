import { ListOwnDailyReportsQueryDto } from '../list-own-daily-reports/list-own-daily-reports-query.dto';

/**
 * API-035 `GET /weekly-reports?from=&to=` query — "same pagination/scope
 * pattern as daily reports" (APIS §10.8): the APIS §9.2 cursor params and
 * the §9.3 `from`/`to` filter, applied to `week_start` (the §9.4 sort key).
 * `limit` is clamped, never rejected; `cursor` is opaque and decoded by the
 * use case.
 */
export class ListOwnWeeklyReportsQueryDto extends ListOwnDailyReportsQueryDto {}
