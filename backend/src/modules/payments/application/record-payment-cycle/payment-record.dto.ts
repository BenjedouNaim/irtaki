/**
 * `PaymentRecordDto` (TS §13) — API-047's `201` body, exactly the five
 * fields APIS §10.11 lists: `{ id, cycle_index, amount: 30, paid_at,
 * recorded_by }`.
 *
 * `amount` is the fee that was **stored**, never a client-supplied figure:
 * BR-31 fixes it at 30 TND and the request body carries `cycle_index` and
 * nothing else. There is no reversal field of any kind — DBQ-02 keeps
 * `reversed_at`/`reversal_of_payment_id` out of the schema and ISS-02 is an
 * accepted MVP gap, not something to design around.
 */
export interface PaymentRecordDto {
  id: string;
  /** 0-based, as stored (DB-CHK-18). */
  cycle_index: number;
  /** BR-31's fixed 30 TND. */
  amount: number;
  /** ISO-8601 instant. */
  paid_at: string;
  /** BR-34 — the Assistant who recorded it. */
  recorded_by: string;
}

/** APIS §9.1 single-resource envelope. */
export interface RecordPaymentCycleResponseDto {
  data: PaymentRecordDto;
}
