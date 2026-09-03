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
import { NotificationPreferenceDto } from '../../src/modules/notifications/application/notification-preference.dto';

interface TestActor {
  accessToken: string;
  userId: string;
}

/**
 * The DEC-D03 catalogue (SAS §22.2), as `seed/run-seed.ts` deployment-loads
 * it into `notification_categories` (DBD §18: the one enumeration promoted
 * to a lookup table). Asserted rather than inserted — this suite reads the
 * deployed reference data the same way `list-surahs` reads the 114 surahs,
 * and never writes to it.
 */
const CATALOGUE = [
  { code: 'N-01', is_mutable: true },
  { code: 'N-02', is_mutable: true },
  { code: 'N-03', is_mutable: false },
  { code: 'N-04', is_mutable: false },
  { code: 'N-05', is_mutable: true },
  { code: 'N-06', is_mutable: true },
  { code: 'N-07', is_mutable: true },
  { code: 'N-08', is_mutable: false },
];

const ACCOUNT_CRITICAL = ['N-03', 'N-04', 'N-08'];

describe('GET /me/notification-preferences (F-NOT-03 / API-050 Integration)', () => {
  jest.setTimeout(60000);

  let app: INestApplication<App>;
  let dataSource: DataSource;

  const testEmailDomain = '@test-get-notification-preferences.com';
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

  async function storePreference(
    userId: string,
    category: string,
    muted: boolean,
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO notification_preferences (id, user_id, category, muted)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, category) DO UPDATE SET muted = EXCLUDED.muted`,
      [uuidv7(), userId, category, muted],
    );
  }

  function get(actor: TestActor) {
    return request(app.getHttpServer())
      .get('/api/v1/me/notification-preferences')
      .set('Authorization', `Bearer ${actor.accessToken}`);
  }

  describe('the deployment-loaded catalogue', () => {
    it('holds the eight DEC-D03 categories with the documented mutability', async () => {
      const rows: Array<{ code: string; is_mutable: boolean }> =
        await dataSource.query(
          'SELECT code, is_mutable FROM notification_categories ORDER BY code',
        );

      expect(rows).toEqual(CATALOGUE);
    });
  });

  describe('full catalogue', () => {
    it('returns every category in the APIS §9.1 collection envelope', async () => {
      const student = await registerAndLogin(UserRole.Student);

      const res = await get(student).expect(HttpStatus.OK);

      expect(Object.keys(res.body as Record<string, unknown>)).toEqual([
        'data',
      ]);
      // Bounded collection: no `pagination`, no totals (APIS §9.1/§9.2).
      expect(res.body.pagination).toBeUndefined();

      const rows = res.body.data as NotificationPreferenceDto[];
      expect(rows).toHaveLength(CATALOGUE.length);
      expect(rows.map((row) => row.category)).toEqual(
        CATALOGUE.map((c) => c.code),
      );
      for (const row of rows) {
        expect(Object.keys(row).sort()).toEqual([
          'category',
          'description',
          'is_mutable',
          'muted',
        ]);
        expect(typeof row.description).toBe('string');
        expect(row.description.length).toBeGreaterThan(0);
      }
    });

    it('marks exactly N-03, N-04 and N-08 as account-critical (BR-61)', async () => {
      const student = await registerAndLogin(UserRole.Student);

      const res = await get(student).expect(HttpStatus.OK);
      const rows = res.body.data as NotificationPreferenceDto[];

      expect(
        rows.filter((row) => !row.is_mutable).map((row) => row.category),
      ).toEqual(ACCOUNT_CRITICAL);
    });

    it('never leaks another user_id into the row (Own resource)', async () => {
      const student = await registerAndLogin(UserRole.Student);

      const res = await get(student).expect(HttpStatus.OK);

      expect(JSON.stringify(res.body)).not.toContain(student.userId);
    });

    it.each([
      UserRole.User,
      UserRole.Student,
      UserRole.Teacher,
      UserRole.Assistant,
      UserRole.Admin,
    ])(
      'lets a %s read its own catalogue (APIS §6.1 "Any / own")',
      async (role) => {
        const actor = await registerAndLogin(role);

        const res = await get(actor).expect(HttpStatus.OK);

        expect(res.body.data).toHaveLength(CATALOGUE.length);
      },
    );
  });

  describe('default-unmuted case (R-15 "absent = unmuted")', () => {
    it('answers muted=false for every category when no row exists', async () => {
      const student = await registerAndLogin(UserRole.Student);

      const stored: Array<{ count: string }> = await dataSource.query(
        'SELECT COUNT(*) AS count FROM notification_preferences WHERE user_id = $1',
        [student.userId],
      );
      expect(Number(stored[0].count)).toBe(0);

      const res = await get(student).expect(HttpStatus.OK);
      const rows = res.body.data as NotificationPreferenceDto[];

      expect(rows.every((row) => row.muted === false)).toBe(true);
    });

    it('does not create preference rows as a side effect of reading', async () => {
      const student = await registerAndLogin(UserRole.Student);

      await get(student).expect(HttpStatus.OK);

      const stored: Array<{ count: string }> = await dataSource.query(
        'SELECT COUNT(*) AS count FROM notification_preferences WHERE user_id = $1',
        [student.userId],
      );
      expect(Number(stored[0].count)).toBe(0);
    });
  });

  describe('merge with stored rows (APIQ-10)', () => {
    it('reflects a stored mute and leaves untouched categories unmuted', async () => {
      const student = await registerAndLogin(UserRole.Student);
      await storePreference(student.userId, 'N-01', true);

      const res = await get(student).expect(HttpStatus.OK);
      const rows = res.body.data as NotificationPreferenceDto[];

      expect(rows.find((row) => row.category === 'N-01')?.muted).toBe(true);
      expect(
        rows
          .filter((row) => row.category !== 'N-01')
          .every((row) => row.muted === false),
      ).toBe(true);
      // Still the FULL catalogue, not just the stored row.
      expect(rows).toHaveLength(CATALOGUE.length);
    });

    it('reflects a stored unmute exactly like an absent row', async () => {
      const student = await registerAndLogin(UserRole.Student);
      await storePreference(student.userId, 'N-02', false);

      const res = await get(student).expect(HttpStatus.OK);
      const rows = res.body.data as NotificationPreferenceDto[];

      expect(rows.find((row) => row.category === 'N-02')?.muted).toBe(false);
    });

    it("never shows another user's mute state", async () => {
      const owner = await registerAndLogin(UserRole.Student);
      const other = await registerAndLogin(UserRole.Teacher);
      await storePreference(owner.userId, 'N-01', true);

      const res = await get(other).expect(HttpStatus.OK);
      const rows = res.body.data as NotificationPreferenceDto[];

      expect(rows.every((row) => row.muted === false)).toBe(true);
    });
  });

  describe('authentication', () => {
    it('rejects an unauthenticated call with 401 (AuthGuard runs first)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/me/notification-preferences')
        .expect(HttpStatus.UNAUTHORIZED);

      expect(res.body.statusCode).toBe(401);
    });

    it('rejects a garbage bearer token with 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/me/notification-preferences')
        .set('Authorization', 'Bearer not-a-jwt')
        .expect(HttpStatus.UNAUTHORIZED);

      expect(res.body.statusCode).toBe(401);
    });
  });
});
