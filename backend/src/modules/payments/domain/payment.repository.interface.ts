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

/** The one write of the whole module (API-047): a cycle asserted as paid. */
export interface RecordPaidCycleInput {
  membershipId: string;
  /** 0-based (DB-CHK-18). */
  cycleIndex: number;
  /** BR-31's fixed fee — supplied by the domain, never by a client. */
  amount: number;
  /** BR-34 — the Assistant who asserted it (`payment_records.recorded_by`). */
  recordedBy: string;
  /** When it was recorded (`payment_records.paid_at`). */
  paidAt: Date;
}

/** The persisted `payment_records` row, as API-047's `201` reports it. */
export interface PaymentRecordCreatedRecord {
  id: string;
  cycleIndex: number;
  /**
   * The amount that was actually stored, read back rather than echoed:
   * DBD §16 keeps the fee per-row "so a future price change never
   * invalidates historical records", which only holds if the response
   * reports the row and not the constant.
   */
  amount: number;
  /** ISO-8601 instant. */
  paidAt: string;
  recordedBy: string;
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

  /**
   * The DS-06 context of one **Active** membership, or `null` when the id
   * names none. Scope lives in the WHERE clause of one indexed lookup
   * (TS §15.2) — the membership id handed in is the one that already passed
   * API-047's ScopeGuard, and the repository still scopes on it (SA §14's
   * second layer).
   */
  findLedgerContextByMembershipId(
    membershipId: string,
  ): Promise<OwnLedgerContextRecord | null>;

  /**
   * Inserts one `payment_records` row (API-047). A single auto-committed
   * INSERT — no `QueryRunner`, since TS §19 lists "Record Payment Cycle" as
   * "Single insert". A duplicate cycle is rejected by DB-UQ-06 and the
   * driver error travels up unchanged for the use case to translate into
   * the `409` (TS §20: never SELECT-then-INSERT).
   */
  createPaidCycle(
    input: RecordPaidCycleInput,
  ): Promise<PaymentRecordCreatedRecord>;
}
