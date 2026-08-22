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
import { UserRole } from '../../src/modules/identity/domain/user-role.enum';
import { UserListItemDto } from '../../src/modules/identity/application/list-users/user-list-item.dto';

describe('GET /users (API-053 Integration)', () => {
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

    await cleanDatabase();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await cleanDatabase();
    }
    await app.close();
  });

  async function cleanDatabase() {
    await dataSource.query(
      "DELETE FROM audit_entries WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@test-list-users.com')",
    );
    await dataSource.query(
      "DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-list-users.com')",
    );
    await dataSource.query(
      "DELETE FROM users WHERE email LIKE '%@test-list-users.com'",
    );
  }

  async function registerAndLogin(
    email: string,
    role: UserRole = UserRole.User,
    fullName: string | null = null,
  ): Promise<{ accessToken: string; userId: string; userEmail: string }> {
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

        const loginBody = loginRes.body as LoginResponseDto;
        return {
          accessToken: loginBody.access_token,
          userId: adminId,
          userEmail: adminEmail,
        };
      }
    }

    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, timezone: 'Africa/Tunis' })
      .expect(HttpStatus.CREATED);

    const regBody = regRes.body as RegisterResponseDto;
    const userId = regBody.id;

    if (role !== UserRole.User || fullName !== null) {
      await dataSource.query(
        `UPDATE users SET role = $1, full_name = $2 WHERE id = $3`,
        [role, fullName, userId],
      );
    }

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

  describe('Admin filtering by role', () => {
    it('returns only Teacher users when role=Teacher query param is passed', async () => {
      const admin = await registerAndLogin(
        'admin-list@test-list-users.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-filter@test-list-users.com',
        UserRole.Teacher,
        'الشيخ عبد الله',
      );
      await registerAndLogin(
        'assistant-filter@test-list-users.com',
        UserRole.Assistant,
        'الأستاذ مروان',
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/users?role=Teacher')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.OK);

      const body = res.body as { data: UserListItemDto[] };
      expect(Array.isArray(body.data)).toBe(true);

      const returnedTeacher = body.data.find((u) => u.id === teacher.userId);
      expect(returnedTeacher).toBeDefined();
      expect(returnedTeacher?.email).toBe('teacher-filter@test-list-users.com');
      expect(returnedTeacher?.full_name).toBe('الشيخ عبد الله');
      expect(returnedTeacher?.role).toBe(UserRole.Teacher);

      // Verify no non-teacher is in the filtered list
      expect(body.data.every((u) => u.role === UserRole.Teacher)).toBe(true);
    });

    it('returns only Assistant users when role=Assistant query param is passed', async () => {
      const admin = await registerAndLogin(
        'admin-list@test-list-users.com',
        UserRole.Admin,
      );
      const assistant = await registerAndLogin(
        'assistant-filter-2@test-list-users.com',
        UserRole.Assistant,
        'الأستاذ حسام',
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/users?role=Assistant')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.OK);

      const body = res.body as { data: UserListItemDto[] };
      expect(Array.isArray(body.data)).toBe(true);

      const returnedAssistant = body.data.find(
        (u) => u.id === assistant.userId,
      );
      expect(returnedAssistant).toBeDefined();
      expect(returnedAssistant?.email).toBe(
        'assistant-filter-2@test-list-users.com',
      );
      expect(returnedAssistant?.full_name).toBe('الأستاذ حسام');
      expect(returnedAssistant?.role).toBe(UserRole.Assistant);

      expect(body.data.every((u) => u.role === UserRole.Assistant)).toBe(true);
    });

    it('returns all users when role query param is omitted', async () => {
      const admin = await registerAndLogin(
        'admin-list@test-list-users.com',
        UserRole.Admin,
      );
      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.OK);

      const body = res.body as { data: UserListItemDto[] };
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
    });

    it('returns 422 Unprocessable Entity when role query param is invalid', async () => {
      const admin = await registerAndLogin(
        'admin-list@test-list-users.com',
        UserRole.Admin,
      );

      await request(app.getHttpServer())
        .get('/api/v1/users?role=SuperAdmin')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    });
  });

  describe('Authorization', () => {
    it('returns 401 Unauthorized when unauthenticated', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users')
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('returns 403 Forbidden for Teacher role', async () => {
      const teacher = await registerAndLogin(
        'teacher-auth@test-list-users.com',
        UserRole.Teacher,
      );

      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('returns 403 Forbidden for Assistant role', async () => {
      const assistant = await registerAndLogin(
        'assistant-auth@test-list-users.com',
        UserRole.Assistant,
      );

      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${assistant.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('returns 403 Forbidden for Student role', async () => {
      const student = await registerAndLogin(
        'student-auth@test-list-users.com',
        UserRole.Student,
      );

      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${student.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('returns 403 Forbidden for User role', async () => {
      const user = await registerAndLogin(
        'user-auth@test-list-users.com',
        UserRole.User,
      );

      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });
  });
});
