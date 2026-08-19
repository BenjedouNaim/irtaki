import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export enum Role {
  Admin = 'Admin',
  Teacher = 'Teacher',
  Assistant = 'Assistant',
  Student = 'Student',
  User = 'User',
}

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Base RolesGuard stub (EPIC-00 / F-FND-03).
 *
 * Full role hierarchy / RBAC verification will be implemented in EPIC-01 (F-AUTH-06).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(protected readonly reflector?: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.reflector) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // TODO (EPIC-01): verify caller role against requiredRoles
    return true;
  }
}
