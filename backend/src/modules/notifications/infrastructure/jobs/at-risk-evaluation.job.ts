import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { HealthchecksPingService } from '../../../../shared/observability/healthchecks-ping.service';
import { AtRiskEvaluator } from '../../application/evaluators/at-risk.evaluator';
import type { EvaluationOutcome } from '../../application/evaluators/evaluation-outcome';
import {
  DAILY_JOB_CRON_EXPRESSION,
  runScheduledJob,
} from '../../../../shared/scheduling/scheduled-job';

/** `HEALTHCHECKS_PING_URL_<key>` (TS §32) — one dead-man's-switch per job. */
export const AT_RISK_EVALUATION_PING_KEY = 'AT_RISK_EVALUATION';

/** `SchedulerRegistry` handle — lets a test stop the tick deterministically. */
export const AT_RISK_EVALUATION_CRON = 'at-risk-evaluation';

/**
 * `AtRiskEvaluationJob` (SA §19 "Tick, daily" → "N-07, once per episode
 * (ISS-17)", §23 Required; TS §31).
 *
 * Daily, on the server clock, which runs UTC (T-04) — SA §19 marks only the
 * reminder and the weekly finalisation as local-time-filtered, so this one
 * is deliberately global and no hour is invented beyond the day boundary.
 * The evaluation is still per-student-timezone: `EffectiveWindow(m)` and
 * "today" are resolved from each row's `users.timezone` whatever hour the
 * job happens to run at.
 *
 * Re-running is harmless: DS-04 is a read-time predicate over stored
 * reports, and the ISS-17 guard is a `notification_log` read, so a catch-up
 * run after a missed day dispatches at most the notifications the missed
 * run would have (AR-17 idempotency).
 */
@Injectable()
export class AtRiskEvaluationJob {
  private readonly logger = new Logger(AtRiskEvaluationJob.name);
  private readonly state = { running: false };

  constructor(
    private readonly evaluator: AtRiskEvaluator,
    private readonly healthchecks: HealthchecksPingService,
  ) {}

  @Cron(DAILY_JOB_CRON_EXPRESSION, { name: AT_RISK_EVALUATION_CRON })
  async tick(): Promise<void> {
    await this.run();
  }

  run(now: Date = new Date()): Promise<EvaluationOutcome | null> {
    return runScheduledJob({
      logger: this.logger,
      jobName: AtRiskEvaluationJob.name,
      pingKey: AT_RISK_EVALUATION_PING_KEY,
      healthchecks: this.healthchecks,
      state: this.state,
      work: () => this.evaluator.evaluate(now),
      describe: (outcome) =>
        `N-07 ${outcome.sent}/${outcome.triggered} sent, over ${outcome.candidates} live membership(s)`,
    });
  }
}
