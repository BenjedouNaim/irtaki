import { PaymentLedgerDto } from '../payment-ledger.dto';

/** APIS §9.1 single-resource envelope. */
export interface GetOwnPaymentLedgerResponseDto {
  data: PaymentLedgerDto;
}
