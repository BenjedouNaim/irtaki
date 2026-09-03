import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GROUP_PAYMENT_SCOPE } from './domain/group-payment-scope.interface';
import { MEMBERSHIP_PAYMENT_SCOPE } from './domain/membership-payment-scope.interface';
import { PAYMENT_REPOSITORY } from './domain/payment.repository.interface';
import { GroupPaymentScope } from './infrastructure/group-payment-scope';
import { MembershipPaymentScope } from './infrastructure/membership-payment-scope';
import { PaymentRecordTypeOrmEntity } from './infrastructure/payment-record.typeorm-entity';
import { PaymentRepository } from './infrastructure/payment.repository';
import { GetGroupPaymentLedgerUseCase } from './application/get-group-payment-ledger/get-group-payment-ledger.use-case';
import { GetOwnPaymentLedgerUseCase } from './application/get-own-payment-ledger/get-own-payment-ledger.use-case';
import { RecordPaymentCycleUseCase } from './application/record-payment-cycle/record-payment-cycle.use-case';
import { PaymentsController } from './presentation/payments.controller';
import { GroupPaymentsScopeGuard } from './presentation/guards/group-payments-scope.guard';
import { MembershipPaymentsScopeGuard } from './presentation/guards/membership-payments-scope.guard';

/**
 * Payments (SA §11) — "Ledger, derived cycles" over `payment_records`, with
 * DS-06 doing every derivation at read time. Depends on Memberships only,
 * and reads that table through its own repository query (TS §15.2) rather
 * than injecting another module's repository. The same rule owns the two
 * staff-scope resolutions: `GroupPaymentScope` (API-046) and
 * `MembershipPaymentScope` (API-047) are the Payments module's own indexed
 * lookups, not calls into Groups or Memberships.
 *
 * `RecordPaymentCycleUseCase` is the module's single write path — and the
 * only one there will be: no reversal or correction use case exists
 * anywhere, by design (ISS-02/APIQ-02, DBQ-02).
 */
@Module({
  imports: [TypeOrmModule.forFeature([PaymentRecordTypeOrmEntity])],
  controllers: [PaymentsController],
  providers: [
    {
      provide: PAYMENT_REPOSITORY,
      useClass: PaymentRepository,
    },
    {
      provide: GROUP_PAYMENT_SCOPE,
      useClass: GroupPaymentScope,
    },
    {
      provide: MEMBERSHIP_PAYMENT_SCOPE,
      useClass: MembershipPaymentScope,
    },
    PaymentRepository,
    GroupPaymentsScopeGuard,
    MembershipPaymentsScopeGuard,
    GetOwnPaymentLedgerUseCase,
    GetGroupPaymentLedgerUseCase,
    RecordPaymentCycleUseCase,
  ],
  exports: [
    PAYMENT_REPOSITORY,
    GROUP_PAYMENT_SCOPE,
    MEMBERSHIP_PAYMENT_SCOPE,
    PaymentRepository,
    GetOwnPaymentLedgerUseCase,
    GetGroupPaymentLedgerUseCase,
    RecordPaymentCycleUseCase,
  ],
})
export class PaymentsModule {}
