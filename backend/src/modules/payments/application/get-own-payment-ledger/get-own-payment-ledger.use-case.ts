import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { localDateInTimezone } from '../../../reports/domain/local-date';
import { PaymentCycleDerivationService } from '../../domain/payment-cycle-derivation.service';
import {
  OwnLedgerContextRecord,
  PAYMENT_REPOSITORY,
  type IPaymentRepository,
} from '../../domain/payment.repository.interface';
import { toPaymentLedgerDto } from '../payment-ledger.mapper';
import { GetOwnPaymentLedgerResponseDto } from './get-own-payment-ledger-response.dto';

/**
 * F-PAY-01 / API-045 `GET /me/payments` — a Student reads their own fully
 * derived cycle ledger (FR-PAY-07, UC-09, UF §18).
 *
 * Scope is "own": the Payments module's own repository joins the caller's
 * Active membership inside its one indexed lookup (TS §15.2; SA §11 —
 * Payments reads `memberships`, it never calls another module's service).
 * A Student with no Active membership gets `404 NOT_FOUND`, mirroring
 * `GET /me/progress` (API-041) and `GET /memberships/mine` (APIQ-NEW-06).
 *
 * Nothing is written and nothing about a cycle is stored (ADR-006): the
 * whole response comes from DS-06 over `started_at` and whatever
 * `payment_records` rows exist. "Today" is the calendar date in the
 * student's own `users.timezone` (T-01, INV-27) — a cycle boundary and the
 * 10-day `Due Soon` window are day-boundary judgements, so they follow the
 * same clock as every other date in the product.
 */
@Injectable()
export class GetOwnPaymentLedgerUseCase {
  constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentRepository: IPaymentRepository,
  ) {}

  async execute(
    userId: string,
    now: Date = new Date(),
  ): Promise<GetOwnPaymentLedgerResponseDto> {
    const context =
      await this.paymentRepository.findOwnLedgerContextByUserId(userId);
    if (!context) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'NOT_FOUND',
        message: 'المورد المطلوب غير موجود',
      });
    }

    const paidCycles =
      await this.paymentRepository.findPaidCyclesByMembershipId(
        context.membershipId,
      );

    const ledger = PaymentCycleDerivationService.derive({
      startedAt: context.startedAt,
      today: localDateInTimezone(now, context.timezone),
      endedAt: context.endedAt,
      archivedAt: archivedAtLocalDate(context),
      paidCycles,
    });

    return { data: toPaymentLedgerDto(ledger) };
  }
}

/**
 * `groups.archived_at` (an instant) as a calendar date in the student's own
 * timezone (DEC-B03) — the FR-PAY-12 stop is a day boundary, not an instant.
 */
function archivedAtLocalDate(context: OwnLedgerContextRecord): string | null {
  return context.archivedAt
    ? localDateInTimezone(new Date(context.archivedAt), context.timezone)
    : null;
}
