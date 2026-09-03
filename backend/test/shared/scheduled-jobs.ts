import type { INestApplication } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';

/**
 * Stops every ADR-024 cron the application registered.
 *
 * Integration suites boot the real `AppModule`, so the five scheduled jobs
 * TS §31 enumerates are live inside them — and the notification evaluators
 * would sweep the suite's own fixtures on the next quarter hour, writing
 * `notification_log` rows against users the suite is about to delete. Every
 * suite therefore stops the ticks and drives the jobs it cares about
 * through their `run(now)` entry point with a controlled clock, which is
 * the pattern `weekly-report-finalization.integration.spec.ts` established
 * in F-WR-02.
 *
 * Returns the registry so a caller can restart or inspect a specific job.
 */
export function stopScheduledJobs(app: INestApplication): SchedulerRegistry {
  const registry = app.get(SchedulerRegistry);
  for (const [, job] of registry.getCronJobs()) {
    void job.stop();
  }
  return registry;
}
