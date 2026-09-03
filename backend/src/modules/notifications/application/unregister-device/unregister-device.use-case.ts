import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import {
  DEVICE_TOKEN_REPOSITORY,
  type IDeviceTokenRepository,
} from '../../domain/device-token.repository.interface';

/** APIS §9.5 / SA §14: one masked answer for every scope failure (NFR-20). */
function scopeDenied(): ForbiddenException {
  return new ForbiddenException({
    statusCode: 403,
    error: 'SCOPE_DENIED',
    message: 'ليس لديك صلاحية للوصول إلى هذا المورد',
  });
}

/**
 * F-NOT-02 / API-049 `DELETE /devices/{id}` — a client removes its push
 * token. Every authenticated role may call it for its own device ("Own",
 * APIS §6.1); ownership is resolved before the handler by
 * `OwnDeviceScopeGuard` (SA §14), and repeated here in the DELETE predicate
 * as the NFR-19 repository-level backstop.
 *
 * The row is PHYSICALLY deleted — the single confirmed hard-delete
 * exception in this schema (DBD §25 / ADR-007 / SAS §20.1: "no business
 * value in retaining an invalidated push token"), so no `deleted_at` is set
 * and no recovery view exists. `204 No Content`, no envelope (APIS §9.1).
 *
 * Zero rows affected can only mean the row disappeared between the guard's
 * lookup and this statement (a concurrent unregister); it answers with the
 * same uniform `403` the guard would have raised.
 */
@Injectable()
export class UnregisterDeviceUseCase {
  private readonly logger = new Logger(UnregisterDeviceUseCase.name);

  constructor(
    @Inject(DEVICE_TOKEN_REPOSITORY)
    private readonly deviceTokenRepository: IDeviceTokenRepository,
  ) {}

  async execute(userId: string, deviceId: string): Promise<void> {
    const deleted = await this.deviceTokenRepository.deletePhysically(
      deviceId,
      userId,
    );

    if (!deleted) {
      throw scopeDenied();
    }

    this.logger.log(`Unregistered device token ${deviceId} for user ${userId}`);
  }
}
