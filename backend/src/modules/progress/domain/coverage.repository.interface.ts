import { EntityManager } from 'typeorm';

export const COVERAGE_REPOSITORY = Symbol('COVERAGE_REPOSITORY');

/** One `coverage_intervals` row (DBT-10), ordinal space. */
export interface CoverageIntervalRecord {
  startOrdinal: number;
  endOrdinal: number;
}

/** One `memorization_coverage` row (DBT-09) with its interval set. */
export interface CoverageRecord {
  id: string;
  membershipId: string;
  ahzabCompleted: number;
  lastMemorizedOrdinal: number | null;
  updatedAt: Date;
  /** Ascending by startOrdinal; disjoint and non-adjacent (VO-07). */
  intervals: CoverageIntervalRecord[];
}

export interface ApplyCoverageMergeParams {
  /**
   * The interval produced by DS-05 for this write. Every prior interval it
   * absorbed lies within it, so the persistence step is: delete the rows
   * inside `merged`, insert `merged` (uses DB-IDX-07).
   */
  merged: CoverageIntervalRecord;
  ahzabCompleted: number;
  lastMemorizedOrdinal: number;
  expectedUpdatedAt: Date;
}

/**
 * One live membership as ADR-029's nightly reconciliation needs it: the
 * materialised coverage row with its intervals, plus every memorisation
 * range its live `daily_reports` carry, ordered oldest-first so the newest
 * one is DEC-D02's `last_memorized_ordinal`.
 */
export interface CoverageReconciliationRecord extends CoverageRecord {
  submittedRanges: CoverageIntervalRecord[];
}

export interface ICoverageRepository {
  /** DS-01 one-time seed at membership acceptance (F-ENR-05). */
  seedFromHizbSelection(
    membershipId: string,
    hizbNumbers: number[],
    manager: EntityManager,
  ): Promise<void>;

  /**
   * The live (non-soft-deleted) coverage of a membership. Pass the caller's
   * `EntityManager` to read inside a use-case-owned transaction (ADR-028).
   * No row lock: TS §20 resolves concurrency without row-locking or elevated
   * isolation.
   */
  findByMembershipId(
    membershipId: string,
    manager?: EntityManager,
  ): Promise<CoverageRecord | null>;

  /**
   * Own-scope read (API-041): the live coverage of the caller's Active
   * membership, resolved by one indexed lookup joined on `memberships` with
   * `user_id = :caller` (TS §15.2 — scope applied in the query, never
   * post-filtered). Null when the caller has no Active membership or its
   * coverage is not live.
   */
  findActiveByUserId(userId: string): Promise<CoverageRecord | null>;

  /**
   * ADR-029: every live `memorization_coverage` row with its intervals and
   * with the memorisation ranges of the membership's live `daily_reports`
   * — the primary record the nightly job recomputes coverage FROM.
   * Global and unscoped by design: the job is "nightly, global" (SA §19).
   */
  findAllLiveForReconciliation(): Promise<CoverageReconciliationRecord[]>;

  /**
   * ADR-029's count-only correction: BR-51's `ahzab_completed` recomputed
   * over intervals that are already correct. Guarded by the same optimistic
   * `updated_at` check `applyMerge` uses (TS §20). No-op when another
   * writer moved the row first.
   */
  correctAhzabCompleted(
    coverageId: string,
    ahzabCompleted: number,
    expectedUpdatedAt: Date,
  ): Promise<boolean>;

  /** Persists one DS-05 merge result inside the caller's transaction. */
  applyMerge(
    coverageId: string,
    params: ApplyCoverageMergeParams,
    manager: EntityManager,
  ): Promise<void>;
}
