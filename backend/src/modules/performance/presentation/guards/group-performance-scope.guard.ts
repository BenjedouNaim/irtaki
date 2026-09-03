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
  GROUP_PERFORMANCE_SCOPE,
  type IGroupPerformanceScope,
} from '../../domain/group-performance-scope.interface';

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
 * Route-specific ScopeGuard for API-038 `GET /groups/{id}/performance`
 * (TS §15.2 — "one indexed lookup before the handler runs"), resolved
 * BEFORE the handler in SA §14's order: AuthGuard → RolesGuard →
 * ScopeGuard → handler.
 *
 * - malformed `id`: `404 NOT_FOUND` (APIS §9.6 — "a malformed UUID path
 *   segment resolves to 404, not 400"), matching the F-PRG-03 / F-DR-06
 *   precedents;
 * - Admin: early-return bypass (DEC-C07) — the group's existence is then
 *   settled by the handler's own context read, which answers `404` for an
 *   id that names no group;
 * - Teacher: one indexed lookup through the Performance module's own scope
 *   resolver — `SELECT 1 FROM groups WHERE id = :id AND teacher_id = :T`
 *   (SA §14's own query); zero rows is the uniform `403 SCOPE_DENIED` for
 *   an unassigned group and a non-existent one alike (NFR-20, AC-17);
 * - anyone else never reaches this guard — the Assistant is absent from
 *   `@Roles()` (DEC-B09), so RolesGuard rejects them unconditionally
 *   whatever group they staff. The fallthrough is defence in depth.
 */
@Injectable()
export class GroupPerformanceScopeGuard implements CanActivate {
  constructor(
    @Inject(GROUP_PERFORMANCE_SCOPE)
    private readonly groupPerformanceScope: IGroupPerformanceScope,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      params?: { id?: string };
      user?: { id: string; role: UserRole };
    }>();

    const groupId = request.params?.id;
    if (!groupId || !UUID_REGEX.test(groupId)) {
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
      const inScope = await this.groupPerformanceScope.isGroupOfTeacher(
        groupId,
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
