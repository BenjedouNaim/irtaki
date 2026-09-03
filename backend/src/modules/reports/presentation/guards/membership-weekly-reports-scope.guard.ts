import { Injectable } from '@nestjs/common';
import { MembershipReportsScopeGuard } from './membership-reports-scope.guard';

/**
 * Route-specific ScopeGuard for `GET /memberships/{id}/weekly-reports`
 * (API-036, F-WR-04) — "same pagination/scope pattern as daily reports"
 * (APIS §10.8), resolved BEFORE the handler runs (SA §14 order: AuthGuard →
 * RolesGuard → ScopeGuard → handler) with exactly API-032's semantics:
 * malformed `id` → `404 NOT_FOUND` (APIS §9.6); Admin → early-return bypass
 * (DEC-C07); Teacher → one indexed lookup through the Reports module's own
 * scope resolver (`SELECT 1 FROM memberships m JOIN groups g … WHERE m.id =
 * :id AND g.teacher_id = :caller AND m.state = 'Active'`), zero rows = the
 * uniform `403 SCOPE_DENIED` for out-of-scope, non-existent and Terminated
 * memberships alike (NFR-20); anyone else → 403 (Assistant never gets here,
 * DEC-B09). The resolution itself lives in `MembershipReportsScopeGuard`.
 */
@Injectable()
export class MembershipWeeklyReportsScopeGuard extends MembershipReportsScopeGuard {}
