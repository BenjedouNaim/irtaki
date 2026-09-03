import { PaymentCycleStatus } from '../domain/payment-cycle';

/**
 * One derived cycle of API-045/046 (APIS §10.11):
 * `{ index, start_date, end_date, status, paid_at? }`. `paid_at` is present
 * only when the cycle is `Paid` — the contract marks it optional, and there
 * is no stored row to read it from otherwise (ADR-006).
 */
export interface PaymentCycleDto {
  index: number;
  /** `YYYY-MM-DD` */
  start_date: string;
  /** `YYYY-MM-DD` */
  end_date: string;
  status: PaymentCycleStatus;
  /** ISO-8601 instant; omitted unless `status` is `Paid`. */
  paid_at?: string;
}

/**
 * `PaymentLedgerDto` (TS §13) — the whole derived ledger of one membership,
 * as `GET /me/payments` returns it (APIS §10.11).
 */
export interface PaymentLedgerDto {
  cycles: PaymentCycleDto[];
  /** End of the oldest unpaid cycle (DEC-B06); `null` when none is unpaid. */
  next_due_date: string | null;
  arrears_count: number;
}
