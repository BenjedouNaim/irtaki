import { IsIn } from 'class-validator';
import { PROMOTION_TARGET_ROLES } from '../../domain/user-role.enum';
import type { PromotionTargetRole } from '../../domain/user-role.enum';

/**
 * Request body of `PATCH /users/{id}/role` (API-052).
 * Only `Teacher` and `Assistant` are accepted targets (BR-R03) — the DTO is
 * an allow-list, so no other role can be smuggled in (SA §25 mass-assignment).
 */
export class PromoteRoleDto {
  @IsIn(PROMOTION_TARGET_ROLES, {
    message: 'الدور المحدد غير صالح للترقية',
  })
  role!: PromotionTargetRole;
}
