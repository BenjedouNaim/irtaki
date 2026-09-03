/* eslint-disable @typescript-eslint/no-unsafe-member-access */
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

describe('DELETE /devices/{id} (F-NOT-02 / API-049 Integration)', () => {
  jest.setTimeout(60000);

  let app: INestApplication<App>;
  let dataSource: DataSource;

  const testEmailDomain = '@test-unregister-device.com';
  const tokenPrefix = 'F-NOT-02-token-';
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

  /** Registers a device through API-048 and returns its id. */
  async function registerDevice(actor: TestActor): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/devices')
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .send({ token: `${tokenPrefix}${uuidv7()}`, platform: 'iOS' })
      .expect(HttpStatus.OK);
    return res.body.data.id as string;
  }

  function del(actor: TestActor, deviceId: string) {
    return request(app.getHttpServer())
      .delete(`/api/v1/devices/${deviceId}`)
      .set('Authorization', `Bearer ${actor.accessToken}`);
  }

  async function countById(deviceId: string): Promise<number> {
    const rows = await dataSource.query<Array<{ count: string }>>(
      'SELECT count(*)::text AS count FROM device_tokens WHERE id = $1',
      [deviceId],
    );
    return Number(rows[0].count);
  }

  it('answers 204 with no body and PHYSICALLY deletes the row (DBD §25)', async () => {
    const student = await registerAndLogin(UserRole.Student);
    const deviceId = await registerDevice(student);

    const res = await del(student, deviceId).expect(HttpStatus.NO_CONTENT);

    expect(res.body).toEqual({});
    expect(res.text).toBe('');
    expect(await countById(deviceId)).toBe(0);
  });

  it('leaves no soft-deleted remnant — the table has no deleted_at at all', async () => {
    const columns = await dataSource.query<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'device_tokens'`,
    );
    expect(columns.map((c) => c.column_name)).not.toContain('deleted_at');
  });

  it.each([
    UserRole.User,
    UserRole.Student,
    UserRole.Teacher,
    UserRole.Assistant,
    UserRole.Admin,
  ])(
    'lets a %s unregister its own device (APIS §6.1 "Any / own")',
    async (role) => {
      const actor = await registerAndLogin(role);
      const deviceId = await registerDevice(actor);

      await del(actor, deviceId).expect(HttpStatus.NO_CONTENT);

      expect(await countById(deviceId)).toBe(0);
    },
  );

  it('answers 403 SCOPE_DENIED for another user’s device and leaves it intact (NFR-20)', async () => {
    const owner = await registerAndLogin(UserRole.Student);
    const intruder = await registerAndLogin(UserRole.Teacher);
    const deviceId = await registerDevice(owner);

    const res = await del(intruder, deviceId).expect(HttpStatus.FORBIDDEN);

    expect(res.body.error).toBe('SCOPE_DENIED');
    expect(await countById(deviceId)).toBe(1);
  });

  it('answers the same 403 for an Admin acting on somebody else’s device', async () => {
    const owner = await registerAndLogin(UserRole.Student);
    const admin = await registerAndLogin(UserRole.Admin);
    const deviceId = await registerDevice(owner);

    const res = await del(admin, deviceId).expect(HttpStatus.FORBIDDEN);

    expect(res.body.error).toBe('SCOPE_DENIED');
    expect(await countById(deviceId)).toBe(1);
  });

  it('answers the same 403 for a well-formed id that does not exist', async () => {
    const student = await registerAndLogin(UserRole.Student);

    const res = await del(student, uuidv7()).expect(HttpStatus.FORBIDDEN);

    expect(res.body.error).toBe('SCOPE_DENIED');
  });

  it('answers the same 403 on a second delete of the same device', async () => {
    const student = await registerAndLogin(UserRole.Student);
    const deviceId = await registerDevice(student);

    await del(student, deviceId).expect(HttpStatus.NO_CONTENT);
    const res = await del(student, deviceId).expect(HttpStatus.FORBIDDEN);

    expect(res.body.error).toBe('SCOPE_DENIED');
  });

  it.each(['not-a-uuid', '123', '0191e6d2-2a5c-7b3e-9c1f'])(
    'answers 404 NOT_FOUND for the malformed id %p (APIS §9.6)',
    async (deviceId) => {
      const student = await registerAndLogin(UserRole.Student);

      const res = await del(student, deviceId).expect(HttpStatus.NOT_FOUND);

      expect(res.body.error).toBe('NOT_FOUND');
    },
  );

  it('rejects an unauthenticated call with 401 (AuthGuard runs first)', async () => {
    const student = await registerAndLogin(UserRole.Student);
    const deviceId = await registerDevice(student);

    await request(app.getHttpServer())
      .delete(`/api/v1/devices/${deviceId}`)
      .expect(HttpStatus.UNAUTHORIZED);

    expect(await countById(deviceId)).toBe(1);
  });

  it('deletes only the addressed row, leaving the caller’s other devices', async () => {
    const student = await registerAndLogin(UserRole.Student);
    const phone = await registerDevice(student);
    const tablet = await registerDevice(student);

    await del(student, phone).expect(HttpStatus.NO_CONTENT);

    expect(await countById(phone)).toBe(0);
    expect(await countById(tablet)).toBe(1);
  });

  it('frees the token for a fresh registration afterwards (no orphan unique row)', async () => {
    const student = await registerAndLogin(UserRole.Student);
    const token = `${tokenPrefix}${uuidv7()}`;

    const first = await request(app.getHttpServer())
      .post('/api/v1/devices')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ token, platform: 'Android' })
      .expect(HttpStatus.OK);

    await del(student, first.body.data.id as string).expect(
      HttpStatus.NO_CONTENT,
    );

    const second = await request(app.getHttpServer())
      .post('/api/v1/devices')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ token, platform: 'Android' })
      .expect(HttpStatus.OK);

    expect(second.body.data.id).not.toBe(first.body.data.id);
  });
});
