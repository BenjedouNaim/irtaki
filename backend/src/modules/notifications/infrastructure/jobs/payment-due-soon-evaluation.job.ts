import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { HealthchecksPingService } from '../../../../shared/observability/healthchecks-ping.service';
import type { EvaluationOutcome } from '../../application/evaluators/evaluation-outcome';
import { PaymentDueSoonEvaluator } from '../../application/evaluators/payment-due-soon.evaluator';
import {
  DAILY_JOB_CRON_EXPRESSION,
  runScheduledJob,
} from '../../../../shared/scheduling/scheduled-job';

/** `HEALTHCHECKS_PING_URL_<key>` (TS §32) — one dead-man's-switch per job. */
export const PAYMENT_DUE_SOON_EVALUATION_PING_KEY =
  'PAYMENT_DUE_SOON_EVALUATION';

/** `SchedulerRegistry` handle — lets a test stop the tick deterministically. */
export const PAYMENT_DUE_SOON_EVALUATION_CRON = 'payment-due-soon-evaluation';

/**
 * `PaymentDueSoonEvaluationJob` (SA §19 "Tick, daily" → "N-06, once per
 * cycle (ISS-17)", §23 Required; TS §31).
 *
 * Daily on the server clock, for the same reason as `AtRiskEvaluationJob`;
 * BR-33's ten-day window is evaluated per row against that student's local
 * today. SAS §19.4 lists "Payment `Due Soon`" as needing **no** job — and
 * it does not, for the *status*, which DS-06 derives at read time
 * (ADR-006/DEC-A06). What this job evaluates is the NOTIFICATION of that
 * status, which SA §19 and §23 do classify as Required.
 */
@Injectable()
export class PaymentDueSoonEvaluationJob {
  private readonly logger = new Logger(PaymentDueSoonEvaluationJob.name);
  private readonly state = { running: false };

  constructor(
    private readonly evaluator: PaymentDueSoonEvaluator,
    private readonly healthchecks: HealthchecksPingService,
  ) {}

  @Cron(DAILY_JOB_CRON_EXPRESSION, { name: PAYMENT_DUE_SOON_EVALUATION_CRON })
  async tick(): Promise<void> {
    await this.run();
  }

  run(now: Date = new Date()): Promise<EvaluationOutcome | null> {
    return runScheduledJob({
      logger: this.logger,
      jobName: PaymentDueSoonEvaluationJob.name,
      pingKey: PAYMENT_DUE_SOON_EVALUATION_PING_KEY,
      healthchecks: this.healthchecks,
      state: this.state,
      work: () => this.evaluator.evaluate(now),
      describe: (outcome) =>
        `N-06 ${outcome.sent}/${outcome.triggered} sent, over ${outcome.candidates} live membership(s)`,
    });
  }
}
