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

export interface ICoverageRepository {
  /** DS-01 one-time seed at membership acceptance (F-ENR-05). */
  seedFromHizbSelection(
    membershipId: string,
    hizbNumbers: number[],
    manager: EntityManager,
  ): Promise<void>;

  /**
   * Loads the live (non-soft-deleted) coverage row for a membership through
   * the caller's `EntityManager` (use-case-owned transaction, ADR-028). No row
   * lock: TS §20 resolves concurrency without row-locking or elevated
   * isolation.
   */
  findByMembershipId(
    membershipId: string,
    manager: EntityManager,
  ): Promise<CoverageRecord | null>;

  /** Persists one DS-05 merge result inside the caller's transaction. */
  applyMerge(
    coverageId: string,
    params: ApplyCoverageMergeParams,
    manager: EntityManager,
  ): Promise<void>;
}
