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
  MEMBERSHIP_PAYMENT_SCOPE,
  type IMembershipPaymentScope,
} from '../../domain/membership-payment-scope.interface';

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
 * Route-specific ScopeGuard for `POST /memberships/{id}/payments` (API-047),
 * per TS §15.2 resolved BEFORE the handler runs (SA §14 order:
 * AuthGuard → RolesGuard → ScopeGuard → handler):
 *
 * - malformed `id`: `404 NOT_FOUND` (APIS §9.6 — "a malformed UUID path
 *   segment resolves to 404, not 400"), as the F-PRG-03 precedent;
 * - Assistant: one indexed lookup through the Payments module's own scope
 *   resolver — `SELECT 1 FROM memberships m JOIN groups g … WHERE m.id = :id
 *   AND g.assistant_id = :A AND m.state = 'Active'`; zero rows is the
 *   uniform `403 SCOPE_DENIED` for out-of-scope, non-existent and
 *   Terminated memberships alike (NFR-20). This is VR-27 in guard form.
 * - anyone else never reaches this guard: `@Roles(Assistant)` is the whole
 *   role list on this route, because BR-34 says "only the Assistant may
 *   record a payment" and APIS §6.1 lists the Assistant alone as the actor.
 *   **There is deliberately no Admin bypass here** — unlike the read routes
 *   (DEC-C07), the Admin is not an actor on this write at all, so an
 *   early-return for the Admin would contradict BR-34. The fallthrough
 *   below is defense in depth.
 */
@Injectable()
export class MembershipPaymentsScopeGuard implements CanActivate {
  constructor(
    @Inject(MEMBERSHIP_PAYMENT_SCOPE)
    private readonly membershipPaymentScope: IMembershipPaymentScope,
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

    if (user.role === UserRole.Assistant) {
      const inScope =
        await this.membershipPaymentScope.isActiveMembershipOfAssistant(
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
