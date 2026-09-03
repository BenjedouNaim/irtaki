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
import {
  ListUsersResponseDto,
  UserListItemDto,
} from '../../src/modules/identity/application/list-users/user-list-item.dto';
import { stopScheduledJobs } from '../shared/scheduled-jobs';

type ListUsersBody = ListUsersResponseDto;

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

      const body = res.body as ListUsersBody;
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

      const body = res.body as ListUsersBody;
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

      const body = res.body as ListUsersBody;
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

  /**
   * F-ADM-02 — `/users` is one of SA §15's unbounded collections (API-X04),
   * so every call is a cursor page in the fixed `created_at DESC` order
   * APIS §9.4 gives this endpoint. The seeded rows carry far-future
   * `created_at` values so they are deterministically the newest rows in
   * the table, whatever else the suite left behind.
   */
  describe('Cursor pagination (APIS §9.2)', () => {
    interface SeededUser {
      id: string;
      email: string;
      role: UserRole;
    }

    const SEEDED: Array<{ email: string; role: UserRole; createdAt: string }> =
      [
        {
          email: 'page-1@test-list-users.com',
          role: UserRole.User,
          createdAt: '2099-01-01T10:00:00.000000Z',
        },
        {
          email: 'page-2@test-list-users.com',
          role: UserRole.Student,
          createdAt: '2099-01-02T10:00:00.000000Z',
        },
        {
          email: 'page-3@test-list-users.com',
          role: UserRole.Teacher,
          createdAt: '2099-01-03T10:00:00.000000Z',
        },
        {
          email: 'page-4@test-list-users.com',
          role: UserRole.Assistant,
          createdAt: '2099-01-04T10:00:00.000000Z',
        },
        {
          email: 'page-5@test-list-users.com',
          role: UserRole.User,
          createdAt: '2099-01-05T10:00:00.000000Z',
        },
      ];

    let adminToken: string;
    /** Newest first — the exact order `GET /users` must return them in. */
    let expectedOrder: SeededUser[];

    async function fetchPage(query: string): Promise<ListUsersBody> {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/users${query}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(HttpStatus.OK);
      return res.body as ListUsersBody;
    }

    beforeAll(async () => {
      const admin = await registerAndLogin(
        'admin-list@test-list-users.com',
        UserRole.Admin,
      );
      adminToken = admin.accessToken;

      const seeded: SeededUser[] = [];
      for (const spec of SEEDED) {
        const user = await registerAndLogin(spec.email, spec.role, 'مستخدم');
        await dataSource.query(
          'UPDATE users SET created_at = $1 WHERE id = $2',
          [spec.createdAt, user.userId],
        );
        seeded.push({ id: user.userId, email: spec.email, role: spec.role });
      }
      expectedOrder = [...seeded].reverse();
    });

    it('walks the unfiltered directory in created_at DESC order, page by page, with every role represented', async () => {
      const first = await fetchPage('?limit=2');
      expect(first.data.map((u) => u.id)).toEqual([
        expectedOrder[0].id,
        expectedOrder[1].id,
      ]);
      expect(first.pagination.has_more).toBe(true);
      expect(typeof first.pagination.next_cursor).toBe('string');

      const second = await fetchPage(
        `?limit=2&cursor=${encodeURIComponent(first.pagination.next_cursor!)}`,
      );
      expect(second.data.map((u) => u.id)).toEqual([
        expectedOrder[2].id,
        expectedOrder[3].id,
      ]);

      const third = await fetchPage(
        `?limit=2&cursor=${encodeURIComponent(second.pagination.next_cursor!)}`,
      );
      expect(third.data[0].id).toBe(expectedOrder[4].id);

      const walked = [...first.data, ...second.data, ...third.data];
      expect(new Set(walked.map((u) => u.id)).size).toBe(walked.length);
      const rolesSeen = new Set(
        walked
          .filter((u) => u.email.endsWith('@test-list-users.com'))
          .map((u) => u.role),
      );
      expect(rolesSeen).toEqual(
        new Set([
          UserRole.User,
          UserRole.Student,
          UserRole.Teacher,
          UserRole.Assistant,
        ]),
      );
    });

    it('reaches a last page whose next_cursor is null, with no row repeated or skipped', async () => {
      const seen: UserListItemDto[] = [];
      let cursor: string | null = null;
      let pages = 0;

      do {
        const page: ListUsersBody = await fetchPage(
          cursor ? `?limit=3&cursor=${encodeURIComponent(cursor)}` : '?limit=3',
        );
        seen.push(...page.data);
        cursor = page.pagination.next_cursor;
        expect(page.pagination.has_more).toBe(cursor !== null);
        pages += 1;
      } while (cursor && pages < 50);

      expect(cursor).toBeNull();
      expect(new Set(seen.map((u) => u.id)).size).toBe(seen.length);
      for (const expected of expectedOrder) {
        expect(seen.some((u) => u.id === expected.id)).toBe(true);
      }
    });

    it('paginates the role-filtered picker read the same way (F-GRP-04 unaffected)', async () => {
      const first = await fetchPage('?role=User&limit=1');
      expect(first.data.map((u) => u.id)).toEqual([expectedOrder[0].id]);
      expect(first.data.every((u) => u.role === UserRole.User)).toBe(true);
      expect(first.pagination.has_more).toBe(true);

      const second = await fetchPage(
        `?role=User&limit=1&cursor=${encodeURIComponent(
          first.pagination.next_cursor!,
        )}`,
      );
      expect(second.data.map((u) => u.id)).toEqual([expectedOrder[4].id]);
      expect(second.data.every((u) => u.role === UserRole.User)).toBe(true);
    });

    it('returns the pagination block on the plain picker call, with no totals (APIS §9.1)', async () => {
      const body = await fetchPage('?role=Teacher');

      expect(Object.keys(body.pagination).sort()).toEqual([
        'has_more',
        'next_cursor',
      ]);
      expect(body).not.toHaveProperty('total');
      expect(body.data.every((u) => u.role === UserRole.Teacher)).toBe(true);
    });

    it('clamps limit instead of rejecting it (APIS §9.2)', async () => {
      const tooSmall = await fetchPage('?limit=0');
      expect(tooSmall.data).toHaveLength(1);

      const tooLarge = await fetchPage('?limit=5000');
      expect(tooLarge.data.length).toBeLessThanOrEqual(100);
    });

    it('treats an unreadable cursor as the first page rather than a 422', async () => {
      const first = await fetchPage('?limit=2');
      const tampered = await fetchPage('?limit=2&cursor=not-a-real-cursor');

      expect(tampered.data.map((u) => u.id)).toEqual(
        first.data.map((u) => u.id),
      );
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
