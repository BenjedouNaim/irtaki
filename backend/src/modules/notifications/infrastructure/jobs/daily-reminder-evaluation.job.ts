import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { HealthchecksPingService } from '../../../../shared/observability/healthchecks-ping.service';
import { DailyReminderEvaluator } from '../../application/evaluators/daily-reminder.evaluator';
import type { EvaluationOutcome } from '../../application/evaluators/evaluation-outcome';
import { WeeklyReportAvailableEvaluator } from '../../application/evaluators/weekly-report-available.evaluator';
import {
  ADR_030_TICK_CRON_EXPRESSION,
  ADR_030_TICK_WINDOW_MINUTES,
  runScheduledJob,
} from '../../../../shared/scheduling/scheduled-job';

/** `HEALTHCHECKS_PING_URL_<key>` (TS §32) — one dead-man's-switch per job. */
export const DAILY_REMINDER_EVALUATION_PING_KEY = 'DAILY_REMINDER_EVALUATION';

/** `SchedulerRegistry` handle — lets a test stop the tick deterministically. */
export const DAILY_REMINDER_EVALUATION_CRON = 'daily-reminder-evaluation';

export interface DailyReminderJobOutcome {
  reminder: EvaluationOutcome;
  weeklyAvailable: EvaluationOutcome;
}

/**
 * `DailyReminderEvaluationJob` (SA §19 "Tick, filtered to local 20:00",
 * §23 Required; TS §31) — the Notifications module's student-local tick.
 *
 * It hosts the two events whose trigger is a wall-clock boundary in the
 * STUDENT's own timezone: **N-01** at local 20:00 (FR-NOTIF-02) and
 * **N-02** at the local start of the group's recitation day (SAS §22.2).
 *
 * ⚠️ SA §19's job table names no job for N-02, and TS §31's Healthchecks
 * list is closed at five jobs with one ping URL each — so a sixth job class
 * would invent both a class and a configuration key, while N-02 still has
 * to be evaluated somewhere (FR-NOTIF-01 covers all eight events). It rides
 * this tick, which is already the module's per-student local-time sweep.
 * Recorded as a doc gap rather than resolved in code (AGENTS §14).
 *
 * The tick is timezone-less and every boundary is a per-row predicate over
 * `users.timezone` (ADR-030: "filtering by each user's computed local time
 * from their persisted timezone — not one cron entry per timezone"), so a
 * DST change moves a student's reminder without any cron being touched.
 * A missed tick is simply missed: SAS §19.6 requires no compensating action
 * for the reminder, because non-delivery never excuses a missed report
 * (BR-60).
 */
@Injectable()
export class DailyReminderEvaluationJob {
  private readonly logger = new Logger(DailyReminderEvaluationJob.name);
  private readonly state = { running: false };

  constructor(
    private readonly reminderEvaluator: DailyReminderEvaluator,
    private readonly weeklyAvailableEvaluator: WeeklyReportAvailableEvaluator,
    private readonly healthchecks: HealthchecksPingService,
  ) {}

  @Cron(ADR_030_TICK_CRON_EXPRESSION, {
    name: DAILY_REMINDER_EVALUATION_CRON,
  })
  async tick(): Promise<void> {
    await this.run();
  }

  /** One run against `now` (injectable for tests). */
  run(now: Date = new Date()): Promise<DailyReminderJobOutcome | null> {
    return runScheduledJob({
      logger: this.logger,
      jobName: DailyReminderEvaluationJob.name,
      pingKey: DAILY_REMINDER_EVALUATION_PING_KEY,
      healthchecks: this.healthchecks,
      state: this.state,
      work: async () => ({
        reminder: await this.reminderEvaluator.evaluate(
          now,
          ADR_030_TICK_WINDOW_MINUTES,
        ),
        weeklyAvailable: await this.weeklyAvailableEvaluator.evaluate(
          now,
          ADR_030_TICK_WINDOW_MINUTES,
        ),
      }),
      describe: (outcome) =>
        `N-01 ${outcome.reminder.sent}/${outcome.reminder.triggered} sent, N-02 ${outcome.weeklyAvailable.sent}/${outcome.weeklyAvailable.triggered} sent, over ${outcome.reminder.candidates} live membership(s)`,
    });
  }
}
