import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import {
  MAILER,
  IMailer,
} from '../../src/modules/identity/domain/mailer.interface';
import {
  PASSWORD_HASHER,
  IPasswordHasher,
} from '../../src/modules/identity/domain/password-hasher.interface';
import { RegisterResponseDto } from '../../src/modules/identity/application/register/register-response.dto';
import { LoginResponseDto } from '../../src/modules/identity/application/login/login-response.dto';
import { MeResponseDto } from '../../src/modules/identity/application/me/me-response.dto';
import { ErrorEnvelope } from '../../src/shared/filters/http-exception.filter';
import { UserRole } from '../../src/modules/identity/domain/user-role.enum';

describe('GET & PATCH /me (API-007 & API-008 Integration)', () => {
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
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      }),
    );
    app.setGlobalPrefix('api/v1');

    await app.init();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(
        "DELETE FROM audit_entries WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@test-me.com')",
      );
      await dataSource.query(
        "DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-me.com')",
      );
      await dataSource.query(
        "DELETE FROM users WHERE email LIKE '%@test-me.com'",
      );
    }
    await app.close();
  });

  async function registerAndLogin(
    email: string,
    role: UserRole = UserRole.User,
    fullName: string | null = null,
    gender: 'Male' | 'Female' | null = null,
  ): Promise<{ accessToken: string; userId: string; userEmail: string }> {
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

        const loginBody = loginRes.body as LoginResponseDto;
        return {
          accessToken: loginBody.access_token,
          userId: adminId,
          userEmail: adminEmail,
        };
      }
    }

    // Register user
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, timezone: 'Africa/Tunis' })
      .expect(HttpStatus.CREATED);

    const regBody = regRes.body as RegisterResponseDto;
    const userId = regBody.id;

    // Update role / fields in DB if needed for role testing
    if (role !== UserRole.User || fullName !== null || gender !== null) {
      await dataSource.query(
        `UPDATE users SET role = $1, full_name = $2, gender = $3 WHERE id = $4`,
        [role, fullName, gender, userId],
      );
    }

    // Login to get fresh token with correct role payload
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(HttpStatus.OK);

    const loginBody = loginRes.body as LoginResponseDto;

    return {
      accessToken: loginBody.access_token,
      userId,
      userEmail: email,
    };
  }

  describe('GET /me (API-007)', () => {
    it('returns 200 with correct profile shape and strictly NO password_hash', async () => {
      const email = `get-me-${Date.now()}@test-me.com`;
      const { accessToken, userId } = await registerAndLogin(
        email,
        UserRole.Student,
        'طارق بن زياد',
        'Male',
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      const body = res.body as MeResponseDto;
      expect(body).toEqual({
        id: userId,
        role: UserRole.Student,
        email,
        full_name: 'طارق بن زياد',
        gender: 'Male',
        timezone: 'Africa/Tunis',
      });

      // Strict security verification: no password hash in response
      const rawBody = res.body as Record<string, unknown>;
      expect(rawBody.password_hash).toBeUndefined();
      expect(rawBody.passwordHash).toBeUndefined();
      expect(rawBody.password).toBeUndefined();
    });

    it('returns null for full_name and gender for pre-enrollment users', async () => {
      const email = `pre-enroll-${Date.now()}@test-me.com`;
      const { accessToken, userId } = await registerAndLogin(
        email,
        UserRole.User,
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      const body = res.body as MeResponseDto;
      expect(body).toEqual({
        id: userId,
        role: UserRole.User,
        email,
        full_name: null,
        gender: null,
        timezone: 'Africa/Tunis',
      });
    });

    it('returns 401 when token is missing', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/me')
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('returns 401 when token is invalid or corrupted', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', 'Bearer invalid.token.payload')
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('PATCH /me (API-008)', () => {
    it('returns 200 and updates timezone when given a valid IANA timezone string', async () => {
      const email = `patch-valid-${Date.now()}@test-me.com`;
      const { accessToken, userId } = await registerAndLogin(
        email,
        UserRole.Teacher,
        'أستاذ علي',
        'Male',
      );

      const patchRes = await request(app.getHttpServer())
        .patch('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ timezone: 'Europe/Paris' })
        .expect(HttpStatus.OK);

      const patchBody = patchRes.body as MeResponseDto;
      expect(patchBody).toEqual({
        id: userId,
        role: UserRole.Teacher,
        email,
        full_name: 'أستاذ علي',
        gender: 'Male',
        timezone: 'Europe/Paris',
      });

      // Confirm persistence via subsequent GET
      const getRes = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      const getBody = getRes.body as MeResponseDto;
      expect(getBody.timezone).toBe('Europe/Paris');
    });

    it('returns 422 INVALID_TIMEZONE when given an invalid timezone string', async () => {
      const email = `patch-invalid-tz-${Date.now()}@test-me.com`;
      const { accessToken } = await registerAndLogin(email);

      const res = await request(app.getHttpServer())
        .patch('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ timezone: 'Invalid/City_Timezone' })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);

      const errorBody = res.body as ErrorEnvelope;
      expect(errorBody.error).toBe('INVALID_TIMEZONE');
      expect(errorBody.statusCode).toBe(422);
    });

    it('mass-assignment protection: strips forbidden fields (role, full_name, gender, email)', async () => {
      const email = `patch-mass-assign-${Date.now()}@test-me.com`;
      const { accessToken, userId } = await registerAndLogin(
        email,
        UserRole.Student,
        'طالب أصلي',
        'Male',
      );

      // Attempt to modify protected fields
      const patchRes = await request(app.getHttpServer())
        .patch('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          timezone: 'Asia/Riyadh',
          role: 'Admin',
          full_name: 'مهاجم',
          gender: 'Female',
          email: 'hacked@test-me.com',
        })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);

      // ValidationPipe with forbidNonWhitelisted rejects or strips
      expect(patchRes.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);

      // Verify that database state was NOT corrupted
      const getRes = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      const getBody = getRes.body as MeResponseDto;
      expect(getBody.id).toBe(userId);
      expect(getBody.role).toBe(UserRole.Student);
      expect(getBody.full_name).toBe('طالب أصلي');
      expect(getBody.gender).toBe('Male');
      expect(getBody.email).toBe(email);
    });

    it('returns 401 when token is missing', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/me')
        .send({ timezone: 'UTC' })
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('Authorization across all 5 roles (Parameterized)', () => {
    const roles: UserRole[] = [
      UserRole.Admin,
      UserRole.Teacher,
      UserRole.Assistant,
      UserRole.Student,
      UserRole.User,
    ];

    roles.forEach((role) => {
      it(`allows role "${role}" to access GET /me and PATCH /me for their own row`, async () => {
        const email = `role-${role.toLowerCase()}-${Date.now()}@test-me.com`;
        const { accessToken, userId } = await registerAndLogin(email, role);

        // Positive test: GET /me
        const getRes = await request(app.getHttpServer())
          .get('/api/v1/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(HttpStatus.OK);

        const getBody = getRes.body as MeResponseDto;
        expect(getBody.id).toBe(userId);
        expect(getBody.role).toBe(role);

        // Positive test: PATCH /me
        const patchRes = await request(app.getHttpServer())
          .patch('/api/v1/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ timezone: 'UTC' })
          .expect(HttpStatus.OK);

        const patchBody = patchRes.body as MeResponseDto;
        expect(patchBody.id).toBe(userId);
        expect(patchBody.timezone).toBe('UTC');
      });
    });

    it('negative test: unauthenticated caller cannot access GET /me or PATCH /me', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/me')
        .expect(HttpStatus.UNAUTHORIZED);

      await request(app.getHttpServer())
        .patch('/api/v1/me')
        .send({ timezone: 'UTC' })
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });
});
