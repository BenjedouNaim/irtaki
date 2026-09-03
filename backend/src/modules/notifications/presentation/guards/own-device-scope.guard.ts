import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DEVICE_TOKEN_SCOPE,
  type IDeviceTokenScope,
} from '../../domain/device-token-scope.interface';

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
 * Route-specific ScopeGuard for `DELETE /devices/{id}` (API-049, "Own") —
 * resolved BEFORE the handler runs (SA §14 order: AuthGuard → RolesGuard →
 * ScopeGuard → handler), the single-resource half of "Guard for
 * single-resource routes, repository-level for list routes":
 *
 * - malformed `id`: `404 NOT_FOUND` (APIS §9.6 — "a malformed UUID path
 *   segment resolves to 404, not 400"), as the F-PRG-03 / F-WR-02
 *   precedents do;
 * - any authenticated caller: one indexed lookup through the Notifications
 *   module's own scope resolver — `SELECT 1 FROM device_tokens WHERE
 *   id = :id AND user_id = :caller`; zero rows is the uniform
 *   `403 SCOPE_DENIED` for another user's device and a non-existent id
 *   alike (NFR-20). There is no role restriction to add: API-048/049 are
 *   "Any / Own" for all five roles (APIS §6.1), so the route carries no
 *   `@Roles()` and this guard is the whole authorization decision.
 */
@Injectable()
export class OwnDeviceScopeGuard implements CanActivate {
  constructor(
    @Inject(DEVICE_TOKEN_SCOPE)
    private readonly deviceTokenScope: IDeviceTokenScope,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      params?: { id?: string };
      user?: { id: string; role: string };
    }>();

    const deviceId = request.params?.id;
    if (!deviceId || !UUID_REGEX.test(deviceId)) {
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

    const owned = await this.deviceTokenScope.isOwnedByCaller(
      deviceId,
      user.id,
    );
    if (!owned) {
      throw scopeDenied();
    }
    return true;
  }
}
