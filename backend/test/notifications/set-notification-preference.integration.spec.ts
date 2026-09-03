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
import { NotificationPreferenceDto } from '../../src/modules/notifications/application/notification-preference.dto';
import { stopScheduledJobs } from '../shared/scheduled-jobs';

interface TestActor {
  accessToken: string;
  userId: string;
}

interface PreferenceRow {
  id: string;
  user_id: string;
  category: string;
  muted: boolean;
}

/** SAS §22.2 — the three account-critical events (BR-61, `is_mutable=false`). */
const ACCOUNT_CRITICAL = ['N-03', 'N-04', 'N-08'];
/** SAS §22.2 — the five mutable events. */
const MUTABLE = ['N-01', 'N-02', 'N-05', 'N-06', 'N-07'];

describe('PATCH /me/notification-preferences (F-NOT-04 / API-051 Integration)', () => {
  jest.setTimeout(60000);

  let app: INestApplication<App>;
  let dataSource: DataSource;

  const testEmailDomain = '@test-set-notification-preference.com';
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
    await dataSource.query(
      'DELETE FROM notification_preferences WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)',
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

  function patch(actor: TestActor, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .patch('/api/v1/me/notification-preferences')
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .send(body);
  }

  async function rowsFor(userId: string): Promise<PreferenceRow[]> {
    return dataSource.query<PreferenceRow[]>(
      'SELECT * FROM notification_preferences WHERE user_id = $1 ORDER BY category',
      [userId],
    );
  }

  describe('a mutable category (valid toggle)', () => {
    it('answers 200 with the merged row and persists the mute', async () => {
      const student = await registerAndLogin(UserRole.Student);

      const res = await patch(student, {
        category: 'N-01',
        muted: true,
      }).expect(HttpStatus.OK);

      expect(res.status).not.toBe(HttpStatus.CREATED);
      const row = res.body.data as NotificationPreferenceDto;
      expect(row).toEqual({
        category: 'N-01',
        description: expect.any(String),
        is_mutable: true,
        muted: true,
      });

      const stored = await rowsFor(student.userId);
      expect(stored).toHaveLength(1);
      expect(stored[0].category).toBe('N-01');
      expect(stored[0].muted).toBe(true);
    });

    it('unmutes the same category back to false', async () => {
      const student = await registerAndLogin(UserRole.Student);

      await patch(student, { category: 'N-02', muted: true }).expect(
        HttpStatus.OK,
      );
      const res = await patch(student, {
        category: 'N-02',
        muted: false,
      }).expect(HttpStatus.OK);

      expect((res.body.data as NotificationPreferenceDto).muted).toBe(false);
      const stored = await rowsFor(student.userId);
      expect(stored).toHaveLength(1);
      expect(stored[0].muted).toBe(false);
    });

    it('keeps ONE row per (user, category) across repeated writes (DB-UQ-10)', async () => {
      const student = await registerAndLogin(UserRole.Student);

      for (const muted of [true, false, true, true]) {
        await patch(student, { category: 'N-05', muted }).expect(HttpStatus.OK);
      }

      const stored = await rowsFor(student.userId);
      expect(stored).toHaveLength(1);
      expect(stored[0].muted).toBe(true);
    });

    it.each(MUTABLE)(
      'mutes %s — every category SAS §22.2 marks mutable',
      async (category) => {
        const student = await registerAndLogin(UserRole.Student);

        const res = await patch(student, { category, muted: true }).expect(
          HttpStatus.OK,
        );

        expect((res.body.data as NotificationPreferenceDto).is_mutable).toBe(
          true,
        );
        expect((res.body.data as NotificationPreferenceDto).muted).toBe(true);
      },
    );

    it.each([
      UserRole.User,
      UserRole.Student,
      UserRole.Teacher,
      UserRole.Assistant,
      UserRole.Admin,
    ])(
      'lets a %s set its own preference (APIS §6.1 "Any / own")',
      async (role) => {
        const actor = await registerAndLogin(role);

        await patch(actor, { category: 'N-06', muted: true }).expect(
          HttpStatus.OK,
        );

        const stored = await rowsFor(actor.userId);
        expect(stored.map((row) => row.category)).toContain('N-06');
      },
    );

    it('writes against the caller from the JWT, not a user_id in the body', async () => {
      const caller = await registerAndLogin(UserRole.Student);
      const victim = await registerAndLogin(UserRole.Teacher);

      // The allow-list DTO rejects the extra property outright (AGENTS §11).
      await patch(caller, {
        category: 'N-01',
        muted: true,
        user_id: victim.userId,
      }).expect(HttpStatus.UNPROCESSABLE_ENTITY);

      expect(await rowsFor(victim.userId)).toHaveLength(0);
    });

    it('leaves the GET catalogue consistent with what was written', async () => {
      const student = await registerAndLogin(UserRole.Student);
      await patch(student, { category: 'N-07', muted: true }).expect(
        HttpStatus.OK,
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/me/notification-preferences')
        .set('Authorization', `Bearer ${student.accessToken}`)
        .expect(HttpStatus.OK);

      const rows = res.body.data as NotificationPreferenceDto[];
      expect(rows.find((row) => row.category === 'N-07')?.muted).toBe(true);
      expect(
        rows
          .filter((row) => row.category !== 'N-07')
          .every((row) => row.muted === false),
      ).toBe(true);
    });
  });

  describe('an account-critical category (VR-38 / BR-61)', () => {
    it.each(ACCOUNT_CRITICAL)(
      'answers 422 ACCOUNT_CRITICAL_CATEGORY when muting %s',
      async (category) => {
        const student = await registerAndLogin(UserRole.Student);

        const res = await patch(student, { category, muted: true }).expect(
          HttpStatus.UNPROCESSABLE_ENTITY,
        );

        expect(res.body.statusCode).toBe(422);
        expect(res.body.error).toBe('ACCOUNT_CRITICAL_CATEGORY');
        expect(res.body.message).toBe('هذه الفئة حساسة للحساب ولا يمكن كتمها');
        expect(res.body.correlationId).toEqual(expect.any(String));
        expect(await rowsFor(student.userId)).toHaveLength(0);
      },
    );

    // "enforced server-side regardless of what the client sends" (#113):
    // the answer is decided on `notification_categories.is_mutable`, so a
    // client cannot smuggle mutability in through the body either.
    it('ignores a client-supplied is_mutable and still refuses', async () => {
      const student = await registerAndLogin(UserRole.Student);

      const res = await patch(student, {
        category: 'N-03',
        muted: true,
        is_mutable: true,
      }).expect(HttpStatus.UNPROCESSABLE_ENTITY);

      expect(res.body.statusCode).toBe(422);
      expect(await rowsFor(student.userId)).toHaveLength(0);
    });

    it('refuses an unmute of the same category — it is not writable at all', async () => {
      const student = await registerAndLogin(UserRole.Student);

      const res = await patch(student, {
        category: 'N-08',
        muted: false,
      }).expect(HttpStatus.UNPROCESSABLE_ENTITY);

      expect(res.body.error).toBe('ACCOUNT_CRITICAL_CATEGORY');
      expect(await rowsFor(student.userId)).toHaveLength(0);
    });

    it('never exposes the DB-CHK-09 trigger text (APIS §9.5)', async () => {
      const student = await registerAndLogin(UserRole.Student);

      const res = await patch(student, {
        category: 'N-04',
        muted: true,
      }).expect(HttpStatus.UNPROCESSABLE_ENTITY);

      const serialised = JSON.stringify(res.body);
      expect(serialised).not.toContain('account-critical and cannot be muted');
      expect(serialised).not.toContain('notification_categories');
      expect(res.body.stack).toBeUndefined();
    });

    it.each([
      UserRole.User,
      UserRole.Student,
      UserRole.Teacher,
      UserRole.Assistant,
      UserRole.Admin,
    ])(
      'refuses a %s too — no role may mute an account-critical category',
      async (role) => {
        const actor = await registerAndLogin(role);

        await patch(actor, { category: 'N-03', muted: true }).expect(
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      },
    );
  });

  describe('validation and authentication', () => {
    it('answers 422 VALIDATION_ERROR for a category outside the catalogue', async () => {
      const student = await registerAndLogin(UserRole.Student);

      const res = await patch(student, {
        category: 'N-99',
        muted: true,
      }).expect(HttpStatus.UNPROCESSABLE_ENTITY);

      expect(res.body.error).toBe('VALIDATION_ERROR');
      expect(res.body.details).toEqual([
        {
          field: 'category',
          rule: 'DBT-15',
          message: 'فئة الإشعارات "N-99" غير معروفة',
        },
      ]);
      expect(await rowsFor(student.userId)).toHaveLength(0);
    });

    it.each([
      { category: 'N-01' },
      { muted: true },
      { category: '', muted: true },
      { category: 'N-01', muted: 'true' },
    ])('answers 422 for the malformed body %p', async (body) => {
      const student = await registerAndLogin(UserRole.Student);

      const res = await patch(student, body as Record<string, unknown>).expect(
        HttpStatus.UNPROCESSABLE_ENTITY,
      );

      expect(res.body.error).toBe('VALIDATION_ERROR');
      expect(res.body.details.length).toBeGreaterThan(0);
    });

    it('rejects an unauthenticated call with 401 (AuthGuard runs first)', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/me/notification-preferences')
        .send({ category: 'N-01', muted: true })
        .expect(HttpStatus.UNAUTHORIZED);

      expect(res.body.statusCode).toBe(401);
    });
  });
});
