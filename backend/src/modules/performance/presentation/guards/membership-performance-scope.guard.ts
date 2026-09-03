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
  MEMBERSHIP_PERFORMANCE_SCOPE,
  type IMembershipPerformanceScope,
} from '../../domain/membership-performance-scope.interface';

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
 * Route-specific ScopeGuard for API-039 `GET /memberships/{id}/performance`
 * — the very route TS §15.2's ScopeGuard row names ("one indexed lookup
 * before the handler runs"), resolved BEFORE the handler in SA §14's order:
 * AuthGuard → RolesGuard → ScopeGuard → handler.
 *
 * - malformed `id`: `404 NOT_FOUND` (APIS §9.6 — "a malformed UUID path
 *   segment resolves to 404, not 400"), as in the F-PRG-03 / F-DR-06 /
 *   F-WR-04 precedents;
 * - Admin: early-return bypass (DEC-C07) — the membership's existence is
 *   then settled by the handler's own context read, which answers `404` for
 *   an id that names no membership;
 * - Teacher: one indexed lookup through the Performance module's own scope
 *   resolver — `SELECT 1 FROM memberships m JOIN groups g … WHERE m.id = :id
 *   AND g.teacher_id = :T AND m.state = 'Active'`; zero rows is the uniform
 *   `403 SCOPE_DENIED` for out-of-scope, non-existent and Terminated
 *   memberships alike (NFR-20, AC-17);
 * - Student: the same single lookup against `m.user_id`, APIS §6.1's
 *   `✓ own` — this is the one `/memberships/{id}/…` route a Student may
 *   call, and another student's id is masked as the same `403`;
 * - anyone else never reaches this guard — the Assistant is absent from
 *   `@Roles()` (DEC-B09), so RolesGuard rejects them unconditionally
 *   whatever group they staff. The fallthrough is defence in depth.
 */
@Injectable()
export class MembershipPerformanceScopeGuard implements CanActivate {
  constructor(
    @Inject(MEMBERSHIP_PERFORMANCE_SCOPE)
    private readonly membershipPerformanceScope: IMembershipPerformanceScope,
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
        await this.membershipPerformanceScope.isActiveMembershipOfTeacher(
          membershipId,
          user.id,
        );
      if (!inScope) {
        throw scopeDenied();
      }
      return true;
    }

    if (user.role === UserRole.Student) {
      const isOwn = await this.membershipPerformanceScope.isOwnActiveMembership(
        membershipId,
        user.id,
      );
      if (!isOwn) {
        throw scopeDenied();
      }
      return true;
    }

    throw scopeDenied();
  }
}
