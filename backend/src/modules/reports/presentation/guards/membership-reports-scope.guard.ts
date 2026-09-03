import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '../../../identity/domain/user-role.enum';
import {
  MEMBERSHIP_REPORT_SCOPE,
  type IMembershipReportScope,
} from '../../domain/membership-report-scope.interface';

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
 * The one staff-scope resolution shared by the Reports module's
 * `/memberships/{id}/…` list routes — API-032 (`MembershipDailyReportsScopeGuard`)
 * and API-036 (`MembershipWeeklyReportsScopeGuard`), each a route-specific
 * ScopeGuard (TS §15.2) with identical semantics, resolved BEFORE the
 * handler runs (SA §14 order: AuthGuard → RolesGuard → ScopeGuard → handler):
 *
 * - malformed `id`: `404 NOT_FOUND` (APIS §9.6 — "a malformed UUID path
 *   segment resolves to 404, not 400"), same as the F-PRG-03 precedent;
 * - Admin: early-return bypass (DEC-C07);
 * - Teacher: one indexed lookup through the Reports module's own scope
 *   resolver — `SELECT 1 FROM memberships m JOIN groups g … WHERE m.id = :id
 *   AND g.teacher_id = :caller AND m.state = 'Active'`; zero rows is the
 *   uniform `403 SCOPE_DENIED` for out-of-scope, non-existent and
 *   Terminated memberships alike (NFR-20);
 * - anyone else never reaches this guard (Assistant is absent from
 *   `@Roles()`, DEC-B09); the fallthrough is defense in depth.
 */
@Injectable()
export class MembershipReportsScopeGuard implements CanActivate {
  constructor(
    @Inject(MEMBERSHIP_REPORT_SCOPE)
    private readonly membershipReportScope: IMembershipReportScope,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      params?: { id?: string };
      user?: { id: string; role: UserRole };
    }>();

    const membershipId = request.params?.id;
    if (!membershipId || !UUID_REGEX.test(membershipId)) {
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

    if (user.role === UserRole.Admin) {
      return true;
    }

    if (user.role === UserRole.Teacher) {
      const inScope =
        await this.membershipReportScope.isActiveMembershipOfTeacher(
          membershipId,
          user.id,
        );
      if (!inScope) {
        throw scopeDenied();
      }
      return true;
    }

    throw scopeDenied();
  }
}
