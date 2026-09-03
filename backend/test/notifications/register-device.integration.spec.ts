/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { HttpStatus, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
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
import { stopScheduledJobs } from '../shared/scheduled-jobs';

interface TestActor {
  accessToken: string;
  userId: string;
}

interface DeviceRow {
  id: string;
  user_id: string;
  token: string;
  platform: string;
  registered_at: string;
  last_seen_at: string;
  invalidated_at: string | null;
}

describe('POST /devices (F-NOT-01 / API-048 Integration)', () => {
  jest.setTimeout(60000);

  let app: INestApplication<App>;
  let dataSource: DataSource;

  const testEmailDomain = '@test-register-device.com';
  const tokenPrefix = 'F-NOT-01-token-';
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

    // ADR-024's crons are live inside a booted AppModule; every suite
    // drives the jobs it cares about with its own clock instead.
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
    await dataSource.query('DELETE FROM device_tokens WHERE token LIKE $1', [
      `${tokenPrefix}%`,
    ]);
    await dataSource.query(
      'DELETE FROM device_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)',
      [`%${testEmailDomain}`],
    );
    await dataSource.query(
      'DELETE FROM audit_entries WHERE actor_id IN (SELECT id FROM users WHERE email LIKE $1)',
      [`%${testEmailDomain}`],
    );
    await dataSource.query(
      'DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)',
      [`%${testEmailDomain}`],
    );
    await dataSource.query('DELETE FROM users WHERE email LIKE $1', [
      `%${testEmailDomain}`,
    ]);
  }

  async function registerAndLogin(role: UserRole): Promise<TestActor> {
    const password = 'Password123!';

    // Reuse the single Admin row via the password-reset trick (house pattern,
    // DB-UQ-08: exactly one Admin system-wide).
    if (role === UserRole.Admin) {
      const existingAdmins: Array<{ id: string; email: string }> =
        await dataSource.query(
          "SELECT id, email FROM users WHERE role = 'Admin' LIMIT 1",
        );

      if (existingAdmins.length > 0) {
        const adminId = existingAdmins[0].id;
        const adminEmail = existingAdmins[0].email;
        const passwordHasher = app.get<IPasswordHasher>(PASSWORD_HASHER);
        const hash = await passwordHasher.hash(password);
        await dataSource.query(
          'UPDATE users SET password_hash = $1 WHERE id = $2',
          [hash, adminId],
        );

        const loginRes = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: adminEmail, password })
          .expect(HttpStatus.OK);

        return {
          accessToken: loginRes.body.access_token as string,
          userId: adminId,
        };
      }
    }

    const email = `${role.toLowerCase()}-${uuidv7()}${testEmailDomain}`;
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, timezone: 'Africa/Tunis' })
      .expect(HttpStatus.CREATED);

    const userId = registration.body.id as string;
    await dataSource.query(
      'UPDATE users SET role = $1, full_name = $2, gender = $3 WHERE id = $4',
      [role, `${role} test user`, 'Male', userId],
    );

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(HttpStatus.OK);

    return { accessToken: login.body.access_token as string, userId };
  }

  async function rowsFor(token: string): Promise<DeviceRow[]> {
    return dataSource.query<DeviceRow[]>(
      'SELECT * FROM device_tokens WHERE token = $1',
      [token],
    );
  }

  function post(actor: TestActor, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/api/v1/devices')
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .send(body);
  }

  describe('fresh registration', () => {
    it('answers 200 — NOT 201 — and persists the row (VR-29, APIS §9.7)', async () => {
      const student = await registerAndLogin(UserRole.Student);
      const token = `${tokenPrefix}${uuidv7()}`;

      const res = await post(student, { token, platform: 'iOS' }).expect(
        HttpStatus.OK,
      );

      expect(res.status).not.toBe(HttpStatus.CREATED);
      expect(res.body).toEqual({
        data: {
          id: expect.any(String),
          token,
          platform: 'iOS',
          registered_at: expect.any(String),
          last_seen_at: expect.any(String),
          invalidated_at: null,
        },
      });

      const rows = await rowsFor(token);
      expect(rows).toHaveLength(1);
      expect(rows[0].user_id).toBe(student.userId);
      expect(rows[0].platform).toBe('iOS');
      expect(rows[0].invalidated_at).toBeNull();
      expect(rows[0].id).toBe(res.body.data.id);
    });

    it.each([
      UserRole.User,
      UserRole.Student,
      UserRole.Teacher,
      UserRole.Assistant,
      UserRole.Admin,
    ])(
      'lets a %s register its own device (APIS §6.1 "Any / own")',
      async (role) => {
        const actor = await registerAndLogin(role);
        const token = `${tokenPrefix}${uuidv7()}`;

        await post(actor, { token, platform: 'Android' }).expect(HttpStatus.OK);

        const rows = await rowsFor(token);
        expect(rows).toHaveLength(1);
        expect(rows[0].user_id).toBe(actor.userId);
      },
    );
  });

  describe('re-registration idempotency (VR-29)', () => {
    it('refreshes last_seen_at on the same row instead of duplicating it', async () => {
      const student = await registerAndLogin(UserRole.Student);
      const token = `${tokenPrefix}${uuidv7()}`;

      const first = await post(student, { token, platform: 'iOS' }).expect(
        HttpStatus.OK,
      );
      const firstRow = (await rowsFor(token))[0];

      // Move last_seen_at back so the refresh is unambiguous.
      await dataSource.query(
        "UPDATE device_tokens SET last_seen_at = last_seen_at - interval '1 day' WHERE token = $1",
        [token],
      );
      const staleRow = (await rowsFor(token))[0];

      const second = await post(student, { token, platform: 'iOS' }).expect(
        HttpStatus.OK,
      );

      const rows = await rowsFor(token);
      expect(rows).toHaveLength(1);
      expect(second.body.data.id).toBe(first.body.data.id);
      expect(new Date(rows[0].last_seen_at).getTime()).toBeGreaterThan(
        new Date(staleRow.last_seen_at).getTime(),
      );
      // VR-29 refreshes last_seen_at only — the first registration stands.
      expect(new Date(rows[0].registered_at).getTime()).toBe(
        new Date(firstRow.registered_at).getTime(),
      );
    });

    it('stays a single row across many retries of the same token', async () => {
      const student = await registerAndLogin(UserRole.Student);
      const token = `${tokenPrefix}${uuidv7()}`;

      for (let i = 0; i < 4; i += 1) {
        await post(student, { token, platform: 'Android' }).expect(
          HttpStatus.OK,
        );
      }

      expect(await rowsFor(token)).toHaveLength(1);
    });

    it('re-registers a logically invalidated token as live again', async () => {
      const student = await registerAndLogin(UserRole.Student);
      const token = `${tokenPrefix}${uuidv7()}`;

      await post(student, { token, platform: 'iOS' }).expect(HttpStatus.OK);
      await dataSource.query(
        'UPDATE device_tokens SET invalidated_at = now() WHERE token = $1',
        [token],
      );

      const res = await post(student, { token, platform: 'iOS' }).expect(
        HttpStatus.OK,
      );

      expect(res.body.data.invalidated_at).toBeNull();
      expect((await rowsFor(token))[0].invalidated_at).toBeNull();
    });

    it('moves a handset that changed owner onto the new caller (token is globally unique)', async () => {
      const first = await registerAndLogin(UserRole.Student);
      const second = await registerAndLogin(UserRole.Teacher);
      const token = `${tokenPrefix}${uuidv7()}`;

      await post(first, { token, platform: 'iOS' }).expect(HttpStatus.OK);
      await post(second, { token, platform: 'iOS' }).expect(HttpStatus.OK);

      const rows = await rowsFor(token);
      expect(rows).toHaveLength(1);
      expect(rows[0].user_id).toBe(second.userId);
    });

    it('keeps one row per distinct token for the same user', async () => {
      const student = await registerAndLogin(UserRole.Student);
      const phone = `${tokenPrefix}${uuidv7()}`;
      const tablet = `${tokenPrefix}${uuidv7()}`;

      await post(student, { token: phone, platform: 'iOS' }).expect(
        HttpStatus.OK,
      );
      await post(student, { token: tablet, platform: 'Android' }).expect(
        HttpStatus.OK,
      );

      const rows = await dataSource.query<DeviceRow[]>(
        'SELECT * FROM device_tokens WHERE user_id = $1 ORDER BY token',
        [student.userId],
      );
      expect(rows).toHaveLength(2);
    });
  });

  describe('validation and authentication', () => {
    it('rejects an unauthenticated call with 401 (AuthGuard runs first)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/devices')
        .send({ token: `${tokenPrefix}${uuidv7()}`, platform: 'iOS' })
        .expect(HttpStatus.UNAUTHORIZED);

      expect(res.body.statusCode).toBe(401);
    });

    it.each(['Web', 'ios', '', 42])(
      'rejects the platform %p with 422 VALIDATION_ERROR',
      async (platform) => {
        const student = await registerAndLogin(UserRole.Student);
        const res = await post(student, {
          token: `${tokenPrefix}${uuidv7()}`,
          platform,
        }).expect(HttpStatus.UNPROCESSABLE_ENTITY);

        expect(res.body.error).toBe('VALIDATION_ERROR');
        expect(res.body.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'platform' }),
          ]),
        );
      },
    );

    it('rejects a missing token with 422 and writes nothing', async () => {
      const student = await registerAndLogin(UserRole.Student);

      const res = await post(student, { platform: 'iOS' }).expect(
        HttpStatus.UNPROCESSABLE_ENTITY,
      );

      expect(res.body.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'token' })]),
      );
      const rows = await dataSource.query<DeviceRow[]>(
        'SELECT * FROM device_tokens WHERE user_id = $1',
        [student.userId],
      );
      expect(rows).toHaveLength(0);
    });

    it('strips a mass-assigned user_id (allow-list DTO)', async () => {
      const student = await registerAndLogin(UserRole.Student);
      const victim = await registerAndLogin(UserRole.Teacher);

      await post(student, {
        token: `${tokenPrefix}${uuidv7()}`,
        platform: 'iOS',
        user_id: victim.userId,
      }).expect(HttpStatus.UNPROCESSABLE_ENTITY);

      const rows = await dataSource.query<DeviceRow[]>(
        'SELECT * FROM device_tokens WHERE user_id = $1',
        [victim.userId],
      );
      expect(rows).toHaveLength(0);
    });

    it('never leaks Postgres text on the error envelope (SA §24)', async () => {
      const student = await registerAndLogin(UserRole.Student);

      const res = await post(student, {
        token: `${tokenPrefix}${uuidv7()}`,
        platform: 'Web',
      }).expect(HttpStatus.UNPROCESSABLE_ENTITY);

      expect(res.body.correlationId).toEqual(expect.any(String));
      expect(JSON.stringify(res.body)).not.toMatch(/device_tokens|constraint/i);
    });
  });
});
