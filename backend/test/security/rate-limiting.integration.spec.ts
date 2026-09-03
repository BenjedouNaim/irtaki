/**
 * F-TEST-03 — rate limiting (APIS §9.8, TS §16/§36, NFR-22, ISS-19).
 *
 * "Integration test exceeding the `/auth/*` and `/join-requests` throttle
 * limits, asserting `429`."
 *
 * Two scopes are throttled and no others. This spec builds its app from
 * `buildThrottlerOptions()` with the SHIPPED defaults — deliberately
 * ignoring `relaxed-rate-limits.setup.ts`, which raises the limits for the
 * rest of the suite — so the numbers asserted here are exactly the ones
 * that reach production.
 *
 * Fixtures are inserted straight into the database and access tokens are
 * signed directly: registering or logging in through the API would itself
 * spend the `/auth/*` budget this spec is measuring.
 */
import { HttpStatus, INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getOptionsToken } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import { AppModule } from '../../src/app.module';
import {
  AUTH_THROTTLER,
  DEFAULT_AUTH_RATE_LIMIT,
  DEFAULT_JOIN_REQUEST_RATE_LIMIT,
  DEFAULT_RATE_LIMITS,
  JOIN_REQUEST_THROTTLER,
  RATE_LIMIT_WINDOW_SECONDS,
  buildThrottlerOptions,
} from '../../src/config/rate-limit.config';
import {
  IMailer,
  MAILER,
} from '../../src/modules/identity/domain/mailer.interface';
import {
  IPasswordHasher,
  PASSWORD_HASHER,
} from '../../src/modules/identity/domain/password-hasher.interface';
import { UserRole } from '../../src/modules/identity/domain/user-role.enum';
import { ErrorEnvelope } from '../../src/shared/filters/http-exception.filter';
import {
  purgeNotificationLog,
  stopScheduledJobs,
} from '../shared/scheduled-jobs';

const TEST_EMAIL_DOMAIN = '@test-rate-limiting.com';
const TEST_GROUP_PREFIX = 'F-TEST-03 rate limit group';
const PASSWORD = 'Password123!';

interface SeededUser {
  userId: string;
  email: string;
}

describe('Rate limiting (F-TEST-03, APIS §9.8 / NFR-22)', () => {
  jest.setTimeout(300000);

  let app: INestApplication<App>;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let groupId: string;

  /**
   * Every `/auth/*` request this spec makes, counted, so the throttle
   * assertion is exact regardless of the order Jest runs the blocks in.
   */
  let authRequestsMade = 0;

  const mockMailer: IMailer = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MAILER)
      .useValue(mockMailer)
      // The shipped defaults, not the suite-wide relaxed environment.
      .overrideProvider(getOptionsToken())
      .useValue(buildThrottlerOptions(DEFAULT_RATE_LIMITS))
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    // TS §31's five crons are live inside a real AppModule boot: their
    // evaluators would sweep this suite's fixtures on the next tick and
    // write notification_log rows against users it is about to delete.
    stopScheduledJobs(app);

    dataSource = app.get(DataSource);
    jwtService = app.get(JwtService);
    await cleanDatabase();

    const teacher = await seedUser(UserRole.Teacher);
    const assistant = await seedUser(UserRole.Assistant);
    groupId = uuidv7();
    await dataSource.query(
      `INSERT INTO groups (
         id, name, gender, recitation_day, enrollment_status, lifecycle_state,
         teacher_id, assistant_id, created_by, created_at, updated_at
       ) VALUES ($1, $2, 'Male', 4, 'Open', 'Active', $3, $4, $3, now(), now())`,
      [
        groupId,
        `${TEST_GROUP_PREFIX} ${uuidv7()}`,
        teacher.userId,
        assistant.userId,
      ],
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await cleanDatabase();
    }
    await app.close();
  });

  // ── fixtures ──────────────────────────────────────────────────────────

  async function cleanDatabase(): Promise<void> {
    const email = `%${TEST_EMAIL_DOMAIN}`;
    const group = `${TEST_GROUP_PREFIX}%`;
    await dataSource.query(
      `DELETE FROM join_request_ahzab WHERE join_request_id IN (
         SELECT id FROM join_requests
          WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)
             OR group_id IN (SELECT id FROM groups WHERE name LIKE $2))`,
      [email, group],
    );
    await dataSource.query(
      `DELETE FROM join_requests
        WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)
           OR group_id IN (SELECT id FROM groups WHERE name LIKE $2)`,
      [email, group],
    );
    await dataSource.query(
      `DELETE FROM groups
        WHERE name LIKE $2
           OR teacher_id IN (SELECT id FROM users WHERE email LIKE $1)
           OR assistant_id IN (SELECT id FROM users WHERE email LIKE $1)`,
      [email, group],
    );
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

  async function seedUser(role: UserRole): Promise<SeededUser> {
    const email = `${role.toLowerCase()}-${uuidv7()}${TEST_EMAIL_DOMAIN}`;
    const userId = uuidv7();
    const hasher = app.get<IPasswordHasher>(PASSWORD_HASHER);
    const hash = await hasher.hash(PASSWORD);
    await dataSource.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, gender, timezone, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'Male', 'Africa/Tunis', now(), now())`,
      [userId, email, hash, role, `${role} ${userId.slice(0, 8)}`],
    );
    return { userId, email };
  }

  /** Signs a real access token without spending the `/auth/*` budget. */
  async function accessTokenFor(
    user: SeededUser,
    role: string,
  ): Promise<string> {
    return jwtService.signAsync(
      { sub: user.userId, email: user.email, role },
      {
        secret:
          process.env.JWT_ACCESS_SECRET ??
          'dev-secret-key-must-be-changed-in-prod-min-32-chars',
        expiresIn: '15m',
      },
    );
  }

  /** One `/auth/*` request, counted against the tracked IP budget. */
  async function authRequest(): Promise<request.Response> {
    authRequestsMade += 1;
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: `never-registered-${uuidv7()}${TEST_EMAIL_DOMAIN}`,
        password: 'WrongPassword123!',
      });
  }

  function expectRateLimitedEnvelope(body: unknown): void {
    const envelope = body as ErrorEnvelope;
    expect(envelope.statusCode).toBe(HttpStatus.TOO_MANY_REQUESTS);
    // APIS §9.8: the 429 uses the standard envelope with error RATE_LIMITED.
    expect(envelope.error).toBe('RATE_LIMITED');
    expect(envelope.correlationId).toBeDefined();
    // API-X06: the user-facing message is always Arabic, never the
    // library's English "ThrottlerException: Too Many Requests".
    expect(envelope.message).toMatch(/[؀-ۿ]/);
    expect(envelope.message).not.toMatch(/Throttler|Too Many Requests/);
    // APIS §9.5: `details` exists on 422 only.
    expect(envelope.details).toBeUndefined();
  }

  function submissionBody(): Record<string, unknown> {
    return {
      group_id: groupId,
      full_name: 'مقدم طلب اختبار الحد',
      gender: 'Male',
      age: 24,
      phone_number: '+21698123456',
      occupation: 'مهندس',
      city: 'تونس',
      memorized_ahzab: [1, 2, 3, 4, 5],
      tajweed_level: 'Intermediate',
      studied_tajweed_theory: true,
      studied_qalun: true,
      fee_agreement: true,
      program_goal: 'Memorization',
    };
  }

  // ── the shipped configuration ─────────────────────────────────────────

  describe('configuration (APIS §9.8)', () => {
    it('throttles exactly the two named scopes and no others', () => {
      const options = buildThrottlerOptions() as {
        throttlers: Array<{ name?: string; limit: number; ttl: number }>;
      };
      expect(options.throttlers.map((t) => t.name)).toEqual([
        AUTH_THROTTLER,
        JOIN_REQUEST_THROTTLER,
      ]);
      expect(options.throttlers.map((t) => t.limit)).toEqual([
        DEFAULT_AUTH_RATE_LIMIT,
        DEFAULT_JOIN_REQUEST_RATE_LIMIT,
      ]);
      // `ttl` is milliseconds in @nestjs/throttler v6.
      expect(options.throttlers.map((t) => t.ttl)).toEqual([
        RATE_LIMIT_WINDOW_SECONDS * 1000,
        RATE_LIMIT_WINDOW_SECONDS * 1000,
      ]);
    });
  });

  // ── POST /join-requests, per user (runs first: it spends no auth budget)

  describe('POST /join-requests (queue flooding, ISS-19, tracked per user)', () => {
    let flooder: SeededUser;

    it(`answers 429 RATE_LIMITED once ${DEFAULT_JOIN_REQUEST_RATE_LIMIT} submissions in the window are exceeded`, async () => {
      flooder = await seedUser(UserRole.User);
      const token = await accessTokenFor(flooder, 'User');
      const statuses: number[] = [];

      for (
        let attempt = 0;
        attempt <= DEFAULT_JOIN_REQUEST_RATE_LIMIT;
        attempt += 1
      ) {
        const response = await request(app.getHttpServer())
          .post('/api/v1/join-requests')
          .set('Authorization', `Bearer ${token}`)
          .send(submissionBody());
        statuses.push(response.status);
        if (attempt === DEFAULT_JOIN_REQUEST_RATE_LIMIT) {
          expectRateLimitedEnvelope(response.body);
        }
      }

      // Everything inside the budget is answered on its merits (201, then
      // 409 for DB-UQ-03); only the request past the limit is throttled.
      expect(statuses.slice(0, DEFAULT_JOIN_REQUEST_RATE_LIMIT)).not.toContain(
        HttpStatus.TOO_MANY_REQUESTS,
      );
      expect(statuses[DEFAULT_JOIN_REQUEST_RATE_LIMIT]).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );

      const rows: Array<{ count: string }> = await dataSource.query(
        'SELECT count(*) FROM join_requests WHERE user_id = $1',
        [flooder.userId],
      );
      expect(Number(rows[0].count)).toBe(1);
    });

    it('is tracked per user (TS §16), so a flooder never locks another applicant out', async () => {
      const innocent = await seedUser(UserRole.User);
      const token = await accessTokenFor(innocent, 'User');

      const response = await request(app.getHttpServer())
        .post('/api/v1/join-requests')
        .set('Authorization', `Bearer ${token}`)
        .send(submissionBody());

      expect(response.status).not.toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(response.status).toBe(HttpStatus.CREATED);
    });

    it('spends no /auth/* budget — the two throttlers are independent', async () => {
      // The join-request budget above is exhausted for `flooder` and the
      // submissions came from this same IP; `/auth/*` must be untouched.
      const response = await authRequest();
      expect(response.status).not.toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });

  // ── /auth/*, per IP ───────────────────────────────────────────────────

  describe('/auth/* (credential stuffing, tracked per client IP)', () => {
    it(`answers 429 RATE_LIMITED on request ${DEFAULT_AUTH_RATE_LIMIT + 1} of the window`, async () => {
      let throttledAt: number | null = null;

      while (authRequestsMade <= DEFAULT_AUTH_RATE_LIMIT * 2) {
        const response = await authRequest();
        if (response.status === Number(HttpStatus.TOO_MANY_REQUESTS)) {
          expectRateLimitedEnvelope(response.body);
          throttledAt = authRequestsMade;
          break;
        }
        expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
      }

      expect(throttledAt).toBe(DEFAULT_AUTH_RATE_LIMIT + 1);
    });

    it('applies to the whole /auth/* surface, not just login', async () => {
      // The budget is per IP and already exhausted, so a *different*
      // `/auth/*` route is refused too — that is what "throttle /auth/*"
      // means (APIS §9.8) — and no user is created as a side effect.
      const email = `throttled-register-${uuidv7()}${TEST_EMAIL_DOMAIN}`;
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email, password: PASSWORD, timezone: 'Africa/Tunis' });

      expect(response.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expectRateLimitedEnvelope(response.body);

      const rows: Array<{ count: string }> = await dataSource.query(
        'SELECT count(*) FROM users WHERE email = $1',
        [email],
      );
      expect(Number(rows[0].count)).toBe(0);
    });

    it('leaves every other endpoint unthrottled (APIS §9.8)', async () => {
      const student = await seedUser(UserRole.Student);
      const token = await accessTokenFor(student, 'Student');

      // Well past both budgets, on a route in neither scope: never a 429.
      for (let i = 0; i < DEFAULT_AUTH_RATE_LIMIT * 3; i += 1) {
        const response = await request(app.getHttpServer())
          .get('/api/v1/me')
          .set('Authorization', `Bearer ${token}`);
        expect(response.status).not.toBe(HttpStatus.TOO_MANY_REQUESTS);
      }
    });
  });
});
