import { IsIn, IsOptional } from 'class-validator';
import type { PaymentCycleStatus } from '../../domain/payment-cycle';

/**
 * API-046 `GET /groups/{id}/payments?status=` query (APIS §9.3's `status`
 * filter, "enum, endpoint-specific"). The accepted values are the SRS
 * payment enum exactly as APIS §10.11 spells it — arrears are a count, not
 * a fourth value (BR-55). An unlisted query parameter is silently ignored
 * by the global `ValidationPipe`'s allow-list, per §9.3; a *listed* filter
 * carrying a value outside its enum is a `422`, as `?gender=` already is on
 * `GET /groups/available`.
 *
 * The path `id` is not part of this DTO: it is consumed by the
 * route-specific `GroupPaymentsScopeGuard` first (TS §15.2).
 */
export class GetGroupPaymentsQueryDto {
  @IsOptional()
  @IsIn(['Paid', 'Due Soon', 'Unpaid'])
  status?: PaymentCycleStatus;
}
