import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AyahRange } from '../../domain/ayah-range';
import {
  planCoverageReconciliation,
  type CoverageReconciliationPlan,
} from '../../domain/coverage-reconciliation';
import { CoverageConcurrencyConflictError } from '../../domain/coverage.errors';
import {
  COVERAGE_REPOSITORY,
  type CoverageReconciliationRecord,
  type ICoverageRepository,
} from '../../domain/coverage.repository.interface';
import {
  HIZB_BOUNDARY_REPOSITORY,
  type IHizbBoundaryRepository,
} from '../../domain/hizb-boundary.repository.interface';
import {
  SURAH_REPOSITORY,
  type ISurahRepository,
} from '../../domain/surah.repository.interface';
import { toCoverageSet } from '../coverage-set.mapper';

/** One run's outcome, for the job's INFO log line (TS §30/§31). */
export interface CoverageReconciliationOutcome {
  /** Live `memorization_coverage` rows examined. */
  examined: number;
  /** Rows found to have drifted from `daily_reports`. */
  drifted: number;
  /** Rows this run corrected. */
  corrected: number;
}

/**
 * ADR-029's nightly correction, promoted from Recommended (AR-15) to
 * **Required**: "Daily Report submission and its coverage update are
 * deliberately two separate transactions (ADR-026's post-commit event
 * dispatch) — if the second fails, the report stays safely persisted but
 * coverage silently drifts until reconciled. A nightly job recomputes
 * coverage from `daily_reports` and corrects `memorization_coverage`."
 *
 * The correction is applied through the SAME `applyMerge` path a live
 * submission takes: one bounded delete-plus-insert per re-applied range,
 * guarded by the optimistic `updated_at` check the repository already
 * carries (TS §20 — no row lock, no elevated isolation), so a student
 * submitting a report while the job runs simply wins and the next night
 * catches whatever is left. There is no delete-everything-and-rewrite step
 * and therefore no transaction beyond the ones ADR-028/TS §19 already
 * sanction.
 *
 * Idempotent and safe to re-run at any time: a run that finds no drift
 * writes nothing at all.
 */
@Injectable()
export class CoverageReconciliationService {
  private readonly logger = new Logger(CoverageReconciliationService.name);

  constructor(
    @Inject(COVERAGE_REPOSITORY)
    private readonly coverageRepository: ICoverageRepository,
    @Inject(HIZB_BOUNDARY_REPOSITORY)
    private readonly hizbBoundaryRepository: IHizbBoundaryRepository,
    @Inject(SURAH_REPOSITORY)
    private readonly surahRepository: ISurahRepository,
    private readonly dataSource: DataSource,
  ) {}

  async reconcileAll(): Promise<CoverageReconciliationOutcome> {
    const surahs = await this.surahRepository.findAll();
    const hizbRanges = (await this.hizbBoundaryRepository.findAll()).map((h) =>
      AyahRange.fromOrdinals(h.startOrdinal, h.endOrdinal, surahs),
    );
    const records =
      await this.coverageRepository.findAllLiveForReconciliation();

    let drifted = 0;
    let corrected = 0;

    for (const record of records) {
      const plan = planCoverageReconciliation({
        stored: toCoverageSet(record.intervals, surahs),
        storedAhzabCompleted: record.ahzabCompleted,
        submittedRanges: record.submittedRanges.map((range) =>
          AyahRange.fromOrdinals(range.startOrdinal, range.endOrdinal, surahs),
        ),
        hizbRanges,
      });

      if (plan.consistent) {
        continue;
      }
      drifted += 1;

      if (await this.correct(record, plan)) {
        corrected += 1;
      }
    }

    return { examined: records.length, drifted, corrected };
  }

  /**
   * Re-applies the lost merges for one membership, oldest first. Returns
   * false when another writer moved the row underneath (the optimistic
   * guard rejected the write) — the drift is simply left for the next run,
   * which is the whole point of a nightly reconciliation.
   */
  private async correct(
    record: CoverageReconciliationRecord,
    plan: CoverageReconciliationPlan,
  ): Promise<boolean> {
    try {
      let expectedUpdatedAt = record.updatedAt;
      for (const step of plan.steps) {
        await this.coverageRepository.applyMerge(
          record.id,
          {
            merged: {
              startOrdinal: step.merged.startOrdinal,
              endOrdinal: step.merged.endOrdinal,
            },
            ahzabCompleted: plan.ahzabCompleted,
            // DEC-D02: the end position of the MOST RECENT submission —
            // the same value whichever lost merge is being re-applied.
            lastMemorizedOrdinal:
              plan.lastMemorizedOrdinal ?? step.merged.endOrdinal,
            expectedUpdatedAt,
          },
          this.dataSource.manager,
        );
        const reread = await this.coverageRepository.findByMembershipId(
          record.membershipId,
        );
        if (reread === null) {
          return false;
        }
        expectedUpdatedAt = reread.updatedAt;
      }

      // A pure count drift: every range is already covered but BR-51's
      // stored total disagrees with a recount over the same intervals.
      if (plan.steps.length === 0) {
        await this.coverageRepository.correctAhzabCompleted(
          record.id,
          plan.ahzabCompleted,
          expectedUpdatedAt,
        );
      }

      this.logger.warn(
        `Reconciled drifted coverage for membership ${record.membershipId}: re-applied ${plan.steps.length} lost merge(s), ahzab_completed now ${plan.ahzabCompleted}`,
      );
      return true;
    } catch (err: unknown) {
      if (err instanceof CoverageConcurrencyConflictError) {
        this.logger.warn(
          `Coverage reconciliation for membership ${record.membershipId} lost a race with a live write; left for the next run`,
        );
        return false;
      }
      throw err;
    }
  }
}
