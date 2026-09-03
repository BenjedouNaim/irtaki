import { IsInt, Min } from 'class-validator';

/**
 * `RecordPaymentDto` (TS §13/§21 transport layer) — API-047's request body,
 * which APIS §10.11 defines as `{ cycle_index }` and nothing else.
 *
 * **There is deliberately no `amount` field.** BR-31 fixes the fee at 30 TND
 * for every student and the use case supplies it from the domain constant,
 * so a client can neither choose nor influence what is stored. The global
 * `ValidationPipe` runs with `forbidNonWhitelisted: true`, so a body that
 * carries an `amount` is rejected with `422` rather than silently ignored.
 *
 * `cycle_index` is 0-based (DB-CHK-18). Its lower bound is transport-level
 * (`>= 0`, the VO-05 `PaymentCycle` rule); its upper bound is VR-37, which
 * needs the membership's cycle clock and therefore lives in the use case.
 *
 * The path `id` is not part of this DTO: it is consumed by the
 * route-specific `MembershipPaymentsScopeGuard` first (TS §15.2).
 */
export class RecordPaymentDto {
  @IsInt({ message: 'رقم الدورة يجب أن يكون عدداً صحيحاً' })
  @Min(0, { message: 'رقم الدورة يجب ألا يكون سالباً' })
  cycle_index!: number;
}
