import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import { AppModule } from '../../src/app.module';
import {
  purgeAuditEntries,
  purgeNotificationLog,
  stopScheduledJobs,
} from './scheduled-jobs';

/**
 * ISS #141 / ISS #145 — the two teardown helpers in `scheduled-jobs.ts` empty
 * `notification_log` and `audit_entries` wholesale. That is correct against a
 * database the suite owns and destructive against any other, and #145 records
 * the accident actually happening on a developer machine: `DB_NAME` carried a
 * default, jest did not pick up `.env`, and the run emptied a working
 * database's tables without a warning. Both helpers now refuse unless the LIVE
 * connection says it is on a database other than the development one.
 *
 * This spec is the regression gate for that refusal.
 */

/**
 * The name the guard refuses — docker-compose.yml's `POSTGRES_DB`,
 * `.env.example` and the README all use it for local development.
 */
const DEVELOPMENT_DATABASE = 'irtaki';

const testEmailDomain = '@test-purge-guard.com';

/**
 * A view of the live connection that answers `current_database()` with `name`,
 * passing every other statement through untouched.
 *
 * Deliberately NOT "open a second DataSource against the `irtaki` database":
 * a regressed guard would then delete the developer's own audit history —
 * precisely the accident #145 reports and this guard exists to prevent, so a
 * test must not be the thing that reproduces it. Rewriting the function call
 * inside the SQL text leaves the guard reading whatever answer the connection
 * hands back, which is the property under test, while any `DELETE` that slips
 * past still lands in this suite's throwaway database — where the
 * surviving-row assertions below catch it instead of a human noticing later.
 */
function reportingDatabaseAs(dataSource: DataSource, name: string): DataSource {
  return new Proxy(dataSource, {
    get(target, property, receiver): unknown {
      if (property !== 'query') {
        return Reflect.get(target, property, receiver) as unknown;
      }
      return (sql: string, parameters?: unknown[]): Promise<unknown> =>
        target.query(
          sql.replace('current_database()', `'${name}'::text`),
          parameters,
        );
    },
  });
}

describe('Purge helpers refuse a non-test database (ISS #141, ISS #145)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let actorId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // ADR-024's crons are live inside a booted AppModule; nothing here drives
    // a job, so they are simply stopped before they can write a log row.
    stopScheduledJobs(app);
    dataSource = app.get(DataSource);

    // The suite asserts that a purge PROCEEDS here, so it must not itself be
    // pointed at the database the guard refuses — that would read as the guard
    // failing rather than as the run being misconfigured.
    const [{ database }] = await dataSource.query<Array<{ database: string }>>(
      'SELECT current_database() AS database',
    );
    if (database === DEVELOPMENT_DATABASE) {
      throw new Error(
        `This spec deletes from notification_log and audit_entries and is ` +
          `connected to "${database}". Point DB_NAME at a dedicated test ` +
          'database before running it.',
      );
    }

    // One fixture actor, owning both rows: `notification_log.user_id` and
    // `audit_entries.actor_id` are ON DELETE RESTRICT, so the rows have to
    // reference a real user rather than an invented uuid.
    actorId = uuidv7();
    await dataSource.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, timezone)
       VALUES ($1, $2, 'not-a-real-hash', 'User', 'Purge guard fixture', 'Africa/Tunis')`,
      [actorId, `fixture-${actorId}${testEmailDomain}`],
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(
        'DELETE FROM notification_log WHERE user_id = $1',
        [actorId],
      );
      await dataSource.query('DELETE FROM audit_entries WHERE actor_id = $1', [
        actorId,
      ]);
      await dataSource.query('DELETE FROM users WHERE email LIKE $1', [
        `%${testEmailDomain}`,
      ]);
    }
    await app.close();
  });

  beforeEach(async () => {
    // Re-seed one row per table before every case: the passing cases empty
    // both tables, so the counts below are only meaningful if each case starts
    // from the same known state.
    await dataSource.query('DELETE FROM notification_log WHERE user_id = $1', [
      actorId,
    ]);
    await dataSource.query('DELETE FROM audit_entries WHERE actor_id = $1', [
      actorId,
    ]);
    // 'N-01' is seeded by the seed script (DBT-15); the category is an
    // ON DELETE RESTRICT foreign key, so an arbitrary code will not do.
    await dataSource.query(
      `INSERT INTO notification_log (id, user_id, category, outcome)
       VALUES ($1, $2, 'N-01', 'Sent')`,
      [uuidv7(), actorId],
    );
    await dataSource.query(
      `INSERT INTO audit_entries (id, actor_id, action) VALUES ($1, $2, 'LOGIN')`,
      [uuidv7(), actorId],
    );
  });

  async function countAll(table: string): Promise<number> {
    const [{ total }] = await dataSource.query<Array<{ total: number }>>(
      `SELECT count(*)::int AS total FROM ${table}`,
    );
    return total;
  }

  async function countOwn(table: string, column: string): Promise<number> {
    const [{ total }] = await dataSource.query<Array<{ total: number }>>(
      `SELECT count(*)::int AS total FROM ${table} WHERE ${column} = $1`,
      [actorId],
    );
    return total;
  }

  describe('when the connection reports the development database', () => {
    it('purgeNotificationLog throws before deleting anything', async () => {
      const asDevelopment = reportingDatabaseAs(
        dataSource,
        DEVELOPMENT_DATABASE,
      );

      const thrown: unknown = await purgeNotificationLog(asDevelopment).then(
        () => null,
        (error: unknown) => error,
      );

      expect(thrown).toBeInstanceOf(Error);
      const message = (thrown as Error).message;
      expect(message).toContain('notification_log');
      expect(message).toContain(
        `current_database() = "${DEVELOPMENT_DATABASE}"`,
      );
      expect(message).toContain('DB_NAME');
      // The point of the guard: the row is still there.
      expect(await countOwn('notification_log', 'user_id')).toBe(1);
    });

    it('purgeAuditEntries throws before deleting anything', async () => {
      const asDevelopment = reportingDatabaseAs(
        dataSource,
        DEVELOPMENT_DATABASE,
      );

      const thrown: unknown = await purgeAuditEntries(asDevelopment).then(
        () => null,
        (error: unknown) => error,
      );

      expect(thrown).toBeInstanceOf(Error);
      const message = (thrown as Error).message;
      expect(message).toContain('audit_entries');
      expect(message).toContain(
        `current_database() = "${DEVELOPMENT_DATABASE}"`,
      );
      expect(message).toContain('DB_NAME');
      expect(await countOwn('audit_entries', 'actor_id')).toBe(1);
    });
  });

  describe('when the connection reports a dedicated test database', () => {
    it('purgeNotificationLog empties the table', async () => {
      expect(await countOwn('notification_log', 'user_id')).toBe(1);

      await purgeNotificationLog(dataSource);

      expect(await countAll('notification_log')).toBe(0);
    });

    it('purgeAuditEntries empties the table', async () => {
      expect(await countOwn('audit_entries', 'actor_id')).toBe(1);

      await purgeAuditEntries(dataSource);

      expect(await countAll('audit_entries')).toBe(0);
    });
  });
});
