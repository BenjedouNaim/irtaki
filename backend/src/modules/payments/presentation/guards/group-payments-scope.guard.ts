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
  GROUP_PAYMENT_SCOPE,
  type IGroupPaymentScope,
} from '../../domain/group-payment-scope.interface';

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
 * Route-specific ScopeGuard for `GET /groups/{id}/payments` (API-046), a
 * route-specific ScopeGuard per TS §15.2 resolved BEFORE the handler runs
 * (SA §14 order: AuthGuard → RolesGuard → ScopeGuard → handler):
 *
 * - malformed `id`: `404 NOT_FOUND` (APIS §9.6 — "a malformed UUID path
 *   segment resolves to 404, not 400"), as the F-PRG-03 precedent;
 * - Admin: early-return bypass (DEC-C07);
 * - Assistant: one indexed lookup through the Payments module's own scope
 *   resolver — `SELECT 1 FROM groups WHERE id = :id AND assistant_id = :A`;
 *   zero rows is the uniform `403 SCOPE_DENIED` for out-of-scope and
 *   non-existent groups alike (NFR-20);
 * - anyone else never reaches this guard. **Teacher** in particular is
 *   absent from `@Roles()` on this route, so RolesGuard alone yields the
 *   unconditional `403` SRS §10 requires ("Payment record — Teacher: —",
 *   UC-09 "Teacher: never"). This is the *inverse* of DEC-B09, which
 *   excludes the Assistant from Reports/Progress/Performance; the excluded
 *   role here is the Teacher. The fallthrough below is defense in depth.
 */
@Injectable()
export class GroupPaymentsScopeGuard implements CanActivate {
  constructor(
    @Inject(GROUP_PAYMENT_SCOPE)
    private readonly groupPaymentScope: IGroupPaymentScope,
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

    if (user.role === UserRole.Assistant) {
      const inScope = await this.groupPaymentScope.isGroupOfAssistant(
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
