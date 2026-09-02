import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, EntityManager } from 'typeorm';
import { AyahRange } from '../../domain/ayah-range';
import { CoverageConcurrencyConflictError } from '../../domain/coverage.errors';
import {
  COVERAGE_REPOSITORY,
  type ICoverageRepository,
} from '../../domain/coverage.repository.interface';
import { CoverageUpdatedEvent } from '../../domain/events/coverage-updated.event';
import {
  HIZB_BOUNDARY_REPOSITORY,
  type IHizbBoundaryRepository,
} from '../../domain/hizb-boundary.repository.interface';
import { MemorizationProgressEngine } from '../../domain/memorization-progress-engine';
import {
  SURAH_REPOSITORY,
  type ISurahRepository,
} from '../../domain/surah.repository.interface';
import { toCoverageSet } from '../coverage-set.mapper';

export interface UpdateCoverageAyahCoordinate {
  surah: number;
  ayah: number;
}

export interface UpdateCoverageCommand {
  membershipId: string;
  memoRange?: {
    start: UpdateCoverageAyahCoordinate;
    end: UpdateCoverageAyahCoordinate;
  } | null;
}

export type UpdateCoverageOutcome =
  | { status: 'skipped'; reason: 'NO_MEMO_RANGE' | 'COVERAGE_NOT_FOUND' }
  | {
      status: 'updated';
      membershipId: string;
      ahzabCompleted: number;
      lastMemorizedOrdinal: number;
      intervals: readonly AyahRange[];
    };

/**
 * Service use case applying DS-05 to one submitted memorisation range.
 * Directly, synchronously callable by SubmitDailyReportUseCase (EPIC-05)
 * so post-submission ahzab_completed is returned in the API-030 201 response.
 *
 * Supports execution inside an external transaction (via optional EntityManager)
 * or in its own transaction with optimistic concurrency retry (TS §20).
 */
@Injectable()
export class UpdateCoverageUseCase {
  private readonly logger = new Logger(UpdateCoverageUseCase.name);

  constructor(
    @Inject(COVERAGE_REPOSITORY)
    private readonly coverageRepository: ICoverageRepository,
    @Inject(HIZB_BOUNDARY_REPOSITORY)
    private readonly hizbBoundaryRepository: IHizbBoundaryRepository,
    @Inject(SURAH_REPOSITORY)
    private readonly surahRepository: ISurahRepository,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(
    command: UpdateCoverageCommand,
    manager?: EntityManager,
  ): Promise<UpdateCoverageOutcome> {
    // DS-05 only "if a memo range is present" (DMS §17).
    if (!command.memoRange) {
      return { status: 'skipped', reason: 'NO_MEMO_RANGE' };
    }

    const surahs = await this.surahRepository.findAll();

    // VO-02: the one place BR-52 and the ordinal derivation are enforced.
    // Validated before starting the transaction.
    const range = AyahRange.fromSurahAyah(
      command.memoRange.start,
      command.memoRange.end,
      surahs,
    );

    const hizbRanges = (await this.hizbBoundaryRepository.findAll()).map((h) =>
      AyahRange.fromOrdinals(h.startOrdinal, h.endOrdinal, surahs),
    );

    if (manager) {
      return this.executeWithManager(
        command,
        range,
        hizbRanges,
        surahs,
        manager,
      );
    }

    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.dataSource.transaction(async (txManager) => {
          return this.executeWithManager(
            command,
            range,
            hizbRanges,
            surahs,
            txManager,
          );
        });
      } catch (err) {
        if (
          err instanceof CoverageConcurrencyConflictError &&
          attempt < MAX_RETRIES
        ) {
          this.logger.warn(
            `Concurrent coverage update detected for membership ${command.membershipId}, retrying (attempt ${attempt}/${MAX_RETRIES})`,
          );
          continue;
        }
        throw err;
      }
    }

    throw new CoverageConcurrencyConflictError(
      `Failed to update coverage for membership ${command.membershipId} after ${MAX_RETRIES} attempts due to concurrent updates`,
    );
  }

  private async executeWithManager(
    command: UpdateCoverageCommand,
    range: AyahRange,
    hizbRanges: readonly AyahRange[],
    surahs: readonly import('../../domain/ayah-position').SurahOrdinalInfo[],
    manager: EntityManager,
  ): Promise<UpdateCoverageOutcome> {
    const record = await this.coverageRepository.findByMembershipId(
      command.membershipId,
      manager,
    );
    if (!record) {
      // INV-17 says a live membership always has coverage; a terminated one
      // has it soft-deleted. Nothing to update either way.
      this.logger.warn(
        `Coverage update requested for membership ${command.membershipId} with no live coverage row`,
      );
      return { status: 'skipped', reason: 'COVERAGE_NOT_FOUND' };
    }

    const current = toCoverageSet(record.intervals, surahs);
    const result = MemorizationProgressEngine.merge(current, range, hizbRanges);

    await this.coverageRepository.applyMerge(
      record.id,
      {
        merged: {
          startOrdinal: result.merged.startOrdinal,
          endOrdinal: result.merged.endOrdinal,
        },
        ahzabCompleted: result.ahzabCompleted,
        lastMemorizedOrdinal: result.lastMemorizedOrdinal,
        expectedUpdatedAt: record.updatedAt,
      },
      manager,
    );

    // DE-06 CoverageUpdated — post-commit, fire-and-forget (ADR-026/032).
    try {
      this.eventEmitter.emit(
        CoverageUpdatedEvent.EVENT_NAME,
        new CoverageUpdatedEvent(
          command.membershipId,
          result.coverage.intervals,
          result.ahzabCompleted,
        ),
      );
    } catch {
      // Event emission failure must never fail the coverage write.
    }

    return {
      status: 'updated',
      membershipId: command.membershipId,
      ahzabCompleted: result.ahzabCompleted,
      lastMemorizedOrdinal: result.lastMemorizedOrdinal,
      intervals: result.coverage.intervals,
    };
  }
}
