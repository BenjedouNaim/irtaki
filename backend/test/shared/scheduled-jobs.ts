import type { INestApplication } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import type { DataSource } from 'typeorm';

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

/**
 * Empties `notification_log` (DBT-17).
 *
 * Since F-NOT-05 the four event-driven notifications fire from real
 * requests — accepting, rejecting or submitting a join request, and
 * terminating a membership — so a suite exercising any of those endpoints
 * now leaves a write-once log row behind, keyed on the recipient with an
 * `ON DELETE RESTRICT` foreign key. Its own `DELETE FROM users` would then
 * fail. The table is diagnostic-only and never seeded (ISS-08 leaves it
 * without a retention policy at all), so a test database simply empties it
 * alongside the fixtures it owns.
 */
export async function purgeNotificationLog(
  dataSource: DataSource,
): Promise<void> {
  await dataSource.query('DELETE FROM notification_log');
}
