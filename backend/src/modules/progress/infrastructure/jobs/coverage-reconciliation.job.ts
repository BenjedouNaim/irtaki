import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { HealthchecksPingService } from '../../../../shared/observability/healthchecks-ping.service';
import {
  DAILY_JOB_CRON_EXPRESSION,
  runScheduledJob,
} from '../../../../shared/scheduling/scheduled-job';
import {
  CoverageReconciliationOutcome,
  CoverageReconciliationService,
} from '../../application/reconcile-coverage/coverage-reconciliation.service';

/** `HEALTHCHECKS_PING_URL_<key>` (TS §32) — one dead-man's-switch per job. */
export const COVERAGE_RECONCILIATION_PING_KEY = 'COVERAGE_RECONCILIATION';

/** `SchedulerRegistry` handle — lets a test stop the tick deterministically. */
export const COVERAGE_RECONCILIATION_CRON = 'coverage-reconciliation';

/**
 * `CoverageReconciliationJob` (ADR-029; SA §19 "Nightly, global", §23
 * **Required**; TS §31) — the in-process cron trigger (ADR-024) for the
 * coverage repair ADR-026's two-transaction submission path makes necessary.
 *
 * It was missed when F-PRG-01 was scoped in EPIC-04 and is picked up here,
 * where the rest of the scheduled-job infrastructure is being built: it
 * shares `runScheduledJob` with the other four, so it gets the same
 * correlationId context, the same overlap guard, the same INFO/ERROR
 * outcome lines and the same Healthchecks.io dead-man's-switch — the last
 * of which TS §50 names as the mitigation for this job failing silently.
 *
 * Nightly and global (SA §19): no timezone filter, because coverage is not
 * a day-boundary concept. Once per day on the server clock, which runs UTC
 * (T-04) — the day boundary itself, no hour invented.
 */
@Injectable()
export class CoverageReconciliationJob {
  private readonly logger = new Logger(CoverageReconciliationJob.name);
  private readonly state = { running: false };

  constructor(
    private readonly reconciliationService: CoverageReconciliationService,
    private readonly healthchecks: HealthchecksPingService,
  ) {}

  @Cron(DAILY_JOB_CRON_EXPRESSION, { name: COVERAGE_RECONCILIATION_CRON })
  async tick(): Promise<void> {
    await this.run();
  }

  run(): Promise<CoverageReconciliationOutcome | null> {
    return runScheduledJob({
      logger: this.logger,
      jobName: CoverageReconciliationJob.name,
      pingKey: COVERAGE_RECONCILIATION_PING_KEY,
      healthchecks: this.healthchecks,
      state: this.state,
      work: () => this.reconciliationService.reconcileAll(),
      describe: (outcome) =>
        `corrected ${outcome.corrected} of ${outcome.drifted} drifted coverage row(s), over ${outcome.examined} examined`,
    });
  }
}
