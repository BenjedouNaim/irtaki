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
  // Listeners are fire-and-forget (ADR-032): a request that has already
  // answered may still be writing its row, and a row landing between this
  // purge and the caller's own DELETE FROM users trips the foreign key.
  // Empty, settle, verify — retrying only while late writes keep arriving.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await dataSource.query('DELETE FROM notification_log');
    await new Promise((resolve) => setTimeout(resolve, 100));
    const [{ remaining }] = await dataSource.query<
      Array<{ remaining: number }>
    >('SELECT count(*)::int AS remaining FROM notification_log');
    if (remaining === 0) {
      return;
    }
  }
  await dataSource.query('DELETE FROM notification_log');
}

/**
 * Empties `audit_entries` (DBT-18).
 *
 * SAS §21 audits login, so every suite that logs anyone in appends rows
 * that no suite's own `WHERE email LIKE` cleanup can reach — the seeded
 * Admin is not one of its fixtures. They accumulate across runs until
 * API-054's "walk to the last page" test can no longer reach the end of
 * the log within its page budget, and the gate starts depending on how
 * many times the database has been used rather than on the code.
 *
 * Like `notification_log`, the table carries no seed data and no fixture
 * any other suite depends on (TDR-03 leaves it without a retention policy
 * either), so a test database empties it with the rest.
 */
export async function purgeAuditEntries(dataSource: DataSource): Promise<void> {
  await dataSource.query('DELETE FROM audit_entries');
}
