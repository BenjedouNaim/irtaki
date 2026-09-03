import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

/**
 * API-051 `PATCH /me/notification-preferences` request body (APIS §10.12):
 * `{ category, muted }`. The transport layer of TS §21's validation stack.
 *
 * `category` is validated as a non-empty string only — the valid values live
 * in `notification_categories` (DBT-15), the one enumeration this schema
 * deliberately promoted to a lookup table (DBD §18), so the application layer
 * resolves it against that table rather than a list frozen into the DTO.
 *
 * `is_mutable` is NOT accepted from the body: VR-38 is decided on the
 * catalogue row, "regardless of what the client sends". `user_id` likewise
 * comes from the JWT (allow-list DTO, AGENTS §11 mass-assignment rule).
 */
export class SetPreferenceDto {
  @IsString({ message: 'فئة الإشعارات مطلوبة' })
  @IsNotEmpty({ message: 'فئة الإشعارات مطلوبة' })
  category!: string;

  @IsBoolean({ message: 'قيمة الكتم يجب أن تكون صحيحة أو خاطئة' })
  muted!: boolean;
}
