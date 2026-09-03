/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import { AppModule } from '../../src/app.module';
import {
  MAILER,
  IMailer,
} from '../../src/modules/identity/domain/mailer.interface';
import {
  PASSWORD_HASHER,
  IPasswordHasher,
} from '../../src/modules/identity/domain/password-hasher.interface';
import { UserRole } from '../../src/modules/identity/domain/user-role.enum';
import { stopScheduledJobs } from '../shared/scheduled-jobs';

describe('GET /join-requests?status=pending (F-ENR-03 / API-021 Integration)', () => {
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
    await dataSource.query(`
      DELETE FROM join_request_ahzab WHERE join_request_id IN (
        SELECT id FROM join_requests WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-queue.com')
      );
    `);
    await dataSource.query(`
      DELETE FROM memberships WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-queue.com')
        OR group_id IN (SELECT id FROM groups WHERE name LIKE '%طابور المساعد%');
    `);
    await dataSource.query(`
      DELETE FROM join_requests WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-queue.com')
        OR group_id IN (SELECT id FROM groups WHERE name LIKE '%طابور المساعد%');
    `);
    await dataSource.query(`
      DELETE FROM groups WHERE name LIKE '%طابور المساعد%'
        OR teacher_id IN (SELECT id FROM users WHERE email LIKE '%@test-queue.com')
        OR assistant_id IN (SELECT id FROM users WHERE email LIKE '%@test-queue.com');
    `);
    await dataSource.query(`
      DELETE FROM audit_entries WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@test-queue.com');
    `);
    await dataSource.query(`
      DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-queue.com');
    `);
    await dataSource.query(`
      DELETE FROM users WHERE email LIKE '%@test-queue.com';
    `);
  }

  async function registerAndLogin(
    email: string,
    role: UserRole = UserRole.User,
    fullName: string | null = null,
    gender: 'Male' | 'Female' | null = null,
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

        return {
          accessToken: loginRes.body.access_token,
          userId: adminId,
          userEmail: adminEmail,
        };
      }
    }

    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, timezone: 'Africa/Tunis' })
      .expect(HttpStatus.CREATED);

    const userId = regRes.body.id;

    if (role !== UserRole.User || fullName !== null || gender !== null) {
      await dataSource.query(
        `UPDATE users SET role = $1, full_name = $2, gender = $3 WHERE id = $4`,
        [role, fullName, gender, userId],
      );
    }

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(HttpStatus.OK);

    return {
      accessToken: loginRes.body.access_token,
      userId,
      userEmail: email,
    };
  }

  async function createTestGroup(
    name: string,
    teacherId: string,
    assistantId: string,
    gender: 'Male' | 'Female' = 'Male',
    recitationDay = 5,
  ): Promise<string> {
    const groupId = uuidv7();
    await dataSource.query(
      `INSERT INTO groups (id, name, gender, recitation_day, enrollment_status, lifecycle_state, teacher_id, assistant_id, created_by)
       VALUES ($1, $2, $3, $4, 'Open', 'Active', $5, $6, $7)`,
      [groupId, name, gender, recitationDay, teacherId, assistantId, teacherId],
    );
    return groupId;
  }

  async function seedJoinRequest(params: {
    userId: string;
    groupId: string;
    fullName: string;
    score: number;
    status?: string;
    createdAt?: Date;
    deletedAt?: Date | null;
  }): Promise<string> {
    const requestId = uuidv7();
    const createdAt = params.createdAt ?? new Date();
    await dataSource.query(
      `INSERT INTO join_requests (
        id, user_id, group_id, full_name, gender, age, phone_number, occupation, city,
        memorized_hizb_count, tajweed_level, studied_tajweed_theory, studied_qalun,
        fee_agreement, program_goal, score, status, created_at, deleted_at
      ) VALUES (
        $1, $2, $3, $4, 'Male', 25, '+21698123456', 'مهندس', 'تونس',
        10, 'Intermediate', true, true,
        true, 'Memorization', $5, $6, $7, $8
      )`,
      [
        requestId,
        params.userId,
        params.groupId,
        params.fullName,
        params.score,
        params.status ?? 'Pending',
        createdAt,
        params.deletedAt ?? null,
      ],
    );
    return requestId;
  }

  describe('Scope isolation: Assistant vs Admin', () => {
    let assistantA: { accessToken: string; userId: string };
    let assistantB: { accessToken: string; userId: string };
    let admin: { accessToken: string; userId: string };
    let groupAId: string;
    let groupBId: string;
    let user1Id: string;
    let user2Id: string;

    beforeAll(async () => {
      const teacher = await registerAndLogin(
        'teacher-scope@test-queue.com',
        UserRole.Teacher,
        'أستاذ الطابور',
      );
      assistantA = await registerAndLogin(
        'assistant-a@test-queue.com',
        UserRole.Assistant,
        'مساعد أ',
      );
      assistantB = await registerAndLogin(
        'assistant-b@test-queue.com',
        UserRole.Assistant,
        'مساعد ب',
      );
      admin = await registerAndLogin(
        'admin-scope@test-queue.com',
        UserRole.Admin,
      );

      groupAId = await createTestGroup(
        'حلقة طابور المساعد أ',
        teacher.userId,
        assistantA.userId,
      );
      groupBId = await createTestGroup(
        'حلقة طابور المساعد ب',
        teacher.userId,
        assistantB.userId,
      );

      const user1 = await registerAndLogin(
        'applicant-1@test-queue.com',
        UserRole.User,
      );
      const user2 = await registerAndLogin(
        'applicant-2@test-queue.com',
        UserRole.User,
      );
      user1Id = user1.userId;
      user2Id = user2.userId;

      await seedJoinRequest({
        userId: user1Id,
        groupId: groupAId,
        fullName: 'طالب مجموعة أ',
        score: 85.0,
      });

      await seedJoinRequest({
        userId: user2Id,
        groupId: groupBId,
        fullName: 'طالب مجموعة ب',
        score: 95.0,
      });
    });

    it('Assistant A sees ONLY pending requests for groups they assist', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/join-requests?status=pending')
        .set('Authorization', `Bearer ${assistantA.accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].full_name).toBe('طالب مجموعة أ');
      expect(res.body.data[0].score).toBe(85.0);
    });

    it('Assistant B sees ONLY pending requests for their group', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/join-requests?status=pending')
        .set('Authorization', `Bearer ${assistantB.accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].full_name).toBe('طالب مجموعة ب');
      expect(res.body.data[0].score).toBe(95.0);
    });

    it('Admin sees ALL pending requests across all groups', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/join-requests?status=pending')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      const names = (res.body.data as Array<{ full_name: string }>).map(
        (d) => d.full_name,
      );
      expect(names).toContain('طالب مجموعة أ');
      expect(names).toContain('طالب مجموعة ب');
    });
  });

  describe('Sorting: score DESC, created_at ASC, id ASC', () => {
    let assistant: { accessToken: string; userId: string };
    let groupId: string;

    beforeAll(async () => {
      const teacher = await registerAndLogin(
        'teacher-sort@test-queue.com',
        UserRole.Teacher,
      );
      assistant = await registerAndLogin(
        'assistant-sort@test-queue.com',
        UserRole.Assistant,
      );
      groupId = await createTestGroup(
        'حلقة طابور المساعد ترتيب',
        teacher.userId,
        assistant.userId,
      );

      const u1 = await registerAndLogin('user-sort-1@test-queue.com');
      const u2 = await registerAndLogin('user-sort-2@test-queue.com');
      const u3 = await registerAndLogin('user-sort-3@test-queue.com');
      const u4 = await registerAndLogin('user-sort-4@test-queue.com');

      // Seed deliberately in non-sorted order
      // Low score
      await seedJoinRequest({
        userId: u1.userId,
        groupId,
        fullName: 'طالب علامة 50',
        score: 50.0,
        createdAt: new Date('2026-08-01T10:00:00Z'),
      });

      // Highest score
      await seedJoinRequest({
        userId: u2.userId,
        groupId,
        fullName: 'طالب علامة 95',
        score: 95.0,
        createdAt: new Date('2026-08-05T10:00:00Z'),
      });

      // Equal score 80, earlier created_at
      await seedJoinRequest({
        userId: u3.userId,
        groupId,
        fullName: 'طالب علامة 80 مبكر',
        score: 80.0,
        createdAt: new Date('2026-08-02T10:00:00Z'),
      });

      // Equal score 80, later created_at
      await seedJoinRequest({
        userId: u4.userId,
        groupId,
        fullName: 'طالب علامة 80 متأخر',
        score: 80.0,
        createdAt: new Date('2026-08-03T10:00:00Z'),
      });
    });

    it('returns rows strictly sorted by score DESC, created_at ASC', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/join-requests?status=pending')
        .set('Authorization', `Bearer ${assistant.accessToken}`)
        .expect(HttpStatus.OK);

      const names = (res.body.data as Array<{ full_name: string }>).map(
        (d) => d.full_name,
      );
      expect(names).toEqual([
        'طالب علامة 95',
        'طالب علامة 80 مبكر',
        'طالب علامة 80 متأخر',
        'طالب علامة 50',
      ]);
    });
  });

  describe('Lean shape enforcement: strictly 4 fields, no PII leakage', () => {
    let assistant: { accessToken: string; userId: string };
    let groupId: string;

    beforeAll(async () => {
      const teacher = await registerAndLogin(
        'teacher-lean@test-queue.com',
        UserRole.Teacher,
      );
      assistant = await registerAndLogin(
        'assistant-lean@test-queue.com',
        UserRole.Assistant,
      );
      groupId = await createTestGroup(
        'حلقة طابور المساعد مظهر رشيق',
        teacher.userId,
        assistant.userId,
      );

      const user = await registerAndLogin('user-lean@test-queue.com');
      await seedJoinRequest({
        userId: user.userId,
        groupId,
        fullName: 'طالب فحص الحقول',
        score: 88.0,
      });
    });

    it('asserts strictly exactly the 4 lean fields per row', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/join-requests?status=pending')
        .set('Authorization', `Bearer ${assistant.accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toHaveLength(1);
      const item = res.body.data[0];

      // Exact keys check
      const keys = Object.keys(item as object).sort();
      expect(keys).toEqual(['created_at', 'full_name', 'id', 'score']);

      // Assert no PII keys exist
      expect(item.email).toBeUndefined();
      expect(item.phone_number).toBeUndefined();
      expect(item.age).toBeUndefined();
      expect(item.city).toBeUndefined();
      expect(item.occupation).toBeUndefined();
      expect(item.tajweed_level).toBeUndefined();
      expect(item.memorized_ahzab).toBeUndefined();
    });
  });

  describe('Status filter and soft delete exclusion', () => {
    let assistant: { accessToken: string; userId: string };
    let groupId: string;

    beforeAll(async () => {
      const teacher = await registerAndLogin(
        'teacher-status@test-queue.com',
        UserRole.Teacher,
      );
      assistant = await registerAndLogin(
        'assistant-status@test-queue.com',
        UserRole.Assistant,
      );
      groupId = await createTestGroup(
        'حلقة طابور المساعد فلتر الحالة',
        teacher.userId,
        assistant.userId,
      );

      const u1 = await registerAndLogin('u-pending@test-queue.com');
      const u2 = await registerAndLogin('u-accepted@test-queue.com');
      const u3 = await registerAndLogin('u-rejected@test-queue.com');
      const u4 = await registerAndLogin('u-deleted@test-queue.com');

      await seedJoinRequest({
        userId: u1.userId,
        groupId,
        fullName: 'طالب معلق نشط',
        score: 75.0,
        status: 'Pending',
      });

      await seedJoinRequest({
        userId: u2.userId,
        groupId,
        fullName: 'طالب مقبول',
        score: 95.0,
        status: 'Accepted',
      });

      await seedJoinRequest({
        userId: u3.userId,
        groupId,
        fullName: 'طالب مرفوض',
        score: 60.0,
        status: 'Rejected',
      });

      await seedJoinRequest({
        userId: u4.userId,
        groupId,
        fullName: 'طالب محذوف',
        score: 80.0,
        status: 'Pending',
        deletedAt: new Date(),
      });
    });

    it('returns only non-deleted Pending requests', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/join-requests?status=pending')
        .set('Authorization', `Bearer ${assistant.accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].full_name).toBe('طالب معلق نشط');
    });
  });

  describe('Pagination: keyset cursor, has_more, limit clamping', () => {
    let assistant: { accessToken: string; userId: string };
    let groupId: string;

    beforeAll(async () => {
      const teacher = await registerAndLogin(
        'teacher-pag@test-queue.com',
        UserRole.Teacher,
      );
      assistant = await registerAndLogin(
        'assistant-pag@test-queue.com',
        UserRole.Assistant,
      );
      groupId = await createTestGroup(
        'حلقة طابور المساعد ترقيم',
        teacher.userId,
        assistant.userId,
      );

      // Seed 5 requests with scores: 90, 80, 70, 60, 50
      for (let i = 1; i <= 5; i++) {
        const u = await registerAndLogin(`u-pag-${i}@test-queue.com`);
        await seedJoinRequest({
          userId: u.userId,
          groupId,
          fullName: `طالب ترقيم ${i}`,
          score: 100 - i * 10,
          createdAt: new Date(`2026-08-0${i}T10:00:00Z`),
        });
      }
    });

    it('paginates accurately across multiple pages without duplicates or gaps', async () => {
      // Page 1: limit=2
      const resPage1 = await request(app.getHttpServer())
        .get('/api/v1/join-requests?status=pending&limit=2')
        .set('Authorization', `Bearer ${assistant.accessToken}`)
        .expect(HttpStatus.OK);

      expect(resPage1.body.data).toHaveLength(2);
      expect(resPage1.body.data[0].full_name).toBe('طالب ترقيم 1');
      expect(resPage1.body.data[1].full_name).toBe('طالب ترقيم 2');
      expect(resPage1.body.pagination.has_more).toBe(true);
      expect(resPage1.body.pagination.next_cursor).toBeTruthy();

      // Page 2: with cursor
      const resPage2 = await request(app.getHttpServer())
        .get(
          `/api/v1/join-requests?status=pending&limit=2&cursor=${resPage1.body.pagination.next_cursor}`,
        )
        .set('Authorization', `Bearer ${assistant.accessToken}`)
        .expect(HttpStatus.OK);

      expect(resPage2.body.data).toHaveLength(2);
      expect(resPage2.body.data[0].full_name).toBe('طالب ترقيم 3');
      expect(resPage2.body.data[1].full_name).toBe('طالب ترقيم 4');
      expect(resPage2.body.pagination.has_more).toBe(true);
      expect(resPage2.body.pagination.next_cursor).toBeTruthy();

      // Page 3: last page
      const resPage3 = await request(app.getHttpServer())
        .get(
          `/api/v1/join-requests?status=pending&limit=2&cursor=${resPage2.body.pagination.next_cursor}`,
        )
        .set('Authorization', `Bearer ${assistant.accessToken}`)
        .expect(HttpStatus.OK);

      expect(resPage3.body.data).toHaveLength(1);
      expect(resPage3.body.data[0].full_name).toBe('طالب ترقيم 5');
      expect(resPage3.body.pagination.has_more).toBe(false);
      expect(resPage3.body.pagination.next_cursor).toBeNull();
    });

    it('clamps limit to maximum 100 and minimum 1', async () => {
      const resMax = await request(app.getHttpServer())
        .get('/api/v1/join-requests?status=pending&limit=500')
        .set('Authorization', `Bearer ${assistant.accessToken}`)
        .expect(HttpStatus.OK);

      expect(resMax.body.data).toHaveLength(5);

      const resMin = await request(app.getHttpServer())
        .get('/api/v1/join-requests?status=pending&limit=0')
        .set('Authorization', `Bearer ${assistant.accessToken}`)
        .expect(HttpStatus.OK);

      expect(resMin.body.data).toHaveLength(1);
    });

    it('falls back safely to first page on malformed cursor string', async () => {
      const res = await request(app.getHttpServer())
        .get(
          '/api/v1/join-requests?status=pending&limit=2&cursor=invalid-cursor',
        )
        .set('Authorization', `Bearer ${assistant.accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].full_name).toBe('طالب ترقيم 1');
    });
  });

  describe('Query filter validation', () => {
    let assistant: { accessToken: string; userId: string };

    beforeAll(async () => {
      assistant = await registerAndLogin(
        'assistant-val@test-queue.com',
        UserRole.Assistant,
      );
    });

    it('returns 400 Bad Request when status query param is missing', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/join-requests')
        .set('Authorization', `Bearer ${assistant.accessToken}`)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('returns 400 Bad Request when status is not "pending"', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/join-requests?status=accepted')
        .set('Authorization', `Bearer ${assistant.accessToken}`)
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('Authorization Matrix (RBAC)', () => {
    let userToken: string;
    let studentToken: string;
    let teacherToken: string;
    let assistantToken: string;
    let adminToken: string;

    beforeAll(async () => {
      const u = await registerAndLogin(
        'auth-user@test-queue.com',
        UserRole.User,
      );
      userToken = u.accessToken;

      const s = await registerAndLogin(
        'auth-student@test-queue.com',
        UserRole.Student,
      );
      studentToken = s.accessToken;

      const t = await registerAndLogin(
        'auth-teacher@test-queue.com',
        UserRole.Teacher,
      );
      teacherToken = t.accessToken;

      const a = await registerAndLogin(
        'auth-assistant@test-queue.com',
        UserRole.Assistant,
      );
      assistantToken = a.accessToken;

      const adm = await registerAndLogin(
        'auth-admin@test-queue.com',
        UserRole.Admin,
      );
      adminToken = adm.accessToken;
    });

    it('returns 401 Unauthorized for unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/join-requests?status=pending')
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it.each([
      ['User', () => userToken, HttpStatus.FORBIDDEN],
      ['Student', () => studentToken, HttpStatus.FORBIDDEN],
      ['Teacher', () => teacherToken, HttpStatus.FORBIDDEN],
      ['Assistant', () => assistantToken, HttpStatus.OK],
      ['Admin', () => adminToken, HttpStatus.OK],
    ])(
      'role %s receives status %s',
      async (_roleName, getToken, expectedStatus) => {
        await request(app.getHttpServer())
          .get('/api/v1/join-requests?status=pending')
          .set('Authorization', `Bearer ${getToken()}`)
          .expect(expectedStatus);
      },
    );
  });
});
