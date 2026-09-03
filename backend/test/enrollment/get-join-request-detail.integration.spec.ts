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

describe('GET /join-requests/{id} (F-ENR-04 / API-022 Integration)', () => {
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
        SELECT id FROM join_requests WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-detail.com')
      );
    `);
    await dataSource.query(`
      DELETE FROM memberships WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-detail.com')
        OR group_id IN (SELECT id FROM groups WHERE name LIKE '%طابور التفاصيل%');
    `);
    await dataSource.query(`
      DELETE FROM join_requests WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-detail.com')
        OR group_id IN (SELECT id FROM groups WHERE name LIKE '%طابور التفاصيل%');
    `);
    await dataSource.query(`
      DELETE FROM groups WHERE name LIKE '%طابور التفاصيل%'
        OR teacher_id IN (SELECT id FROM users WHERE email LIKE '%@test-detail.com')
        OR assistant_id IN (SELECT id FROM users WHERE email LIKE '%@test-detail.com');
    `);
    await dataSource.query(`
      DELETE FROM audit_entries WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@test-detail.com');
    `);
    await dataSource.query(`
      DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-detail.com');
    `);
    await dataSource.query(`
      DELETE FROM users WHERE email LIKE '%@test-detail.com';
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
    memorizedAhzab?: number[];
    status?: string;
    createdAt?: Date;
    deletedAt?: Date | null;
  }): Promise<string> {
    const requestId = uuidv7();
    const createdAt = params.createdAt ?? new Date();
    const ahzab = params.memorizedAhzab ?? [1, 2, 3, 4, 5];

    await dataSource.query(
      `INSERT INTO join_requests (
        id, user_id, group_id, full_name, gender, age, phone_number, occupation, city,
        memorized_hizb_count, tajweed_level, studied_tajweed_theory, studied_qalun,
        fee_agreement, program_goal, score, status, created_at, deleted_at
      ) VALUES (
        $1, $2, $3, $4, 'Male', 28, '+21698765432', 'أستاذ', 'سوسة',
        $5, 'Advanced', true, true,
        true, 'Memorization', $6, $7, $8, $9
      )`,
      [
        requestId,
        params.userId,
        params.groupId,
        params.fullName,
        ahzab.length,
        params.score,
        params.status ?? 'Pending',
        createdAt,
        params.deletedAt ?? null,
      ],
    );

    for (const hizbNumber of ahzab) {
      await dataSource.query(
        `INSERT INTO join_request_ahzab (join_request_id, hizb_number) VALUES ($1, $2)`,
        [requestId, hizbNumber],
      );
    }

    return requestId;
  }

  describe('Detail retrieval & Authorization', () => {
    let assistantA: { accessToken: string; userId: string };
    let assistantB: { accessToken: string; userId: string };
    let admin: { accessToken: string; userId: string };
    let groupAId: string;
    let groupBId: string;
    let joinRequestAId: string;
    let joinRequestBId: string;
    let deletedRequestId: string;

    beforeAll(async () => {
      const teacher = await registerAndLogin(
        'teacher-detail@test-detail.com',
        UserRole.Teacher,
        'أستاذ التفاصيل',
      );
      assistantA = await registerAndLogin(
        'assistant-a@test-detail.com',
        UserRole.Assistant,
        'مساعد أ',
      );
      assistantB = await registerAndLogin(
        'assistant-b@test-detail.com',
        UserRole.Assistant,
        'مساعد ب',
      );
      admin = await registerAndLogin(
        'admin-detail@test-detail.com',
        UserRole.Admin,
      );

      groupAId = await createTestGroup(
        'حلقة طابور التفاصيل أ',
        teacher.userId,
        assistantA.userId,
      );
      groupBId = await createTestGroup(
        'حلقة طابور التفاصيل ب',
        teacher.userId,
        assistantB.userId,
      );

      const user1 = await registerAndLogin(
        'applicant-1@test-detail.com',
        UserRole.User,
      );
      const user2 = await registerAndLogin(
        'applicant-2@test-detail.com',
        UserRole.User,
      );
      const userDel = await registerAndLogin(
        'applicant-del@test-detail.com',
        UserRole.User,
      );

      joinRequestAId = await seedJoinRequest({
        userId: user1.userId,
        groupId: groupAId,
        fullName: 'متقدم مجموعة أ',
        score: 92.5,
        memorizedAhzab: [1, 2, 3, 4, 5, 6, 7, 8],
      });

      joinRequestBId = await seedJoinRequest({
        userId: user2.userId,
        groupId: groupBId,
        fullName: 'متقدم مجموعة ب',
        score: 84.0,
        memorizedAhzab: [10, 11, 12, 13, 14],
      });

      deletedRequestId = await seedJoinRequest({
        userId: userDel.userId,
        groupId: groupAId,
        fullName: 'متقدم محذوف',
        score: 75.0,
        deletedAt: new Date(),
      });
    });

    it('Admin can view full profile of any join request (Group A & Group B)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/join-requests/${joinRequestAId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBe(joinRequestAId);
      expect(res.body.data.full_name).toBe('متقدم مجموعة أ');
      expect(res.body.data.score).toBe(92.5);
      expect(res.body.data.phone_number).toBe('+21698765432');
      expect(res.body.data.occupation).toBe('أستاذ');
      expect(res.body.data.city).toBe('سوسة');
      expect(res.body.data.tajweed_level).toBe('Advanced');
      expect(res.body.data.studied_tajweed_theory).toBe(true);
      expect(res.body.data.studied_qalun).toBe(true);
      expect(res.body.data.fee_agreement).toBe(true);
      expect(res.body.data.program_goal).toBe('Memorization');
      expect(res.body.data.memorized_ahzab).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(res.body.data.status).toBe('Pending');

      // Assert email is strictly NOT present in the response
      expect(res.body.data.email).toBeUndefined();
      expect(Object.keys(res.body.data as object).sort()).toEqual([
        'age',
        'city',
        'created_at',
        'fee_agreement',
        'full_name',
        'gender',
        'id',
        'memorized_ahzab',
        'occupation',
        'phone_number',
        'program_goal',
        'score',
        'status',
        'studied_qalun',
        'studied_tajweed_theory',
        'tajweed_level',
      ]);

      const resB = await request(app.getHttpServer())
        .get(`/api/v1/join-requests/${joinRequestBId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.OK);

      expect(resB.body.data.id).toBe(joinRequestBId);
      expect(resB.body.data.full_name).toBe('متقدم مجموعة ب');
      expect(resB.body.data.score).toBe(84.0);
    });

    it('Owning Assistant can view full profile of applicant for their assigned group', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/join-requests/${joinRequestAId}`)
        .set('Authorization', `Bearer ${assistantA.accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data.id).toBe(joinRequestAId);
      expect(res.body.data.full_name).toBe('متقدم مجموعة أ');
      expect(res.body.data.memorized_ahzab).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('Non-owning Assistant receives 403 Forbidden for another assistant’s group', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/join-requests/${joinRequestAId}`)
        .set('Authorization', `Bearer ${assistantB.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);

      expect(res.body.statusCode).toBe(403);
    });

    it('Non-existent UUID and out-of-scope access return structurally uniform 403 response (NFR-20)', async () => {
      const randomUuid = uuidv7();

      // Call out-of-scope ID
      const outOfScopeRes = await request(app.getHttpServer())
        .get(`/api/v1/join-requests/${joinRequestAId}`)
        .set('Authorization', `Bearer ${assistantB.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);

      // Call non-existent ID
      const notFoundRes = await request(app.getHttpServer())
        .get(`/api/v1/join-requests/${randomUuid}`)
        .set('Authorization', `Bearer ${assistantB.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);

      // Verify uniform response structure (NFR-20 anti-enumeration)
      expect(notFoundRes.body.statusCode).toBe(403);
      expect(notFoundRes.body.error).toEqual(outOfScopeRes.body.error);
      expect(notFoundRes.body.message).toEqual(outOfScopeRes.body.message);
    });

    it('Soft-deleted join request returns 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/join-requests/${deletedRequestId}`)
        .set('Authorization', `Bearer ${assistantA.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  describe('Authorization Matrix (RBAC)', () => {
    let userToken: string;
    let studentToken: string;
    let teacherToken: string;
    let assistantToken: string;
    let adminToken: string;
    let testRequestId: string;

    beforeAll(async () => {
      const u = await registerAndLogin(
        'rbac-user@test-detail.com',
        UserRole.User,
      );
      userToken = u.accessToken;

      const s = await registerAndLogin(
        'rbac-student@test-detail.com',
        UserRole.Student,
      );
      studentToken = s.accessToken;

      const t = await registerAndLogin(
        'rbac-teacher@test-detail.com',
        UserRole.Teacher,
      );
      teacherToken = t.accessToken;

      const a = await registerAndLogin(
        'rbac-assistant@test-detail.com',
        UserRole.Assistant,
      );
      assistantToken = a.accessToken;

      const adm = await registerAndLogin(
        'rbac-admin@test-detail.com',
        UserRole.Admin,
      );
      adminToken = adm.accessToken;

      const testGroupId = await createTestGroup(
        'حلقة طابور التفاصيل صلاحيات',
        t.userId,
        a.userId,
      );

      testRequestId = await seedJoinRequest({
        userId: u.userId,
        groupId: testGroupId,
        fullName: 'طالب فحص الصلاحيات',
        score: 80.0,
      });
    });

    it('returns 401 Unauthorized for unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/join-requests/${testRequestId}`)
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
          .get(`/api/v1/join-requests/${testRequestId}`)
          .set('Authorization', `Bearer ${getToken()}`)
          .expect(expectedStatus);
      },
    );
  });
});
