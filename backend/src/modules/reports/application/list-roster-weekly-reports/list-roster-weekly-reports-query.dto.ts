import { ListOwnWeeklyReportsQueryDto } from '../list-own-weekly-reports/list-own-weekly-reports-query.dto';

/**
 * API-036 `GET /memberships/{id}/weekly-reports` query — "same
 * pagination/scope pattern as daily reports" (APIS §10.8): the `from`/`to`
 * filter (APIS §9.3) and the cursor params (APIS §9.2), as API-035. The
 * path `id` is not part of the query DTO; it is consumed by the
 * route-specific ScopeGuard first (TS §15.2).
 */
export class ListRosterWeeklyReportsQueryDto extends ListOwnWeeklyReportsQueryDto {}
