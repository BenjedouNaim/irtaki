import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PAYMENT_CYCLE_AMOUNT } from '../../domain/payment-cycle';
import {
  PAYMENT_REPOSITORY,
  type IPaymentRepository,
} from '../../domain/payment.repository.interface';
import { deriveLedgerForMembership } from '../derive-ledger';
import { RecordPaymentCycleResponseDto } from './payment-record.dto';

/** VR-26 / DB-UQ-06 — this cycle already carries a PaymentRecord. */
const CYCLE_ALREADY_PAID_MESSAGE = 'تم تسجيل دفع هذه الدورة مسبقاً';
/** VR-37 — the cycle has not started yet; prepayment is not possible. */
const FUTURE_CYCLE_MESSAGE = 'لم تبدأ هذه الدورة بعد؛ لا يمكن تسجيل دفعها';

export interface RecordPaymentCycleCommand {
  membershipId: string;
  /** The Assistant recording it — `payment_records.recorded_by` (BR-34). */
  recordedBy: string;
  /** 0-based (DB-CHK-18), transport-validated as a non-negative integer. */
  cycleIndex: number;
}

/**
 * UC-09 step 6–7 / F-PAY-03 / API-047 `POST /memberships/{id}/payments` —
 * the Assistant asserts that one cycle's fee was collected offline
 * (BR-35: tracked, never processed).
 *
 * Order of checks (TS §21's four layers, application row):
 *  1. The membership's DS-06 context, Active and scoped, in one indexed
 *     lookup → `403 SCOPE_DENIED` when absent. `MembershipPaymentsScopeGuard`
 *     has already resolved VR-27 before the handler ran (TS §15.2); this is
 *     SA §14's second layer, not a repetition of the first.
 *  2. VR-37: `cycle_index` must name a cycle that has actually started —
 *     `0 ≤ index ≤ current_cycle_index`, where the current index is the last
 *     one DS-06 generates for this membership. Generation stops at the
 *     FR-PAY-12 bound (termination or group archival), so a cycle beyond
 *     that bound is a future cycle too → `422 FUTURE_CYCLE`.
 *  3. A single auto-committed INSERT (TS §19). VR-26 is **not** pre-checked
 *     with a SELECT: DB-UQ-06 is the guarantee that survives two Assistants
 *     recording concurrently (TS §20, APIS §9.7), and its violation is
 *     translated here into `409 CYCLE_ALREADY_PAID`.
 *
 * Cycles may be paid in any order (BR-56/FR-PAY-11): nothing here requires
 * cycle `i − 1` to be paid before cycle `i`.
 *
 * **Nothing in this module can undo this write.** No reversal endpoint, no
 * soft-delete path, no correction field — ISS-02/APIQ-02 leave that as an
 * accepted MVP gap, and the `payment_records` immutability trigger
 * (DB-CHK-11) enforces it below the application anyway.
 *
 * The row is not audited: APIS §9.9 lists exactly three audited actions and
 * "payment recording and student removal remain unaudited" (RISK-08).
 */
@Injectable()
export class RecordPaymentCycleUseCase {
  private readonly logger = new Logger(RecordPaymentCycleUseCase.name);

  constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentRepository: IPaymentRepository,
  ) {}

  async execute(
    command: RecordPaymentCycleCommand,
    now: Date = new Date(),
  ): Promise<RecordPaymentCycleResponseDto> {
    const context =
      await this.paymentRepository.findLedgerContextByMembershipId(
        command.membershipId,
      );
    if (!context) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'SCOPE_DENIED',
        message: 'ليس لديك صلاحية للوصول إلى هذا المورد',
      });
    }

    // VR-37. The paid rows are irrelevant to *which* cycles exist — DS-06
    // generates them from `started_at` and the FR-PAY-12 bound alone — so
    // the derivation runs with no paid cycles rather than reading them,
    // which would be the SELECT-then-INSERT shape TS §20 forbids.
    const currentCycleIndex =
      deriveLedgerForMembership(context, [], now).cycles.length - 1;
    if (command.cycleIndex > currentCycleIndex) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        error: 'FUTURE_CYCLE',
        message: FUTURE_CYCLE_MESSAGE,
        details: [
          {
            field: 'cycle_index',
            rule: 'VR-37',
            message: FUTURE_CYCLE_MESSAGE,
          },
        ],
      });
    }

    try {
      const record = await this.paymentRepository.createPaidCycle({
        membershipId: context.membershipId,
        cycleIndex: command.cycleIndex,
        // BR-31, never client-supplied: the request body has no amount.
        amount: PAYMENT_CYCLE_AMOUNT,
        recordedBy: command.recordedBy,
        paidAt: now,
      });

      this.logger.log(
        `Payment recorded for membership ${context.membershipId} cycle ${command.cycleIndex} by ${command.recordedBy}`,
      );

      return {
        data: {
          id: record.id,
          cycle_index: record.cycleIndex,
          amount: record.amount,
          paid_at: record.paidAt,
          recorded_by: record.recordedBy,
        },
      };
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        throw new ConflictException({
          statusCode: 409,
          error: 'CYCLE_ALREADY_PAID',
          message: CYCLE_ALREADY_PAID_MESSAGE,
        });
      }
      throw err;
    }
  }
}

/** Postgres `unique_violation` as TypeORM surfaces it (DB-UQ-06). */
function isUniqueViolation(err: unknown): boolean {
  const e = err as {
    code?: string;
    driverError?: { code?: string; constraint?: string };
  };
  return e?.code === '23505' || e?.driverError?.code === '23505';
}
