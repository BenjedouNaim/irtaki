/**
 * F-TEST-03 — error-envelope leakage (APIS §9.5, SA §24, TS §36).
 *
 * "A shared test helper asserting no response body, at any status code, on
 * any endpoint, ever contains a Postgres error message, stack trace,
 * constraint name, or file path — run this helper against every existing
 * error-path test across the whole suite, not just new ones."
 *
 * The helper lives in `test/shared/no-internal-leakage.ts` and is wired
 * into supertest itself by `test/shared/no-internal-leakage.setup.ts`,
 * registered as `setupFilesAfterEnv` in `test/jest-e2e.json`. Every
 * response every integration spec asserts on therefore passes through it,
 * with no per-spec opt-in — that global wiring is the point of this item.
 *
 * This spec adds the three things the global hook cannot prove about
 * itself:
 *   1. the detector really catches each class of leak (not vacuously green);
 *   2. the hook is actually armed, demonstrated on a deliberately leaky
 *      endpoint that must fail a supertest request;
 *   3. a genuine `QueryFailedError` — Postgres text, SQLSTATE, constraint
 *      name, `nbtinsert.c` path and all — is sanitized by the global
 *      exception filter into a clean `500` envelope.
 */
import {
  Controller,
  Get,
  HttpStatus,
  INestApplication,
  Module,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, QueryFailedError } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import { AppModule } from '../../src/app.module';
import {
  IMailer,
  MAILER,
} from '../../src/modules/identity/domain/mailer.interface';
import {
  IPasswordHasher,
  PASSWORD_HASHER,
} from '../../src/modules/identity/domain/password-hasher.interface';
import { UserRole } from '../../src/modules/identity/domain/user-role.enum';
import { HttpExceptionFilter } from '../../src/shared/filters/http-exception.filter';
import { CorrelationIdMiddleware } from '../../src/shared/middleware/correlation-id.middleware';
import {
  InternalLeak,
  expectNoInternalLeakage,
  findInternalLeak,
} from '../shared/no-internal-leakage';
import {
  purgeNotificationLog,
  stopScheduledJobs,
} from '../shared/scheduled-jobs';

const TEST_EMAIL_DOMAIN = '@test-error-leakage.com';
const PASSWORD = 'Password123!';

/** The fields `pg` attaches to a driver error, as TypeORM re-exposes them. */
interface PgDriverError extends Error {
  severity: string;
  code: string;
  detail: string;
  schema: string;
  table: string;
  constraint: string;
  file: string;
  line: string;
  routine: string;
}

/**
 * A realistic `QueryFailedError`, shaped exactly as `pg` hands one back for
 * a `DB-UQ-04` collision — the single richest source of internal detail the
 * application can produce.
 */
function realisticDriverError(): PgDriverError {
  return Object.assign(
    new Error('duplicate key value violates unique constraint "DB-UQ-04"'),
    {
      severity: 'ERROR',
      code: '23505',
      detail:
        'Key (membership_id, report_date)=(0191f0c9-1d1a-7000-8000-000000000001, 2026-09-03) already exists.',
      schema: 'public',
      table: 'daily_reports',
      constraint: 'DB-UQ-04',
      file: '/build/postgresql-16/src/backend/access/nbtree/nbtinsert.c',
      line: '673',
      routine: '_bt_check_unique',
    },
  );
}

function realisticQueryFailedError(): QueryFailedError {
  return new QueryFailedError(
    'INSERT INTO daily_reports (id, membership_id, report_date) VALUES ($1, $2, $3)',
    [uuidv7(), uuidv7(), '2026-09-03'],
    realisticDriverError(),
  );
}

describe('Error-envelope leakage (F-TEST-03, APIS §9.5 / SA §24 / TS §36)', () => {
  jest.setTimeout(300000);

  let app: INestApplication<App>;
  let dataSource: DataSource;

  const mockMailer: IMailer = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MAILER)
      .useValue(mockMailer)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    // TS §31's five crons are live inside a real AppModule boot: their
    // evaluators would sweep this suite's fixtures on the next tick and
    // write notification_log rows against users it is about to delete.
    stopScheduledJobs(app);
    dataSource = app.get(DataSource);
    await cleanDatabase();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await cleanDatabase();
    }
    await app.close();
  });

  async function cleanDatabase(): Promise<void> {
    const email = `%${TEST_EMAIL_DOMAIN}`;
    await dataSource.query(
      'DELETE FROM audit_entries WHERE actor_id IN (SELECT id FROM users WHERE email LIKE $1)',
      [email],
    );
    await dataSource.query(
      'DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)',
      [email],
    );
    // DBT-17 holds ON DELETE RESTRICT references to these users.
    await purgeNotificationLog(dataSource);
    await dataSource.query('DELETE FROM users WHERE email LIKE $1', [email]);
  }

  async function actor(
    role: UserRole,
  ): Promise<{ userId: string; accessToken: string }> {
    const email = `${role.toLowerCase()}-${uuidv7()}${TEST_EMAIL_DOMAIN}`;
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD, timezone: 'Africa/Tunis' })
      .expect(HttpStatus.CREATED);
    const userId = (registration.body as { id: string }).id;
    if (role !== UserRole.User) {
      await dataSource.query(
        'UPDATE users SET role = $1, full_name = $2, gender = $3 WHERE id = $4',
        [role, 'مستخدم اختبار', 'Male', userId],
      );
    }
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(HttpStatus.OK);
    return {
      userId,
      accessToken: (login.body as { access_token: string }).access_token,
    };
  }

  // ── 1. the detector itself ────────────────────────────────────────────

  describe('the shared detector recognises every class APIS §9.5 forbids', () => {
    const LEAKY_BODIES: Array<[string, InternalLeak['kind'], unknown]> = [
      [
        'raw Postgres unique-violation text',
        'postgres-error',
        {
          statusCode: 409,
          message:
            'duplicate key value violates unique constraint "daily_reports_pkey"',
        },
      ],
      [
        'Postgres foreign-key text',
        'postgres-error',
        {
          message: 'insert or update on table violates foreign key constraint',
        },
      ],
      [
        'Postgres invalid-input text',
        'postgres-error',
        { message: 'invalid input syntax for type uuid: "not-a-uuid"' },
      ],
      [
        'TypeORM driver error object',
        'postgres-error',
        { driverError: { code: '23505' } },
      ],
      [
        'echoed SQL statement',
        'postgres-error',
        { query: 'SELECT id FROM memberships WHERE user_id = $1' },
      ],
      [
        'pg error object fields',
        'postgres-error',
        { severity: 'ERROR', routine: '_bt_check_unique' },
      ],
      [
        'DBD constraint id',
        'constraint-name',
        { message: 'DB-UQ-04 violated' },
      ],
      [
        'fk_ constraint name',
        'constraint-name',
        { message: 'fk_daily_reports_membership' },
      ],
      [
        'TypeORM generated constraint name',
        'constraint-name',
        { message: 'PK_8c82d7f526340ab734260ea46be' },
      ],
      [
        'V8 stack trace',
        'stack-trace',
        {
          message: 'Boom',
          stack: 'Error: Boom\n    at SubmitDailyReportUseCase.execute (x)',
        },
      ],
      [
        'source location',
        'stack-trace',
        { message: 'failed at daily-report.repository.ts:270:14' },
      ],
      [
        'absolute POSIX path',
        'filesystem-path',
        { message: 'ENOENT: /var/lib/postgresql/data/base/16384' },
      ],
      [
        'project-internal path',
        'filesystem-path',
        { message: 'thrown from src/modules/reports/infrastructure' },
      ],
      [
        'node_modules path',
        'filesystem-path',
        { message: 'node_modules/typeorm/driver/postgres' },
      ],
    ];

    it.each(LEAKY_BODIES)('flags %s', (_label, kind, body) => {
      const leak = findInternalLeak(body);
      expect(leak).not.toBeNull();
      expect(leak?.kind).toBe(kind);
    });

    it('does not flag a well-formed Arabic error envelope', () => {
      expect(
        findInternalLeak({
          statusCode: 422,
          error: 'VALIDATION_ERROR',
          message: 'فشل التحقق من صحة البيانات المدخلة',
          details: [
            { field: 'absence_reason', rule: 'VR-19', message: 'مطلوب' },
          ],
          correlationId: uuidv7(),
        }),
      ).toBeNull();
    });

    it('does not flag ordinary success payloads', () => {
      expect(
        findInternalLeak({
          data: [
            {
              id: uuidv7(),
              report_date: '2026-09-03',
              created_at: '2026-09-03T08:12:44.512Z',
              week_start: '2026-08-31',
              next_cursor: 'eyJpZCI6IjAxOTFmMGM5Iiwic29ydF9rZXkiOiIyMDI2In0=',
            },
          ],
          pagination: { next_cursor: null, has_more: false },
        }),
      ).toBeNull();
    });
  });

  // ── 2. the global supertest hook is armed ─────────────────────────────

  describe('the helper is wired into every supertest response in the suite', () => {
    @Controller('leaky')
    class LeakyController {
      @Get('postgres')
      leakPostgres(): Record<string, unknown> {
        const driverError = realisticDriverError();
        const error = realisticQueryFailedError();
        return {
          statusCode: 500,
          message: error.message,
          detail: driverError.detail,
          constraint: driverError.constraint,
          file: driverError.file,
          stack: error.stack,
        };
      }

      @Get('clean')
      clean(): Record<string, unknown> {
        return { data: { message: 'كل شيء على ما يرام' } };
      }
    }

    @Module({ controllers: [LeakyController] })
    class LeakyModule {}

    let leakyApp: INestApplication<App>;

    beforeAll(async () => {
      const moduleFixture = await Test.createTestingModule({
        imports: [LeakyModule],
      }).compile();
      leakyApp = moduleFixture.createNestApplication();
      await leakyApp.init();
    });

    afterAll(async () => {
      await leakyApp.close();
    });

    it('fails a supertest request whose body leaks internals, without any per-spec opt-in', async () => {
      // Note the absence of any assertion helper in this call: the failure
      // comes from the global hook alone. If the hook were not installed,
      // this request would resolve happily and the expectation below fail.
      await expect(
        request(leakyApp.getHttpServer()).get('/leaky/postgres'),
      ).rejects.toThrow(/Response body leaks an internal detail/);
    });

    it('lets a clean response through untouched', async () => {
      const response = await request(leakyApp.getHttpServer())
        .get('/leaky/clean')
        .expect(HttpStatus.OK);
      expect(response.body).toEqual({
        data: { message: 'كل شيء على ما يرام' },
      });
    });
  });

  // ── 3. a real QueryFailedError is sanitized, not surfaced ─────────────

  describe('a genuine QueryFailedError never reaches the client', () => {
    @Controller('exploding')
    class ExplodingController {
      @Get()
      explode(): never {
        throw realisticQueryFailedError();
      }
    }

    @Module({
      controllers: [ExplodingController],
      providers: [CorrelationIdMiddleware],
    })
    class ExplodingModule {}

    let explodingApp: INestApplication<App>;

    beforeAll(async () => {
      const moduleFixture = await Test.createTestingModule({
        imports: [ExplodingModule],
      }).compile();
      explodingApp = moduleFixture.createNestApplication();
      explodingApp.useGlobalFilters(new HttpExceptionFilter());
      await explodingApp.init();
    });

    afterAll(async () => {
      await explodingApp.close();
    });

    it('answers 500 with the standard envelope and nothing else', async () => {
      const response = await request(explodingApp.getHttpServer())
        .get('/exploding')
        .expect(HttpStatus.INTERNAL_SERVER_ERROR);

      expect(Object.keys(response.body as object).sort()).toEqual([
        'correlationId',
        'error',
        'message',
        'statusCode',
      ]);
      expect((response.body as { error: string }).error).toBe('INTERNAL_ERROR');
      // Belt and braces: the global hook already checked this body, but
      // spell the property out where a reader will look for it.
      expectNoInternalLeakage(response);
      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain('DB-UQ-04');
      expect(serialized).not.toContain('nbtinsert.c');
      expect(serialized).not.toContain('daily_reports');
      expect(serialized).not.toContain('23505');
    });
  });

  // ── 4. real error paths across the live API surface ───────────────────

  describe('live error paths across the API surface', () => {
    it('401 — missing token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/me')
        .expect(HttpStatus.UNAUTHORIZED);
      expectNoInternalLeakage(response);
    });

    it('401 — malformed token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', 'Bearer not.a.jwt')
        .expect(HttpStatus.UNAUTHORIZED);
      expectNoInternalLeakage(response);
    });

    it('403 — role denied (RolesGuard)', async () => {
      const caller = await actor(UserRole.User);
      const response = await request(app.getHttpServer())
        .get('/api/v1/audit')
        .set('Authorization', `Bearer ${caller.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);
      expectNoInternalLeakage(response);
    });

    it('403/404 — scope denied on a foreign resource id', async () => {
      const caller = await actor(UserRole.Teacher);
      const response = await request(app.getHttpServer())
        .get(`/api/v1/memberships/${uuidv7()}/progress`)
        .set('Authorization', `Bearer ${caller.accessToken}`);
      expect([HttpStatus.FORBIDDEN, HttpStatus.NOT_FOUND]).toContain(
        response.status,
      );
      expectNoInternalLeakage(response);
    });

    it('404 — malformed uuid in a path segment (APIS §9.6)', async () => {
      const caller = await actor(UserRole.Teacher);
      const response = await request(app.getHttpServer())
        .get('/api/v1/memberships/not-a-uuid/progress')
        .set('Authorization', `Bearer ${caller.accessToken}`);
      expect([HttpStatus.FORBIDDEN, HttpStatus.NOT_FOUND]).toContain(
        response.status,
      );
      // The `invalid input syntax for type uuid` a naive implementation
      // would surface here is exactly what the detector looks for.
      expectNoInternalLeakage(response);
    });

    it('404 — resource genuinely absent', async () => {
      const caller = await actor(UserRole.User);
      const response = await request(app.getHttpServer())
        .get('/api/v1/join-requests/mine')
        .set('Authorization', `Bearer ${caller.accessToken}`)
        .expect(HttpStatus.NOT_FOUND);
      expectNoInternalLeakage(response);
    });

    it('409 — duplicate registration (DB-UQ-01)', async () => {
      const email = `duplicate-${uuidv7()}${TEST_EMAIL_DOMAIN}`;
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email, password: PASSWORD, timezone: 'Africa/Tunis' })
        .expect(HttpStatus.CREATED);
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email, password: PASSWORD, timezone: 'Africa/Tunis' })
        .expect(HttpStatus.CONFLICT);
      expectNoInternalLeakage(response);
    });

    it('422 — field validation', async () => {
      const caller = await actor(UserRole.Student);
      const response = await request(app.getHttpServer())
        .post('/api/v1/daily-reports')
        .set('Authorization', `Bearer ${caller.accessToken}`)
        .send({ type: 'NotAType' })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
      expectNoInternalLeakage(response);
    });

    it('400 — unparseable JSON body', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"email": "broken"');
      expect(response.status).toBeGreaterThanOrEqual(400);
      // Express' body-parser error carries a stack and an entity dump; it
      // must not reach the client.
      expectNoInternalLeakage(response);
    });

    it('404 — unrouted path', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/definitely-not-a-route')
        .expect(HttpStatus.NOT_FOUND);
      expectNoInternalLeakage(response);
    });

    it('200 — success bodies are checked too, at every status code', async () => {
      const caller = await actor(UserRole.Student);
      const response = await request(app.getHttpServer())
        .get('/api/v1/quran/surahs')
        .set('Authorization', `Bearer ${caller.accessToken}`)
        .expect(HttpStatus.OK);
      expectNoInternalLeakage(response);
    });
  });

  // ── 5. the hasher never round-trips a hash to the client ──────────────

  it('never serializes a password hash on any auth response', async () => {
    const hasher = app.get<IPasswordHasher>(PASSWORD_HASHER);
    const email = `hash-check-${uuidv7()}${TEST_EMAIL_DOMAIN}`;
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD, timezone: 'Africa/Tunis' })
      .expect(HttpStatus.CREATED);
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(HttpStatus.OK);

    // TS §16 "Sensitive data exposure": the hash is structurally absent
    // from every response DTO, not redacted at runtime.
    const hash = await hasher.hash(PASSWORD);
    const prefix = hash.slice(0, hash.indexOf('$', 8));
    for (const body of [registration.body, login.body]) {
      expect(JSON.stringify(body)).not.toContain(prefix);
      expect(JSON.stringify(body)).not.toContain('password_hash');
    }
  });
});
