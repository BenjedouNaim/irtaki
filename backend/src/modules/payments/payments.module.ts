import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GROUP_PAYMENT_SCOPE } from './domain/group-payment-scope.interface';
import { PAYMENT_REPOSITORY } from './domain/payment.repository.interface';
import { GroupPaymentScope } from './infrastructure/group-payment-scope';
import { PaymentRecordTypeOrmEntity } from './infrastructure/payment-record.typeorm-entity';
import { PaymentRepository } from './infrastructure/payment.repository';
import { GetGroupPaymentLedgerUseCase } from './application/get-group-payment-ledger/get-group-payment-ledger.use-case';
import { GetOwnPaymentLedgerUseCase } from './application/get-own-payment-ledger/get-own-payment-ledger.use-case';
import { PaymentsController } from './presentation/payments.controller';
import { GroupPaymentsScopeGuard } from './presentation/guards/group-payments-scope.guard';

/**
 * Payments (SA §11) — "Ledger, derived cycles" over `payment_records`, with
 * DS-06 doing every derivation at read time. Depends on Memberships only,
 * and reads that table through its own repository query (TS §15.2) rather
 * than injecting another module's repository. The same rule owns API-046's
 * staff-scope resolution: `GroupPaymentScope` is the Payments module's own
 * indexed lookup, not a call into Groups.
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
    PaymentRepository,
    GroupPaymentsScopeGuard,
    GetOwnPaymentLedgerUseCase,
    GetGroupPaymentLedgerUseCase,
  ],
  exports: [
    PAYMENT_REPOSITORY,
    GROUP_PAYMENT_SCOPE,
    PaymentRepository,
    GetOwnPaymentLedgerUseCase,
    GetGroupPaymentLedgerUseCase,
  ],
})
export class PaymentsModule {}
