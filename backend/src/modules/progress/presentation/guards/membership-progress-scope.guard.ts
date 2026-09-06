import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../identity/domain/user-role.enum';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Route-specific ScopeGuard for GET /memberships/{id}/progress (TS §15.2 worked example).
 *
 * Enforces scope via a single indexed SQL lookup before the controller handler runs:
 * - Malformed UUID in route parameter: returns 404 NOT_FOUND (APIS §9.6)
 * - Admin: bypasses ScopeGuard by early-return true (DEC-C07)
 * - Teacher: verifies membership belongs to teacher's assigned group; returns uniform 403
 *   if out-of-scope or non-existent (SA §14 / NFR-20 to prevent ID enumeration)
 */
@Injectable()
export class MembershipProgressScopeGuard implements CanActivate {
  constructor(private readonly dataSource: DataSource) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      params?: { id?: string };
      user?: { id: string; role: UserRole };
    }>();

    const membershipId = request.params?.id;

    // APIS §9.6: Malformed UUID path parameter returns 404 NOT_FOUND
    if (!membershipId || !UUID_REGEX.test(membershipId)) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'NOT_FOUND',
        message: 'المورد المطلوب غير موجود',
      });
    }

    const user = request.user;
    if (!user) {
      return false;
    }

    // DEC-C07: Admin has system-wide read access; bypasses ScopeGuard by early-return
    if (user.role === UserRole.Admin) {
      return true;
    }

    // TS §15.2: Teacher scope resolved via single indexed query
    if (user.role === UserRole.Teacher) {
      const rows = await this.dataSource.query<Array<{ exists: number }>>(
        `SELECT 1
           FROM memberships m
           JOIN groups g ON g.id = m.group_id
          WHERE m.id = $1
            AND g.teacher_id = $2
            AND m.state = 'Active'
          LIMIT 1`,
        [membershipId, user.id],
      );

      if (!rows || rows.length === 0) {
        // SA §14 / NFR-20: uniform 403 for out-of-scope and not-found to prevent enumeration
        throw new ForbiddenException({
          statusCode: 403,
          error: 'SCOPE_DENIED',
          message: 'ليس لديك صلاحية للوصول إلى هذا المورد',
        });
      }

      return true;
    }

    // RolesGuard (@Roles(UserRole.Admin, UserRole.Teacher)) blocks other roles upstream.
    // Defense-in-depth fallback:
    throw new ForbiddenException({
      statusCode: 403,
      error: 'SCOPE_DENIED',
      message: 'ليس لديك صلاحية للوصول إلى هذا المورد',
    });
  }
}
