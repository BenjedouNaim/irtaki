import {
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DeviceToken } from '../../domain/device-token.entity';
import { DeviceTokenValidationError } from '../../domain/device-token.errors';
import {
  DEVICE_TOKEN_REPOSITORY,
  type IDeviceTokenRepository,
} from '../../domain/device-token.repository.interface';
import { toDeviceTokenDto } from '../device-token.mapper';
import { RegisterDeviceDto } from './register-device.dto';
import { RegisterDeviceResponseDto } from './register-device-response.dto';

/**
 * F-NOT-01 / API-048 `POST /devices` — a client registers or refreshes its
 * push token (FR-AUTH-08, APIQ-07: this is the canonical registration path).
 *
 * Every authenticated role may call it for itself ("Own", APIS §6.1), so
 * there is no role list and no path id: the caller IS the scope, taken from
 * the JWT and never from the body.
 *
 * The whole operation is one idempotent upsert (VR-29): a token already in
 * `device_tokens` has its `last_seen_at` refreshed instead of being
 * duplicated, which is exactly why this endpoint answers `200` and never
 * `201` (APIS §9.7 — "genuinely idempotent, not merely constraint-guarded").
 * No transaction (TS §19) and no lock (TS §20) — the single statement is
 * atomic, and a concurrent retry of the same token converges on the same row.
 */
@Injectable()
export class RegisterDeviceUseCase {
  private readonly logger = new Logger(RegisterDeviceUseCase.name);

  constructor(
    @Inject(DEVICE_TOKEN_REPOSITORY)
    private readonly deviceTokenRepository: IDeviceTokenRepository,
  ) {}

  async execute(
    userId: string,
    dto: RegisterDeviceDto,
  ): Promise<RegisterDeviceResponseDto> {
    let deviceToken: DeviceToken;
    try {
      deviceToken = DeviceToken.register({
        userId,
        token: dto.token,
        platform: dto.platform,
      });
    } catch (error) {
      if (error instanceof DeviceTokenValidationError) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          error: 'VALIDATION_ERROR',
          message: error.message,
          details: error.details,
        });
      }
      throw error;
    }

    const record =
      await this.deviceTokenRepository.registerOrRefresh(deviceToken);

    // TS §30: use-case entry/exit is DEBUG (local development only). INFO is
    // reserved for request-completed lines, scheduled-job outcomes and
    // notification DISPATCH outcomes — a token registration is none of those.
    this.logger.debug(
      `Registered device token ${record.id} (${record.platform}) for user ${userId}`,
    );

    return { data: toDeviceTokenDto(record) };
  }
}
