import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../modules/identity/domain/user-role.enum';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/**
 * RolesGuard (F-AUTH-06, SA §14/§15, TS §36).
 *
 * Verifies that the caller's role (populated by AuthGuard on request.user)
 * satisfies the required roles declared via @Roles().
 * Pass-through by default when no @Roles() metadata is present.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(protected readonly reflector?: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.reflector) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: {
        id: string;
        email: string;
        role: string;
      };
    }>();

    const user = request?.user;
    if (!user || !user.role || !requiredRoles.includes(user.role as UserRole)) {
      throw new ForbiddenException();
    }

    return true;
  }
}
