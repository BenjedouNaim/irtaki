import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { HealthchecksPingService } from '../../../../shared/observability/healthchecks-ping.service';
import {
  ADR_030_TICK_CRON_EXPRESSION,
  runScheduledJob,
} from '../../../../shared/scheduling/scheduled-job';
import {
  WeeklyReportFinalizationOutcome,
  WeeklyReportFinalizationService,
} from '../../application/finalise-weekly-reports/weekly-report-finalization.service';

/** `HEALTHCHECKS_PING_URL_<key>` (TS §32) — one dead-man's-switch per job. */
export const WEEKLY_REPORT_FINALIZATION_PING_KEY = 'WEEKLY_REPORT_FINALIZATION';

/**
 * ADR-030's single tick: every 15 minutes, on the quarter hour (six-field
 * cron with seconds, as `@nestjs/schedule` parses it), on the server clock.
 * Re-exported from the shared constant F-NOT-05 extracted from this file,
 * so all five of TS §31's jobs demonstrably ride ONE tick definition.
 */
export const WEEKLY_REPORT_FINALIZATION_CRON_EXPRESSION =
  ADR_030_TICK_CRON_EXPRESSION;

/** `SchedulerRegistry` handle — lets a test stop the tick deterministically. */
export const WEEKLY_REPORT_FINALIZATION_CRON = 'weekly-report-finalization';

/**
 * `WeeklyReportFinalizationJob` (SA §19 background jobs, §23 Required;
 * TS §31) — the in-process cron trigger (ADR-024, `@nestjs/schedule`) for
 * DS-02.
 *
 * Schedule: ADR-030 — "a single tick every 15 minutes, filtering by each
 * user's computed local time from their persisted timezone — not one cron
 * entry per timezone". The tick itself is timezone-less (`* /15` on the
 * server clock, running in UTC per T-04); the "local midnight" filter of
 * SA §19 ("Tick, filtered to local midnight") is DS-02's per-row predicate
 * over `users.timezone` (T-01), so each student's week is finalised on the
 * first tick after THEIR midnight (FR-WR-06, AC-12), at most 15 minutes
 * late. Overlapping ticks are skipped (WARN); a missed tick is caught up
 * by the next one (SAS §19.6 — DS-02 is idempotent).
 *
 * Logging (TS §30): run outcome at INFO (success/fail per tick — the
 * scheduled-job counter of TS §31), failure at ERROR with the cause. Every
 * line carries a `correlationId` (TS §30, SA §26): a tick has no HTTP
 * request, so each run opens its own `correlationStorage` context with a
 * fresh id that the Pino bridge stamps on the job's lines and on anything
 * DS-02 logs beneath it. On success, the Healthchecks.io dead-man's-switch
 * is pinged (TS §31, `HEALTHCHECKS_PING_URL_WEEKLY_REPORT_FINALIZATION`).
 * A tick never throws: an exception here would only reach the scheduler's
 * own handler.
 */
@Injectable()
export class WeeklyReportFinalizationJob {
  private readonly logger = new Logger(WeeklyReportFinalizationJob.name);
  private readonly state = { running: false };

  constructor(
    private readonly finalizationService: WeeklyReportFinalizationService,
    private readonly healthchecks: HealthchecksPingService,
  ) {}

  @Cron(WEEKLY_REPORT_FINALIZATION_CRON_EXPRESSION, {
    name: WEEKLY_REPORT_FINALIZATION_CRON,
  })
  async tick(): Promise<void> {
    await this.run();
  }

  /**
   * One run against `now` (injectable for tests). Resolves the outcome, or
   * null when the run was skipped (overlap) or failed (already logged).
   *
   * The correlationId context, the overlap guard, the INFO/ERROR outcome
   * lines and the Healthchecks.io ping are `runScheduledJob` — the shared
   * mechanism every scheduled job in this codebase uses, extracted from
   * THIS job in F-NOT-05 and unchanged in behaviour.
   */
  run(now: Date = new Date()): Promise<WeeklyReportFinalizationOutcome | null> {
    return runScheduledJob({
      logger: this.logger,
      jobName: WeeklyReportFinalizationJob.name,
      pingKey: WEEKLY_REPORT_FINALIZATION_PING_KEY,
      healthchecks: this.healthchecks,
      state: this.state,
      work: () => this.finalizationService.finaliseOverdue(now),
      describe: (outcome) =>
        `finalised ${outcome.finalised} of ${outcome.candidates} open weekly report(s)`,
    });
  }
}
