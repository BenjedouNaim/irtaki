export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');

/**
 * The membership facts DS-06 derives a ledger from (SAS §18.5): the cycle
 * clock `C0`, the two FR-PAY-12 generation stops, and the student's own
 * timezone — the single authority for "today" (T-01, INV-27).
 */
export interface OwnLedgerContextRecord {
  membershipId: string;
  /** `memberships.started_at` (`YYYY-MM-DD`). */
  startedAt: string;
  /** `memberships.ended_at` (`YYYY-MM-DD`), `null` while Active. */
  endedAt: string | null;
  /** `groups.archived_at` as an ISO-8601 instant, `null` while Active. */
  archivedAt: string | null;
  /** `users.timezone` (IANA). */
  timezone: string;
}

/** One live `payment_records` row (E-07, DBT-08) — a cycle that was paid. */
export interface PaidCycleRecord {
  cycleIndex: number;
  /** ISO-8601 instant. */
  paidAt: string;
}

export interface IPaymentRepository {
  /**
   * The caller's own Active membership context, or `null` when they have
   * none. Scope lives in the WHERE clause of one indexed lookup (TS §15.2).
   */
  findOwnLedgerContextByUserId(
    userId: string,
  ): Promise<OwnLedgerContextRecord | null>;

  /**
   * Every live payment of one membership, ascending by cycle index
   * (DB-IDX-08). Bounded by the membership's age — a handful of rows.
   */
  findPaidCyclesByMembershipId(
    membershipId: string,
  ): Promise<PaidCycleRecord[]>;
}
