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
import { HizbBoundaryDto } from '../../src/modules/progress/application/list-hizb-boundaries/list-hizb-boundaries-response.dto';
import { stopScheduledJobs } from '../shared/scheduled-jobs';

describe('GET /quran/hizb-boundaries (F-PRG-05 / API-044 Integration)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const testEmailDomain = '@test-list-hizb-boundaries.com';
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

  it('returns full 60-row hizb boundaries dataset in ascending order matching API-044 wire contract', async () => {
    const student = await registerAndLogin(UserRole.Student);

    const response = await request(app.getHttpServer())
      .get('/api/v1/quran/hizb-boundaries')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(HttpStatus.OK);

    const boundaries = response.body as HizbBoundaryDto[];
    expect(Array.isArray(boundaries)).toBe(true);
    expect(boundaries).toHaveLength(60);

    // Verify spot-checked values against backend/seed/quran/VERIFICATION.md §3
    // Hizb 1
    expect(boundaries[0]).toEqual({
      hizb_number: 1,
      start: { surah: 1, ayah: 1 },
      end: { surah: 2, ayah: 74 },
    });

    // Hizb 2
    expect(boundaries[1]).toEqual({
      hizb_number: 2,
      start: { surah: 2, ayah: 75 },
      end: { surah: 2, ayah: 140 },
    });

    // Hizb 15
    expect(boundaries[14]).toEqual({
      hizb_number: 15,
      start: { surah: 6, ayah: 112 },
      end: { surah: 6, ayah: 167 },
    });

    // Hizb 30
    expect(boundaries[29]).toEqual({
      hizb_number: 30,
      start: { surah: 17, ayah: 99 },
      end: { surah: 18, ayah: 73 },
    });

    // Hizb 45
    expect(boundaries[44]).toEqual({
      hizb_number: 45,
      start: { surah: 36, ayah: 27 },
      end: { surah: 37, ayah: 144 },
    });

    // Hizb 60
    expect(boundaries[59]).toEqual({
      hizb_number: 60,
      start: { surah: 87, ayah: 1 },
      end: { surah: 114, ayah: 6 },
    });

    // Verify strictly ascending order and field types for all 60 rows
    for (let i = 0; i < 60; i++) {
      expect(boundaries[i].hizb_number).toBe(i + 1);
      expect(typeof boundaries[i].start.surah).toBe('number');
      expect(boundaries[i].start.surah).toBeGreaterThanOrEqual(1);
      expect(boundaries[i].start.surah).toBeLessThanOrEqual(114);
      expect(typeof boundaries[i].start.ayah).toBe('number');
      expect(boundaries[i].start.ayah).toBeGreaterThanOrEqual(1);

      expect(typeof boundaries[i].end.surah).toBe('number');
      expect(boundaries[i].end.surah).toBeGreaterThanOrEqual(1);
      expect(boundaries[i].end.surah).toBeLessThanOrEqual(114);
      expect(typeof boundaries[i].end.ayah).toBe('number');
      expect(boundaries[i].end.ayah).toBeGreaterThanOrEqual(1);
    }
  });

  it('sets Cache-Control header to public, max-age=604800 (ADR-031)', async () => {
    const student = await registerAndLogin(UserRole.Student);

    const response = await request(app.getHttpServer())
      .get('/api/v1/quran/hizb-boundaries')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(HttpStatus.OK);

    expect(response.headers['cache-control']).toBe('public, max-age=604800');
  });

  it('returns unpaginated dataset ignoring query parameters', async () => {
    const student = await registerAndLogin(UserRole.Student);

    const response = await request(app.getHttpServer())
      .get('/api/v1/quran/hizb-boundaries?page=2&limit=10')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(HttpStatus.OK);

    const boundaries = response.body as HizbBoundaryDto[];
    expect(Array.isArray(boundaries)).toBe(true);
    expect(boundaries).toHaveLength(60);
  });

  it('returns 401 UNAUTHORIZED when no authorization header is provided', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/quran/hizb-boundaries')
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
      .get('/api/v1/quran/hizb-boundaries')
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .expect(HttpStatus.OK);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(60);
  });
});
