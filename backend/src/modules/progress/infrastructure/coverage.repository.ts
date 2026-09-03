import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import {
  ApplyCoverageMergeParams,
  CoverageIntervalRecord,
  CoverageReconciliationRecord,
  CoverageRecord,
  ICoverageRepository,
} from '../domain/coverage.repository.interface';
import { MemorizationCoverageTypeOrmEntity } from './memorization-coverage.typeorm-entity';
import { CoverageIntervalTypeOrmEntity } from './coverage-interval.typeorm-entity';
import { HizbBoundaryTypeOrmEntity } from './hizb-boundary.typeorm-entity';

import { CoverageConcurrencyConflictError } from '../domain/coverage.errors';

interface RawAggregatedInterval {
  start_ordinal: number | string;
  end_ordinal: number | string;
}

interface RawSubmittedRangeRow {
  membership_id: string;
  start_ordinal: number | string;
  end_ordinal: number | string;
}

interface RawCoverageWithIntervalsRow {
  id: string;
  membership_id: string;
  ahzab_completed: number | string;
  last_memorized_ordinal: number | string | null;
  updated_at: string | Date;
  intervals: RawAggregatedInterval[] | string | null;
}

@Injectable()
export class CoverageRepository implements ICoverageRepository {
  constructor(
    @InjectRepository(MemorizationCoverageTypeOrmEntity)
    private readonly coverageRepo: Repository<MemorizationCoverageTypeOrmEntity>,
  ) {}

  async seedFromHizbSelection(
    membershipId: string,
    hizbNumbers: number[],
    manager: EntityManager,
  ): Promise<void> {
    const coverageId = uuidv7();

    const coverageEntity = manager.create(MemorizationCoverageTypeOrmEntity, {
      id: coverageId,
      membershipId,
      ahzabCompleted: hizbNumbers.length,
      lastMemorizedOrdinal: null,
    });

    await manager.save(MemorizationCoverageTypeOrmEntity, coverageEntity);

    if (hizbNumbers.length > 0) {
      const boundaries = await manager.find(HizbBoundaryTypeOrmEntity, {
        where: { hizbNumber: In(hizbNumbers) },
        order: { hizbNumber: 'ASC' },
      });

      const intervalEntities = boundaries.map((b) =>
        manager.create(CoverageIntervalTypeOrmEntity, {
          id: uuidv7(),
          coverageId,
          startOrdinal: b.startOrdinal,
          endOrdinal: b.endOrdinal,
        }),
      );

      await manager.save(CoverageIntervalTypeOrmEntity, intervalEntities);
    }
  }

  async findByMembershipId(
    membershipId: string,
    manager: EntityManager = this.coverageRepo.manager,
  ): Promise<CoverageRecord | null> {
    // Single-statement atomic read using json_agg to guarantee internal consistency
    // across coverage and intervals under READ COMMITTED.
    const rows = await manager.query<RawCoverageWithIntervalsRow[]>(
      `SELECT c.id,
              c.membership_id,
              c.ahzab_completed,
              c.last_memorized_ordinal,
              c.updated_at::text AS updated_at,
              COALESCE(
                json_agg(
                  json_build_object(
                    'start_ordinal', i.start_ordinal,
                    'end_ordinal', i.end_ordinal
                  ) ORDER BY i.start_ordinal ASC
                ) FILTER (WHERE i.id IS NOT NULL),
                '[]'::json
              ) AS intervals
         FROM memorization_coverage c
         LEFT JOIN coverage_intervals i ON i.coverage_id = c.id
        WHERE c.membership_id = $1 AND c.deleted_at IS NULL
        GROUP BY c.id`,
      [membershipId],
    );

    if (!rows || rows.length === 0) {
      return null;
    }

    return this.hydrate(rows[0]);
  }

  async findActiveByUserId(userId: string): Promise<CoverageRecord | null> {
    const manager = this.coverageRepo.manager;
    // Single-statement atomic read using json_agg to guarantee internal consistency
    // across coverage and intervals under READ COMMITTED.
    const rows = await manager.query<RawCoverageWithIntervalsRow[]>(
      `SELECT c.id,
              c.membership_id,
              c.ahzab_completed,
              c.last_memorized_ordinal,
              c.updated_at::text AS updated_at,
              COALESCE(
                json_agg(
                  json_build_object(
                    'start_ordinal', i.start_ordinal,
                    'end_ordinal', i.end_ordinal
                  ) ORDER BY i.start_ordinal ASC
                ) FILTER (WHERE i.id IS NOT NULL),
                '[]'::json
              ) AS intervals
         FROM memorization_coverage c
         JOIN memberships m ON m.id = c.membership_id
         LEFT JOIN coverage_intervals i ON i.coverage_id = c.id
        WHERE m.user_id = $1
          AND m.state = 'Active'
          AND c.deleted_at IS NULL
        GROUP BY c.id`,
      [userId],
    );

    if (!rows || rows.length === 0) {
      return null;
    }

    return this.hydrate(rows[0]);
  }

  /**
   * ADR-029's input set, in two literal parameterised statements (TS §36):
   * the live coverage rows with their intervals, and the live daily-report
   * memorisation ranges keyed by membership. Both are unscoped — the
   * reconciliation is global (SA §19 "Nightly, global") — and neither
   * locks or opens a transaction (TS §19/§20).
   *
   * `deleted_at IS NULL` on both sides: a terminated membership's coverage
   * and reports are soft-deleted together (DS-09 cascade), so a removed
   * student is simply absent from the sweep.
   */
  async findAllLiveForReconciliation(): Promise<
    CoverageReconciliationRecord[]
  > {
    const coverageRows = await this.coverageRepo.manager.query<
      RawCoverageWithIntervalsRow[]
    >(
      `SELECT c.id,
              c.membership_id,
              c.ahzab_completed,
              c.last_memorized_ordinal,
              c.updated_at,
              COALESCE(
                json_agg(
                  json_build_object(
                    'start_ordinal', i.start_ordinal,
                    'end_ordinal', i.end_ordinal
                  ) ORDER BY i.start_ordinal
                ) FILTER (WHERE i.id IS NOT NULL),
                '[]'::json
              ) AS intervals
         FROM memorization_coverage c
         LEFT JOIN coverage_intervals i ON i.coverage_id = c.id
        WHERE c.deleted_at IS NULL
        GROUP BY c.id`,
      [],
    );

    const rangeRows = await this.coverageRepo.manager.query<
      RawSubmittedRangeRow[]
    >(
      `SELECT r.membership_id,
              r.memo_from_ordinal AS start_ordinal,
              r.memo_to_ordinal   AS end_ordinal
         FROM daily_reports r
        WHERE r.deleted_at IS NULL
          AND r.memo_from_ordinal IS NOT NULL
          AND r.memo_to_ordinal IS NOT NULL
        ORDER BY r.membership_id, r.report_date, r.submitted_at`,
      [],
    );

    const rangesByMembership = new Map<string, CoverageIntervalRecord[]>();
    for (const row of rangeRows) {
      const ranges = rangesByMembership.get(row.membership_id) ?? [];
      ranges.push({
        startOrdinal: Number(row.start_ordinal),
        endOrdinal: Number(row.end_ordinal),
      });
      rangesByMembership.set(row.membership_id, ranges);
    }

    return coverageRows.map((row) => ({
      ...this.hydrate(row),
      submittedRanges: rangesByMembership.get(row.membership_id) ?? [],
    }));
  }

  async correctAhzabCompleted(
    coverageId: string,
    ahzabCompleted: number,
    expectedUpdatedAt: Date,
  ): Promise<boolean> {
    const rows = await this.coverageRepo.manager.query<Array<{ id: string }>>(
      `UPDATE memorization_coverage
          SET ahzab_completed = $2,
              updated_at = now()
        WHERE id = $1
          AND (
            updated_at = $3::timestamptz
            OR date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $3::timestamptz)
          )
        RETURNING id`,
      [coverageId, ahzabCompleted, expectedUpdatedAt.toISOString()],
    );
    return rows.length > 0;
  }

  async applyMerge(
    coverageId: string,
    params: ApplyCoverageMergeParams,
    manager: EntityManager,
  ): Promise<void> {
    // Optimistic concurrency serialization (TS §20 constraint-based style):
    // verify updated_at matches our read before applying changes.
    // Compares with microsecond precision or millisecond truncation fallback.
    const updateResult = await manager.query<Array<{ id: string }>>(
      `UPDATE memorization_coverage
          SET ahzab_completed = $2,
              last_memorized_ordinal = $3,
              updated_at = now()
        WHERE id = $1
          AND (
            updated_at = $4::timestamptz
            OR date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $4::timestamptz)
          )
        RETURNING id`,
      [
        coverageId,
        params.ahzabCompleted,
        params.lastMemorizedOrdinal,
        typeof params.expectedUpdatedAt === 'string'
          ? params.expectedUpdatedAt
          : params.expectedUpdatedAt.toISOString(),
      ],
    );

    if (!updateResult || updateResult.length === 0) {
      throw new CoverageConcurrencyConflictError(
        'Concurrent update detected on memorization_coverage',
      );
    }

    // Every interval absorbed by the merge lies inside `merged`, and no
    // surviving interval can (they are disjoint and non-adjacent to it), so a
    // bounded delete + one insert reproduces (coverage − candidates) ∪ {merged}.
    await manager.query(
      `DELETE FROM coverage_intervals
        WHERE coverage_id = $1
          AND start_ordinal >= $2
          AND end_ordinal <= $3`,
      [coverageId, params.merged.startOrdinal, params.merged.endOrdinal],
    );

    await manager.query(
      `INSERT INTO coverage_intervals (id, coverage_id, start_ordinal, end_ordinal)
       VALUES ($1, $2, $3, $4)`,
      [
        uuidv7(),
        coverageId,
        params.merged.startOrdinal,
        params.merged.endOrdinal,
      ],
    );
  }

  private hydrate(row: RawCoverageWithIntervalsRow): CoverageRecord {
    let parsedIntervals: RawAggregatedInterval[] = [];
    if (Array.isArray(row.intervals)) {
      parsedIntervals = row.intervals;
    } else if (typeof row.intervals === 'string') {
      try {
        parsedIntervals = JSON.parse(row.intervals) as RawAggregatedInterval[];
      } catch {
        parsedIntervals = [];
      }
    }

    return {
      id: row.id,
      membershipId: row.membership_id,
      ahzabCompleted: Number(row.ahzab_completed),
      lastMemorizedOrdinal:
        row.last_memorized_ordinal == null
          ? null
          : Number(row.last_memorized_ordinal),
      updatedAt: new Date(row.updated_at),
      intervals: parsedIntervals.map((i) => ({
        startOrdinal: Number(i.start_ordinal),
        endOrdinal: Number(i.end_ordinal),
      })),
    };
  }
}
