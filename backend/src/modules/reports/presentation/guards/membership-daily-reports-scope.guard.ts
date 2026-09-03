import { Injectable } from '@nestjs/common';
import { MembershipReportsScopeGuard } from './membership-reports-scope.guard';

/**
 * Route-specific ScopeGuard for `GET /memberships/{id}/daily-reports`
 * (API-032) — the TS §15.2 worked example, resolved BEFORE the handler runs
 * (SA §14 order: AuthGuard → RolesGuard → ScopeGuard → handler): malformed
 * `id` → `404 NOT_FOUND` (APIS §9.6); Admin → early-return bypass (DEC-C07);
 * Teacher → one indexed lookup through the Reports module's own scope
 * resolver, zero rows = the uniform `403 SCOPE_DENIED` for out-of-scope,
 * non-existent and Terminated memberships alike (NFR-20); anyone else →
 * 403 (Assistant never gets here, DEC-B09). The resolution itself lives in
 * `MembershipReportsScopeGuard`, shared verbatim with API-036's guard.
 */
@Injectable()
export class MembershipDailyReportsScopeGuard extends MembershipReportsScopeGuard {}
