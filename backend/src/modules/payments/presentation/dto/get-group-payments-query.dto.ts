import { IsIn, IsOptional } from 'class-validator';
import type { PaymentCycleStatus } from '../../domain/payment-cycle';

/**
 * API-046 `GET /groups/{id}/payments?status=` query (APIS §9.3's `status`
 * filter, "enum, endpoint-specific"). The accepted values are the SRS
 * payment enum exactly as APIS §10.11 spells it — arrears are a count, not
 * a fourth value (BR-55) — and a value outside that enum is a `422`, as
 * `?gender=` already is on `GET /groups/available`.
 *
 * NOTE: an *unlisted* query parameter is also rejected with `422` here,
 * because `app.module`'s global `ValidationPipe` runs with
 * `forbidNonWhitelisted: true`. APIS §9.3 says the opposite — "any other
 * query parameter is silently ignored (not a `422`) so old app versions
 * calling with an extra param never break". That deviation is repo-wide
 * (every `@Query()` DTO on main behaves this way) and is logged as an open
 * question rather than corrected on this one route, since making API-046
 * alone lenient would leave the surface inconsistent.
 *
 * The path `id` is not part of this DTO: it is consumed by the
 * route-specific `GroupPaymentsScopeGuard` first (TS §15.2).
 */
export class GetGroupPaymentsQueryDto {
  @IsOptional()
  @IsIn(['Paid', 'Due Soon', 'Unpaid'])
  status?: PaymentCycleStatus;
}
