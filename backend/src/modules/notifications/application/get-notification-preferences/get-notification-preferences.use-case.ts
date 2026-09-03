import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  NOTIFICATION_PREFERENCE_REPOSITORY,
  type INotificationPreferenceRepository,
} from '../../domain/notification-preference.repository.interface';
import { toNotificationPreferenceDto } from '../notification-preference.mapper';
import { GetNotificationPreferencesResponseDto } from './get-notification-preferences-response.dto';

/**
 * F-NOT-03 / API-050 `GET /me/notification-preferences` — the caller reads
 * the FULL category catalogue merged with their own stored rows (APIQ-10,
 * SAS §12 UC-18 step 2).
 *
 * Every authenticated role may call it for itself ("Own", APIS §6.1), so
 * there is no role list and no path id: the caller IS the scope, taken from
 * the JWT. Nothing is filtered out — an account-critical category appears
 * like any other, carrying `is_mutable: false` so the client can render it
 * locked (FR-NOTIF-06) while the server keeps enforcing VR-38 regardless.
 *
 * The merge is the repository's single LEFT JOIN, not application code: a
 * category with no `notification_preferences` row comes back `muted: false`
 * (R-15 "absent = unmuted"). No transaction (TS §19), no lock (TS §20).
 */
@Injectable()
export class GetNotificationPreferencesUseCase {
  private readonly logger = new Logger(GetNotificationPreferencesUseCase.name);

  constructor(
    @Inject(NOTIFICATION_PREFERENCE_REPOSITORY)
    private readonly notificationPreferenceRepository: INotificationPreferenceRepository,
  ) {}

  async execute(
    userId: string,
  ): Promise<GetNotificationPreferencesResponseDto> {
    const records =
      await this.notificationPreferenceRepository.findCatalogForUser(userId);

    // TS §30: use-case entry/exit is DEBUG; INFO is reserved for
    // request-completed lines, job outcomes and notification dispatch.
    this.logger.debug(
      `Resolved ${records.length} notification categories for user ${userId}`,
    );

    return { data: records.map(toNotificationPreferenceDto) };
  }
}
