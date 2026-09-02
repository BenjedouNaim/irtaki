import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { DailyReportSubmittedEvent } from '../../../reports/domain/events/daily-report-submitted.event';
import { AyahRange } from '../../domain/ayah-range';
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
 * Internal-only use case (TS §11: Progress "reacts to DE-05"). Applies DS-05
 * to one submitted memorisation range in its own transaction, deliberately
 * separate from the report insert (TS §19, ADR-026/029).
 *
 * No API endpoint of its own (F-PRG-01).
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
    event: DailyReportSubmittedEvent,
  ): Promise<UpdateCoverageOutcome> {
    // DE-05 → DS-05 only "if a memo range is present" (DMS §17).
    if (!event.memoRange) {
      return { status: 'skipped', reason: 'NO_MEMO_RANGE' };
    }

    const surahs = await this.surahRepository.findAll();

    // VO-02: the one place BR-52 and the ordinal derivation are enforced.
    const range = AyahRange.fromSurahAyah(
      event.memoRange.start,
      event.memoRange.end,
      surahs,
    );

    const hizbRanges = (await this.hizbBoundaryRepository.findAll()).map((h) =>
      AyahRange.fromOrdinals(h.startOrdinal, h.endOrdinal, surahs),
    );

    const merge = await this.dataSource.transaction(async (manager) => {
      const record = await this.coverageRepository.findByMembershipId(
        event.membershipId,
        manager,
      );
      if (!record) {
        return null;
      }

      const current = toCoverageSet(record.intervals, surahs);
      const result = MemorizationProgressEngine.merge(
        current,
        range,
        hizbRanges,
      );

      await this.coverageRepository.applyMerge(
        record.id,
        {
          merged: {
            startOrdinal: result.merged.startOrdinal,
            endOrdinal: result.merged.endOrdinal,
          },
          ahzabCompleted: result.ahzabCompleted,
          lastMemorizedOrdinal: result.lastMemorizedOrdinal,
        },
        manager,
      );

      return result;
    });

    if (!merge) {
      // INV-17 says a live membership always has coverage; a terminated one
      // has it soft-deleted. Nothing to update either way.
      this.logger.warn(
        { membershipId: event.membershipId },
        'DE-05 received for a membership with no live coverage row',
      );
      return { status: 'skipped', reason: 'COVERAGE_NOT_FOUND' };
    }

    // DE-06 CoverageUpdated — post-commit, fire-and-forget (ADR-026/032).
    try {
      this.eventEmitter.emit(
        CoverageUpdatedEvent.EVENT_NAME,
        new CoverageUpdatedEvent(
          event.membershipId,
          merge.coverage.intervals,
          merge.ahzabCompleted,
        ),
      );
    } catch {
      // Event emission failure must never fail the coverage write.
    }

    return {
      status: 'updated',
      membershipId: event.membershipId,
      ahzabCompleted: merge.ahzabCompleted,
      lastMemorizedOrdinal: merge.lastMemorizedOrdinal,
      intervals: merge.coverage.intervals,
    };
  }
}
