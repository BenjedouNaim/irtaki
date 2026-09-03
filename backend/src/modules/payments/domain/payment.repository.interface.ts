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

/**
 * The same facts for one member of a group ledger (API-046), carrying the
 * student's identity so the per-student ledgers can be named (UF §18's
 * "name · current-cycle badge · arrears badge").
 */
export interface GroupLedgerContextRecord extends OwnLedgerContextRecord {
  /** `users.full_name` — nullable in the schema, never defaulted. */
  fullName: string | null;
}

/** One live `payment_records` row (E-07, DBT-08) — a cycle that was paid. */
export interface PaidCycleRecord {
  cycleIndex: number;
  /** ISO-8601 instant. */
  paidAt: string;
}

/** A `PaidCycleRecord` tagged with the membership it belongs to. */
export interface MembershipPaidCycleRecord extends PaidCycleRecord {
  membershipId: string;
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

  /**
   * Every Active membership of one group with the facts DS-06 derives from,
   * ordered by student name (APIS §9.4's group-scoped list order). Scope
   * lives in the WHERE clause of one indexed lookup (TS §15.2); the group
   * id handed in is the one that already passed the route's ScopeGuard.
   */
  findGroupLedgerContextsByGroupId(
    groupId: string,
  ): Promise<GroupLedgerContextRecord[]>;

  /**
   * Every live payment of the given memberships in one parameterised query
   * (DB-IDX-08) — the group ledger derives many students at once and must
   * not fan out into a query per student.
   */
  findPaidCyclesByMembershipIds(
    membershipIds: readonly string[],
  ): Promise<MembershipPaidCycleRecord[]>;
}
