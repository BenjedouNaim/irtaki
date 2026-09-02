import { Injectable } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import {
  ApplyCoverageMergeParams,
  CoverageRecord,
  ICoverageRepository,
} from '../domain/coverage.repository.interface';
import { MemorizationCoverageTypeOrmEntity } from './memorization-coverage.typeorm-entity';
import { CoverageIntervalTypeOrmEntity } from './coverage-interval.typeorm-entity';
import { HizbBoundaryTypeOrmEntity } from './hizb-boundary.typeorm-entity';

interface RawCoverageRow {
  id: string;
  membership_id: string;
  ahzab_completed: number | string;
  last_memorized_ordinal: number | string | null;
}

interface RawIntervalRow {
  start_ordinal: number | string;
  end_ordinal: number | string;
}

@Injectable()
export class CoverageRepository implements ICoverageRepository {
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
    manager: EntityManager,
  ): Promise<CoverageRecord | null> {
    const rows = await manager.query<RawCoverageRow[]>(
      `SELECT id, membership_id, ahzab_completed, last_memorized_ordinal
         FROM memorization_coverage
        WHERE membership_id = $1 AND deleted_at IS NULL`,
      [membershipId],
    );

    if (!rows || rows.length === 0) {
      return null;
    }

    return this.hydrate(rows[0], manager);
  }

  async applyMerge(
    coverageId: string,
    params: ApplyCoverageMergeParams,
    manager: EntityManager,
  ): Promise<void> {
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

    await manager.query(
      `UPDATE memorization_coverage
          SET ahzab_completed = $2,
              last_memorized_ordinal = $3,
              updated_at = now()
        WHERE id = $1`,
      [coverageId, params.ahzabCompleted, params.lastMemorizedOrdinal],
    );
  }

  private async hydrate(
    row: RawCoverageRow,
    manager: EntityManager,
  ): Promise<CoverageRecord> {
    const intervalRows = await manager.query<RawIntervalRow[]>(
      `SELECT start_ordinal, end_ordinal
         FROM coverage_intervals
        WHERE coverage_id = $1
        ORDER BY start_ordinal ASC`,
      [row.id],
    );

    return {
      id: row.id,
      membershipId: row.membership_id,
      ahzabCompleted: Number(row.ahzab_completed),
      lastMemorizedOrdinal:
        row.last_memorized_ordinal == null
          ? null
          : Number(row.last_memorized_ordinal),
      intervals: intervalRows.map((i) => ({
        startOrdinal: Number(i.start_ordinal),
        endOrdinal: Number(i.end_ordinal),
      })),
    };
  }
}
