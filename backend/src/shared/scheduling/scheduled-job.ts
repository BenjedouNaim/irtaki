import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { correlationStorage } from '../middleware/correlation-id.middleware';
import type { HealthchecksPingService } from '../observability/healthchecks-ping.service';

/**
 * ADR-030's single tick: every 15 minutes, on the quarter hour (six-field
 * cron with seconds, as `@nestjs/schedule` parses it), on the server clock —
 * the same expression `WeeklyReportFinalizationJob` has ridden since
 * F-WR-02. The tick itself is timezone-less; each per-student boundary is a
 * per-row predicate over `users.timezone` (T-01).
 */
export const ADR_030_TICK_CRON_EXPRESSION = '0 */15 * * * *';

/** Width of one tick, in minutes — the local-boundary bucket's size. */
export const ADR_030_TICK_WINDOW_MINUTES = 15;

/**
 * SA §19's "Tick, daily" and "Nightly, global": once per day on the server
 * clock, which runs UTC (T-04). No hour is invented — the day boundary is
 * the only one the documents name.
 */
export const DAILY_JOB_CRON_EXPRESSION = '0 0 0 * * *';

/**
 * The shape every scheduled job in this codebase shares, extracted from
 * `WeeklyReportFinalizationJob` (F-WR-02) so the five jobs TS §31 enumerates
 * run on ONE mechanism rather than five look-alikes. It lives in `shared/`
 * beside the Healthchecks.io adapter it calls, because a job in Reports and
 * a job in Notifications must both reach it and SA §11 draws no edge
 * between those two modules:
 *
 * - a fresh `correlationId` per run, opened in `correlationStorage` so the
 *   Pino bridge stamps it on the job's lines and on everything beneath them
 *   (TS §30, SA §26) — a tick has no HTTP request to inherit one from;
 * - overlapping runs skipped with a WARN rather than queued (TS §30
 *   "scheduler catching up after a missed tick");
 * - the run outcome at INFO and a failure at ERROR with the cause, which is
 *   TS §31's scheduled-job-run-outcome counter;
 * - a Healthchecks.io ping on success and only on success — the
 *   dead-man's-switch of TS §31/§32 and SA §32, closing SAS ISS-01;
 * - and never throwing: an exception here would only reach the scheduler's
 *   own handler, so it is caught, logged and swallowed.
 */
export async function runScheduledJob<T>(params: {
  logger: Logger;
  jobName: string;
  /** `HEALTHCHECKS_PING_URL_<pingKey>` (TS §32). */
  pingKey: string;
  healthchecks: HealthchecksPingService;
  /** Guard object owning the "already running" flag across ticks. */
  state: { running: boolean };
  work: () => Promise<T>;
  /** The INFO line's body — the run's own outcome, in its own words. */
  describe: (outcome: T) => string;
}): Promise<T | null> {
  const store = new Map<string, string>([['correlationId', randomUUID()]]);
  return correlationStorage.run(store, async () => {
    if (params.state.running) {
      params.logger.warn(
        `${params.jobName} tick skipped: the previous run is still in progress`,
      );
      return null;
    }

    params.state.running = true;
    const startedAt = Date.now();
    try {
      const outcome = await params.work();
      params.logger.log(
        `${params.jobName} succeeded: ${params.describe(outcome)} in ${
          Date.now() - startedAt
        }ms`,
      );
      await params.healthchecks.pingSuccess(params.pingKey);
      return outcome;
    } catch (err: unknown) {
      params.logger.error(
        `${params.jobName} failed after ${Date.now() - startedAt}ms: ${
          err instanceof Error ? err.message : String(err)
        }`,
        err instanceof Error ? err.stack : undefined,
      );
      return null;
    } finally {
      params.state.running = false;
    }
  });
}
