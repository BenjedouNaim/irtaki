import { ListOwnDailyReportsQueryDto } from '../list-own-daily-reports/list-own-daily-reports-query.dto';

/**
 * API-032 `GET /memberships/{id}/daily-reports?from=&to=` query — "same
 * shape" as API-031 (APIS §10.7): the `from`/`to` filter (APIS §9.3) and
 * the cursor params (APIS §9.2). The path `id` is not part of the query
 * DTO; it is consumed by the route-specific ScopeGuard first (TS §15.2).
 */
export class ListRosterDailyReportsQueryDto extends ListOwnDailyReportsQueryDto {}
