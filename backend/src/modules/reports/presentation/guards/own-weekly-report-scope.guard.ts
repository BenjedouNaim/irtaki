import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  WEEKLY_REPORT_SCOPE,
  type IWeeklyReportScope,
} from '../../domain/weekly-report-scope.interface';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** APIS §9.5 / SA §14: one masked answer for every scope failure (NFR-20). */
function scopeDenied(): ForbiddenException {
  return new ForbiddenException({
    statusCode: 403,
    error: 'SCOPE_DENIED',
    message: 'ليس لديك صلاحية للوصول إلى هذا المورد',
  });
}

/**
 * Route-specific ScopeGuard for `POST /weekly-reports/{id}/confirm`
 * (API-034, "Own") — resolved BEFORE the handler runs (SA §14 order:
 * AuthGuard → RolesGuard → ScopeGuard → handler), the single-resource half
 * of "Guard for single-resource routes, repository-level for list routes":
 *
 * - malformed `id`: `404 NOT_FOUND` (APIS §9.6 — "a malformed UUID path
 *   segment resolves to 404, not 400"), as the API-032 guard does;
 * - Student: one indexed lookup through the Reports module's own scope
 *   resolver — `SELECT 1 FROM weekly_reports w JOIN memberships m … WHERE
 *   w.id = :id AND m.user_id = :caller AND w.deleted_at IS NULL`; zero rows
 *   is the uniform `403 SCOPE_DENIED` for another student's report, a
 *   non-existent id and a soft-deleted row alike (NFR-20);
 * - anyone else never reaches this guard (only Student is in `@Roles()`;
 *   Assistant is absent by DEC-B09); the fallthrough is defense in depth.
 */
@Injectable()
export class OwnWeeklyReportScopeGuard implements CanActivate {
  constructor(
    @Inject(WEEKLY_REPORT_SCOPE)
    private readonly weeklyReportScope: IWeeklyReportScope,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      params?: { id?: string };
      user?: { id: string; role: string };
    }>();

    const reportId = request.params?.id;
    if (!reportId || !UUID_REGEX.test(reportId)) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'NOT_FOUND',
        message: 'المورد المطلوب غير موجود',
      });
    }

    const user = request.user;
    if (!user) {
      throw scopeDenied();
    }

    const owned = await this.weeklyReportScope.isOwnedByStudent(
      reportId,
      user.id,
    );
    if (!owned) {
      throw scopeDenied();
    }
    return true;
  }
}
