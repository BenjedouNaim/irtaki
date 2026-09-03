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
  PASSWORD_HASHER,
  IPasswordHasher,
} from '../../src/modules/identity/domain/password-hasher.interface';
import { UserRole } from '../../src/modules/identity/domain/user-role.enum';
import { SurahDto } from '../../src/modules/progress/application/list-surahs/list-surahs-response.dto';
import {
  purgeNotificationLog,
  stopScheduledJobs,
} from '../shared/scheduled-jobs';

describe('GET /quran/surahs (F-PRG-04 / API-043 Integration)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const testEmailDomain = '@test-list-surahs.com';
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
    await purgeNotificationLog(dataSource);
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

  async function registerAndLogin(
    role: UserRole,
  ): Promise<{ accessToken: string; userId: string }> {
    const email = `${role.toLowerCase()}-${uuidv7()}${testEmailDomain}`;
    const password = 'Password123!';

    // If role is Admin, respect DB-UQ-08 (single admin system-wide)
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

    return {
      accessToken: login.body.access_token as string,
      userId,
    };
  }

  it('returns full 114-row surah dataset in ascending order matching API-043 wire contract', async () => {
    const student = await registerAndLogin(UserRole.Student);

    const response = await request(app.getHttpServer())
      .get('/api/v1/quran/surahs')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(HttpStatus.OK);

    const surahs = response.body as SurahDto[];
    expect(Array.isArray(surahs)).toBe(true);
    expect(surahs).toHaveLength(114);

    // Verify first surah (Al-Fatihah)
    expect(surahs[0]).toEqual({
      number: 1,
      name_ar: 'الفَاتِحة',
      ayah_count: 7,
      ordinal_offset: 0,
    });

    // Verify last surah (An-Nas)
    expect(surahs[113]).toEqual({
      number: 114,
      name_ar: 'النَّاس',
      ayah_count: 6,
      ordinal_offset: 6208,
    });

    // Verify strictly ascending order and presence of all required fields
    for (let i = 0; i < 114; i++) {
      expect(surahs[i].number).toBe(i + 1);
      expect(typeof surahs[i].name_ar).toBe('string');
      expect(surahs[i].name_ar.length).toBeGreaterThan(0);
      expect(typeof surahs[i].ayah_count).toBe('number');
      expect(surahs[i].ayah_count).toBeGreaterThan(0);
      expect(typeof surahs[i].ordinal_offset).toBe('number');
      expect(surahs[i].ordinal_offset).toBeGreaterThanOrEqual(0);
    }
  });

  it('sets Cache-Control header to public, max-age=604800 (ADR-031)', async () => {
    const student = await registerAndLogin(UserRole.Student);

    const response = await request(app.getHttpServer())
      .get('/api/v1/quran/surahs')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(HttpStatus.OK);

    expect(response.headers['cache-control']).toBe('public, max-age=604800');
  });

  it('returns unpaginated dataset ignoring query parameters', async () => {
    const student = await registerAndLogin(UserRole.Student);

    const response = await request(app.getHttpServer())
      .get('/api/v1/quran/surahs?page=2&limit=10')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(HttpStatus.OK);

    const surahs = response.body as SurahDto[];
    expect(Array.isArray(surahs)).toBe(true);
    expect(surahs).toHaveLength(114);
  });

  it('returns 401 UNAUTHORIZED when no authorization header is provided', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/quran/surahs')
      .expect(HttpStatus.UNAUTHORIZED);

    expect(response.body.statusCode).toBe(HttpStatus.UNAUTHORIZED);
    expect(response.body.error).toBe('TOKEN_EXPIRED');
  });

  it.each([
    UserRole.User,
    UserRole.Student,
    UserRole.Assistant,
    UserRole.Teacher,
    UserRole.Admin,
  ])('permits access to %s role', async (role) => {
    const actor = await registerAndLogin(role);

    const response = await request(app.getHttpServer())
      .get('/api/v1/quran/surahs')
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .expect(HttpStatus.OK);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(114);
  });
});
