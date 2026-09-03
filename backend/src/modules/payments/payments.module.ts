import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PAYMENT_REPOSITORY } from './domain/payment.repository.interface';
import { PaymentRecordTypeOrmEntity } from './infrastructure/payment-record.typeorm-entity';
import { PaymentRepository } from './infrastructure/payment.repository';
import { GetOwnPaymentLedgerUseCase } from './application/get-own-payment-ledger/get-own-payment-ledger.use-case';
import { PaymentsController } from './presentation/payments.controller';

/**
 * Payments (SA §11) — "Ledger, derived cycles" over `payment_records`, with
 * DS-06 doing every derivation at read time. Depends on Memberships only,
 * and reads that table through its own repository query (TS §15.2) rather
 * than injecting another module's repository.
 */
@Module({
  imports: [TypeOrmModule.forFeature([PaymentRecordTypeOrmEntity])],
  controllers: [PaymentsController],
  providers: [
    {
      provide: PAYMENT_REPOSITORY,
      useClass: PaymentRepository,
    },
    PaymentRepository,
    GetOwnPaymentLedgerUseCase,
  ],
  exports: [PAYMENT_REPOSITORY, PaymentRepository, GetOwnPaymentLedgerUseCase],
})
export class PaymentsModule {}
