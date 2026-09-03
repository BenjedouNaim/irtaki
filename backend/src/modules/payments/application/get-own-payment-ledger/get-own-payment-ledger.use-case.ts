import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  PAYMENT_REPOSITORY,
  type IPaymentRepository,
} from '../../domain/payment.repository.interface';
import { deriveLedgerForMembership } from '../derive-ledger';
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
 * `payment_records` rows exist, against the student's own timezone (T-01).
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

    return {
      data: toPaymentLedgerDto(
        deriveLedgerForMembership(context, paidCycles, now),
      ),
    };
  }
}
