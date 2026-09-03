import {
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { NotificationPreference } from '../../domain/notification-preference.entity';
import {
  AccountCriticalCategoryError,
  UnknownNotificationCategoryError,
} from '../../domain/notification-preference.errors';
import {
  NOTIFICATION_PREFERENCE_REPOSITORY,
  type INotificationPreferenceRepository,
} from '../../domain/notification-preference.repository.interface';
import { toNotificationPreferenceDto } from '../notification-preference.mapper';
import { SetPreferenceDto } from './set-preference.dto';
import { SetNotificationPreferenceResponseDto } from './set-notification-preference-response.dto';

/**
 * F-NOT-04 / API-051 `PATCH /me/notification-preferences` — the caller mutes
 * or unmutes one category (SAS §12 UC-18 step 3).
 *
 * Every authenticated role may call it for itself ("Own", APIS §6.1), so
 * there is no role list and no path id: the caller IS the scope, taken from
 * the JWT and never from the body.
 *
 * VR-38 / BR-61 is decided on the `notification_categories` row, never on
 * client input — SAS §12 UC-18 E1 is explicit that muting an account-critical
 * category is "blocked server-side, not merely hidden in the UI" (NFR-08).
 * The E-10 entity raises it, this use case maps it to
 * `422 ACCOUNT_CRITICAL_CATEGORY` (APIS §10.12), and DB-CHK-09's trigger
 * stands behind both as the storage-layer backstop — the four validation
 * layers of AGENTS §10 for this one rule.
 *
 * The write is one idempotent upsert on DB-UQ-10, so no transaction
 * (TS §19) and no lock (TS §20): a double tap converges on one row.
 */
@Injectable()
export class SetNotificationPreferenceUseCase {
  private readonly logger = new Logger(SetNotificationPreferenceUseCase.name);

  constructor(
    @Inject(NOTIFICATION_PREFERENCE_REPOSITORY)
    private readonly notificationPreferenceRepository: INotificationPreferenceRepository,
  ) {}

  async execute(
    userId: string,
    dto: SetPreferenceDto,
  ): Promise<SetNotificationPreferenceResponseDto> {
    const category =
      await this.notificationPreferenceRepository.findCategoryByCode(
        dto.category,
      );

    if (category === null) {
      const error = new UnknownNotificationCategoryError(dto.category);
      throw new UnprocessableEntityException({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: error.message,
        details: error.details,
      });
    }

    let preference: NotificationPreference;
    try {
      preference = NotificationPreference.set({
        userId,
        category,
        muted: dto.muted,
      });
    } catch (error) {
      if (error instanceof AccountCriticalCategoryError) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          error: 'ACCOUNT_CRITICAL_CATEGORY',
          message: error.message,
        });
      }
      throw error;
    }

    const muted =
      await this.notificationPreferenceRepository.upsert(preference);

    // TS §30: use-case entry/exit is DEBUG (see GetNotificationPreferencesUseCase).
    this.logger.debug(
      `Set notification category ${category.code} muted=${muted} for user ${userId}`,
    );

    return {
      data: toNotificationPreferenceDto({ ...category, muted }),
    };
  }
}
