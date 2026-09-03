import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { DEVICE_PLATFORMS } from '../../domain/device-token.entity';
import type { DevicePlatform } from '../../domain/device-token.entity';

/**
 * API-048 `POST /devices` request body (APIS §10.12):
 * `{ token, platform: "iOS"|"Android" }`. The transport layer of TS §21's
 * validation stack; the same two rules are re-asserted by the E-09 entity
 * and, for `platform`, by the DBT-14 CHECK constraint.
 *
 * `user_id` is never accepted from the body — the caller comes from the JWT
 * (allow-list DTO, AGENTS §11 mass-assignment rule).
 */
export class RegisterDeviceDto {
  @IsString({ message: 'رمز الجهاز مطلوب' })
  @IsNotEmpty({ message: 'رمز الجهاز مطلوب' })
  token!: string;

  @IsIn([...DEVICE_PLATFORMS], {
    message: 'المنصة يجب أن تكون iOS أو Android',
  })
  platform!: DevicePlatform;
}
