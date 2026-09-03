import { apiClient } from './client';

/** SRS payment enum — arrears are a count, not a fourth value (BR-55). */
export type PaymentCycleStatus = 'Paid' | 'Due Soon' | 'Unpaid';

/**
 * One derived cycle of API-045 (APIS §10.11). Nothing about a cycle is
 * stored (ADR-006) — `paid_at` is present ONLY on a cycle a PaymentRecord
 * exists for, so its absence is what "unpaid" means.
 */
export interface PaymentCycleDto {
  /** 0-based. */
  index: number;
  /** `YYYY-MM-DD` */
  start_date: string;
  /** `YYYY-MM-DD` */
  end_date: string;
  status: PaymentCycleStatus;
  /** ISO-8601 instant; absent unless `status` is `Paid`. */
  paid_at?: string;
}

/**
 * `GET /me/payments` resource (`PaymentLedgerDto`, TS §13; APIS §10.11):
 * the full cycle-by-cycle history (UXQ-10 — never a compact summary), the
 * oldest unpaid cycle's end date and the arrears count (FR-PAY-10).
 */
export interface PaymentLedgerDto {
  cycles: PaymentCycleDto[];
  /** `YYYY-MM-DD`; `null` when no derived cycle is unpaid. */
  next_due_date: string | null;
  arrears_count: number;
}

/** APIS §9.1 single-resource envelope. */
export interface PaymentLedgerResponse {
  data: PaymentLedgerDto;
}

/**
 * Fetches the caller's own derived payment ledger (Student only, API-045)
 * and unwraps the APIS §9.1 envelope `{ data: {...} }`. Errors surface as
 * `ApiError` unchanged (a Student with no Active membership is a `404`).
 */
export async function getMyPayments(): Promise<PaymentLedgerDto> {
  const response = await apiClient.get<PaymentLedgerResponse>('/me/payments');
  return response.data;
}
