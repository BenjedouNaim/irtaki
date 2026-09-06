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
 * The database name `backend/docker-compose.yml` (POSTGRES_DB),
 * `backend/.env.example` and the README all use for local development. It is
 * the one name the purge helpers below must refuse.
 */
const DEVELOPMENT_DATABASE = 'irtaki';

/**
 * Refuses to let a purge run against anything but a database the suite owns.
 *
 * The two helpers below empty whole tables — correct against a dedicated test
 * database, catastrophic anywhere else. ISS #145 is the worked example:
 * `DB_NAME` used to default to `irtaki`, `ConfigModule.forRoot()` passes no
 * `envFilePath`, and a run whose `.env` was not picked up therefore connected
 * to the developer's working database and emptied its `notification_log` and
 * truncated its `audit_entries` — silently, with no warning and no failure.
 * ISS #141 asks for exactly this guard if the wholesale purge is kept.
 *
 * The load-bearing predicate is `SELECT current_database()` on the LIVE
 * connection, not `process.env.DB_NAME`. The environment says what a run was
 * *asked* to connect to; #145 is precisely the case where the two disagree,
 * because the name TypeORM resolved came from somewhere the reader of
 * `process.env` never saw. Only the connection knows which database the
 * `DELETE` is about to hit.
 *
 * `NODE_ENV` is a cheap second condition and deliberately not the primary one:
 * jest sets `NODE_ENV='test'` by itself, so a check on it alone would have
 * waved through the exact run #145 reports — a test environment pointed at the
 * development database.
 */
async function assertTestDatabase(
  dataSource: DataSource,
  table: string,
): Promise<void> {
  const [{ database }] = await dataSource.query<Array<{ database: string }>>(
    'SELECT current_database() AS database',
  );
  const nodeEnv = process.env.NODE_ENV ?? '(unset)';

  if (database === DEVELOPMENT_DATABASE || nodeEnv !== 'test') {
    throw new Error(
      `Refusing to empty "${table}": this connection reports ` +
        `current_database() = "${database}" (NODE_ENV="${nodeEnv}"). ` +
        `"${DEVELOPMENT_DATABASE}" is the development database name used by ` +
        'docker-compose.yml, .env.example and the README, and the integration ' +
        "suite's teardown helpers delete whole tables. Point DB_NAME at a " +
        'dedicated test database (e.g. irtaki_test) — create it, run the ' +
        'migrations and the seed against it, then re-run the suite.',
    );
  }
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
  await assertTestDatabase(dataSource, 'notification_log');

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
  await assertTestDatabase(dataSource, 'audit_entries');

  await dataSource.query('DELETE FROM audit_entries');
}
