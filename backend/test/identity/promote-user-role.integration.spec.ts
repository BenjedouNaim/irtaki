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
import { PromoteRoleResponseDto } from '../../src/modules/identity/application/promote-role/promote-role-response.dto';
import {
  purgeNotificationLog,
  stopScheduledJobs,
} from '../shared/scheduled-jobs';

const EMAIL_SUFFIX = '@test-promote-role.com';

interface ErrorEnvelope {
  statusCode: number;
  error: string;
  message: string;
  correlationId: string;
}

describe('PATCH /users/{id}/role (API-052 Integration)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let sequence = 0;

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

  async function cleanDatabase() {
    await purgeNotificationLog(dataSource);
    // TS §36 — parameterised, never a SQL string built by interpolation.
    const pattern = `%${EMAIL_SUFFIX}`;
    await dataSource.query(
      'DELETE FROM audit_entries WHERE actor_id IN (SELECT id FROM users WHERE email LIKE $1)',
      [pattern],
    );
    await dataSource.query(
      'DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)',
      [pattern],
    );
    await dataSource.query('DELETE FROM users WHERE email LIKE $1', [pattern]);
  }

  async function registerAndLogin(
    prefix: string,
    role: UserRole = UserRole.User,
    fullName: string | null = null,
  ): Promise<{ accessToken: string; userId: string; email: string }> {
    const password = 'Password123!';
    const email = `${prefix}-${++sequence}${EMAIL_SUFFIX}`;

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
          email: adminEmail,
        };
      }
    }

    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, timezone: 'Africa/Tunis' })
      .expect(HttpStatus.CREATED);

    const userId = (regRes.body as RegisterResponseDto).id;

    if (role !== UserRole.User || fullName !== null) {
      await dataSource.query(
        'UPDATE users SET role = $1, full_name = $2 WHERE id = $3',
        [role, fullName, userId],
      );
    }

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(HttpStatus.OK);

    return {
      accessToken: (loginRes.body as LoginResponseDto).access_token,
      userId,
      email,
    };
  }

  async function roleOf(userId: string): Promise<string> {
    const rows: Array<{ role: string }> = await dataSource.query(
      'SELECT role FROM users WHERE id = $1',
      [userId],
    );
    return rows[0].role;
  }

  describe('Valid promotion (BR-R03, FR-ADMIN-03)', () => {
    it.each([UserRole.Teacher, UserRole.Assistant])(
      'promotes a User to %s and persists the new role',
      async (target) => {
        const admin = await registerAndLogin('admin', UserRole.Admin);
        const user = await registerAndLogin(
          'promotable',
          UserRole.User,
          'محمد الطرابلسي',
        );

        const res = await request(app.getHttpServer())
          .patch(`/api/v1/users/${user.userId}/role`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send({ role: target })
          .expect(HttpStatus.OK);

        const body = res.body as PromoteRoleResponseDto;
        expect(body.data).toEqual({
          id: user.userId,
          email: user.email,
          full_name: 'محمد الطرابلسي',
          role: target,
        });
        expect(await roleOf(user.userId)).toBe(target);
      },
    );

    it('returns full_name null for a user who never completed a profile', async () => {
      const admin = await registerAndLogin('admin', UserRole.Admin);
      const user = await registerAndLogin('nameless');

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${user.userId}/role`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ role: UserRole.Teacher })
        .expect(HttpStatus.OK);

      expect((res.body as PromoteRoleResponseDto).data.full_name).toBeNull();
    });
  });

  describe('Wrong source role → 422 SOURCE_ROLE_NOT_USER (BR-R03, ISS-03)', () => {
    it.each([UserRole.Teacher, UserRole.Assistant, UserRole.Student])(
      'refuses to change the role of an existing %s',
      async (source) => {
        const admin = await registerAndLogin('admin', UserRole.Admin);
        const target = await registerAndLogin('source', source);

        const res = await request(app.getHttpServer())
          .patch(`/api/v1/users/${target.userId}/role`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send({ role: UserRole.Assistant })
          .expect(HttpStatus.UNPROCESSABLE_ENTITY);

        const body = res.body as ErrorEnvelope;
        expect(body.error).toBe('SOURCE_ROLE_NOT_USER');
        expect(body.correlationId).toBeDefined();
        expect(await roleOf(target.userId)).toBe(source);
      },
    );
  });

  describe('Self-promotion → 403 CANNOT_PROMOTE_SELF (FR-ADMIN-02)', () => {
    it('refuses the Admin promoting their own account and leaves the role intact', async () => {
      const admin = await registerAndLogin('admin', UserRole.Admin);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${admin.userId}/role`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ role: UserRole.Teacher })
        .expect(HttpStatus.FORBIDDEN);

      expect((res.body as ErrorEnvelope).error).toBe('CANNOT_PROMOTE_SELF');
      expect(await roleOf(admin.userId)).toBe(UserRole.Admin);
    });

    it('refuses the same self-promotion when the id is written in upper-case hex', async () => {
      const admin = await registerAndLogin('admin', UserRole.Admin);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${admin.userId.toUpperCase()}/role`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ role: UserRole.Assistant })
        .expect(HttpStatus.FORBIDDEN);

      expect((res.body as ErrorEnvelope).error).toBe('CANNOT_PROMOTE_SELF');
      expect(await roleOf(admin.userId)).toBe(UserRole.Admin);
    });
  });

  describe('Request validation', () => {
    it.each([UserRole.Admin, UserRole.Student, UserRole.User])(
      'rejects %s as a target role with 422',
      async (target) => {
        const admin = await registerAndLogin('admin', UserRole.Admin);
        const user = await registerAndLogin('target-role');

        await request(app.getHttpServer())
          .patch(`/api/v1/users/${user.userId}/role`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send({ role: target })
          .expect(HttpStatus.UNPROCESSABLE_ENTITY);

        expect(await roleOf(user.userId)).toBe(UserRole.User);
      },
    );

    it('rejects a missing role field with 422', async () => {
      const admin = await registerAndLogin('admin', UserRole.Admin);
      const user = await registerAndLogin('no-role');

      await request(app.getHttpServer())
        .patch(`/api/v1/users/${user.userId}/role`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({})
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('strips unknown body fields (mass assignment, SA §25)', async () => {
      const admin = await registerAndLogin('admin', UserRole.Admin);
      const user = await registerAndLogin('mass-assign');

      await request(app.getHttpServer())
        .patch(`/api/v1/users/${user.userId}/role`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ role: UserRole.Teacher, email: `hacked${EMAIL_SUFFIX}` })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);

      expect(await roleOf(user.userId)).toBe(UserRole.User);
    });

    it('returns 404 for a non-existent but well-formed user id', async () => {
      const admin = await registerAndLogin('admin', UserRole.Admin);

      await request(app.getHttpServer())
        .patch('/api/v1/users/018f3a2b-0000-7000-8000-0000000000ff/role')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ role: UserRole.Teacher })
        .expect(HttpStatus.NOT_FOUND);
    });

    it('returns 404 for a malformed uuid path segment (APIS §9.6)', async () => {
      const admin = await registerAndLogin('admin', UserRole.Admin);

      await request(app.getHttpServer())
        .patch('/api/v1/users/not-a-uuid/role')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ role: UserRole.Teacher })
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('Authorization', () => {
    it('returns 401 when unauthenticated', async () => {
      const user = await registerAndLogin('unauth-target');

      await request(app.getHttpServer())
        .patch(`/api/v1/users/${user.userId}/role`)
        .send({ role: UserRole.Teacher })
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it.each([
      UserRole.Teacher,
      UserRole.Assistant,
      UserRole.Student,
      UserRole.User,
    ])('returns 403 for %s callers', async (callerRole) => {
      const caller = await registerAndLogin('caller', callerRole);
      const target = await registerAndLogin('forbidden-target');

      await request(app.getHttpServer())
        .patch(`/api/v1/users/${target.userId}/role`)
        .set('Authorization', `Bearer ${caller.accessToken}`)
        .send({ role: UserRole.Teacher })
        .expect(HttpStatus.FORBIDDEN);

      expect(await roleOf(target.userId)).toBe(UserRole.User);
    });
  });
});
