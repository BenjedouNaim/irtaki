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

describe('GET /join-requests/mine (F-ENR-02 / API-020 Integration)', () => {
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
    await dataSource.query(`
      DELETE FROM join_request_ahzab WHERE join_request_id IN (
        SELECT id FROM join_requests WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-mine-join-request.com')
      );
    `);
    await dataSource.query(`
      DELETE FROM memberships WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-mine-join-request.com')
        OR group_id IN (SELECT id FROM groups WHERE name LIKE '%حلقة فحص الاستعلام%');
    `);
    await dataSource.query(`
      DELETE FROM join_requests WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-mine-join-request.com')
        OR group_id IN (SELECT id FROM groups WHERE name LIKE '%حلقة فحص الاستعلام%');
    `);
    await dataSource.query(`
      DELETE FROM groups WHERE name LIKE '%حلقة فحص الاستعلام%'
        OR teacher_id IN (SELECT id FROM users WHERE email LIKE '%@test-mine-join-request.com')
        OR assistant_id IN (SELECT id FROM users WHERE email LIKE '%@test-mine-join-request.com');
    `);
    await dataSource.query(`
      DELETE FROM audit_entries WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@test-mine-join-request.com');
    `);
    await dataSource.query(`
      DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-mine-join-request.com');
    `);
    await dataSource.query(`
      DELETE FROM users WHERE email LIKE '%@test-mine-join-request.com';
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

  async function createTestGroup(props?: {
    gender?: 'Male' | 'Female';
    enrollmentStatus?: 'Open' | 'Closed';
    lifecycleState?: 'Active' | 'Archived';
  }): Promise<{ id: string; teacherId: string; assistantId: string }> {
    const teacher = await registerAndLogin(
      `teacher-${uuidv7()}@test-mine-join-request.com`,
      UserRole.Teacher,
      'الشيخ المعلم',
      'Male',
    );
    const assistant = await registerAndLogin(
      `assistant-${uuidv7()}@test-mine-join-request.com`,
      UserRole.Assistant,
      'المساعد الإداري',
      'Male',
    );

    const groupId = uuidv7();
    const gender = props?.gender ?? 'Male';
    const enrollmentStatus = props?.enrollmentStatus ?? 'Open';
    const lifecycleState = props?.lifecycleState ?? 'Active';
    const archivedAt = lifecycleState === 'Archived' ? new Date() : null;

    await dataSource.query(
      `INSERT INTO groups (id, name, gender, recitation_day, enrollment_status, lifecycle_state, archived_at, teacher_id, assistant_id, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), now())`,
      [
        groupId,
        `حلقة فحص الاستعلام ${uuidv7()}`,
        gender,
        1,
        enrollmentStatus,
        lifecycleState,
        archivedAt,
        teacher.userId,
        assistant.userId,
        teacher.userId,
      ],
    );

    return {
      id: groupId,
      teacherId: teacher.userId,
      assistantId: assistant.userId,
    };
  }

  describe('Contract and Opacity (DEC-C09 / APIQ-NEW-06)', () => {
    it('returns 404 NOT_FOUND when the user has never submitted a join request', async () => {
      const user = await registerAndLogin(
        `user-norequest-${uuidv7()}@test-mine-join-request.com`,
        UserRole.User,
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/join-requests/mine')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(HttpStatus.NOT_FOUND);

      expect(res.body.statusCode).toBe(404);
      expect(res.body.error).toBe('NOT_FOUND');
    });

    it('returns 200 { status: "Pending" } with exactly one key in data after submitting', async () => {
      const user = await registerAndLogin(
        `user-pending-${uuidv7()}@test-mine-join-request.com`,
        UserRole.User,
      );
      const group = await createTestGroup({
        gender: 'Male',
        enrollmentStatus: 'Open',
      });

      // Submit join request
      await request(app.getHttpServer())
        .post('/api/v1/join-requests')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          group_id: group.id,
          full_name: 'طالب الفحص',
          gender: 'Male',
          age: 24,
          phone_number: '+21698765432',
          occupation: 'طالب',
          city: 'سوسة',
          memorized_ahzab: [1, 2, 3, 4, 5],
          tajweed_level: 'Beginner',
          studied_tajweed_theory: false,
          studied_qalun: false,
          fee_agreement: true,
          program_goal: 'Memorization',
        })
        .expect(HttpStatus.CREATED);

      // Query GET /join-requests/mine
      const res = await request(app.getHttpServer())
        .get('/api/v1/join-requests/mine')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body).toEqual({
        data: {
          status: 'Pending',
        },
      });

      // Strict DEC-C09 contract check: exactly one key in data object
      const dataKeys = Object.keys(res.body.data as Record<string, unknown>);
      expect(dataKeys).toEqual(['status']);
    });

    it('returns 200 { status: "Rejected" } with exactly one key after terminal rejection in DB', async () => {
      const user = await registerAndLogin(
        `user-rejected-${uuidv7()}@test-mine-join-request.com`,
        UserRole.User,
      );
      const group = await createTestGroup({
        gender: 'Male',
        enrollmentStatus: 'Open',
      });

      const submitRes = await request(app.getHttpServer())
        .post('/api/v1/join-requests')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          group_id: group.id,
          full_name: 'طالب مرفوض',
          gender: 'Male',
          age: 28,
          phone_number: '+21698765431',
          occupation: 'محاسب',
          city: 'صفاقس',
          memorized_ahzab: [1, 2, 3, 4, 5, 6],
          tajweed_level: 'Intermediate',
          studied_tajweed_theory: true,
          studied_qalun: false,
          fee_agreement: true,
          program_goal: 'Memorization',
        })
        .expect(HttpStatus.CREATED);

      const requestId = submitRes.body.data.id;

      // Update status directly to Rejected
      await dataSource.query(
        `UPDATE join_requests SET status = 'Rejected', reviewed_at = now() WHERE id = $1`,
        [requestId],
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/join-requests/mine')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body).toEqual({
        data: {
          status: 'Rejected',
        },
      });
      expect(Object.keys(res.body.data as Record<string, unknown>)).toEqual([
        'status',
      ]);
    });

    it('returns 200 { status: "Accepted" } with exactly one key when status is Accepted in DB', async () => {
      const user = await registerAndLogin(
        `user-accepted-${uuidv7()}@test-mine-join-request.com`,
        UserRole.User,
      );
      const group = await createTestGroup({
        gender: 'Male',
        enrollmentStatus: 'Open',
      });

      const submitRes = await request(app.getHttpServer())
        .post('/api/v1/join-requests')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          group_id: group.id,
          full_name: 'طالب مقبول',
          gender: 'Male',
          age: 30,
          phone_number: '+21698765430',
          occupation: 'طبيب',
          city: 'المنستير',
          memorized_ahzab: [1, 2, 3, 4, 5, 6, 7],
          tajweed_level: 'Advanced',
          studied_tajweed_theory: true,
          studied_qalun: true,
          fee_agreement: true,
          program_goal: 'Memorization',
        })
        .expect(HttpStatus.CREATED);

      const requestId = submitRes.body.data.id;

      // Update status directly to Accepted (still with User role in session)
      await dataSource.query(
        `UPDATE join_requests SET status = 'Accepted', reviewed_at = now() WHERE id = $1`,
        [requestId],
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/join-requests/mine')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body).toEqual({
        data: {
          status: 'Accepted',
        },
      });
      expect(Object.keys(res.body.data as Record<string, unknown>)).toEqual([
        'status',
      ]);
    });

    it('returns 404 if the join request was soft-deleted', async () => {
      const user = await registerAndLogin(
        `user-softdeleted-${uuidv7()}@test-mine-join-request.com`,
        UserRole.User,
      );
      const group = await createTestGroup({
        gender: 'Male',
        enrollmentStatus: 'Open',
      });

      const submitRes = await request(app.getHttpServer())
        .post('/api/v1/join-requests')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          group_id: group.id,
          full_name: 'طالب محذوف',
          gender: 'Male',
          age: 21,
          phone_number: '+21698765429',
          occupation: 'طالب',
          city: 'تونس',
          memorized_ahzab: [1, 2, 3, 4, 5],
          tajweed_level: 'Beginner',
          studied_tajweed_theory: false,
          studied_qalun: false,
          fee_agreement: true,
          program_goal: 'Memorization',
        })
        .expect(HttpStatus.CREATED);

      const requestId = submitRes.body.data.id;

      // Soft-delete the join request
      await dataSource.query(
        `UPDATE join_requests SET deleted_at = now() WHERE id = $1`,
        [requestId],
      );

      await request(app.getHttpServer())
        .get('/api/v1/join-requests/mine')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('returns the latest request status when user has historical multiple requests', async () => {
      const user = await registerAndLogin(
        `user-reapply-${uuidv7()}@test-mine-join-request.com`,
        UserRole.User,
      );
      const group = await createTestGroup({
        gender: 'Male',
        enrollmentStatus: 'Open',
      });

      // First submit and reject
      const req1 = await request(app.getHttpServer())
        .post('/api/v1/join-requests')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          group_id: group.id,
          full_name: 'طالب معيد',
          gender: 'Male',
          age: 22,
          phone_number: '+21698765428',
          occupation: 'طالب',
          city: 'تونس',
          memorized_ahzab: [1, 2, 3, 4, 5],
          tajweed_level: 'Beginner',
          studied_tajweed_theory: false,
          studied_qalun: false,
          fee_agreement: true,
          program_goal: 'Memorization',
        })
        .expect(HttpStatus.CREATED);

      await dataSource.query(
        `UPDATE join_requests SET status = 'Rejected', reviewed_at = now() WHERE id = $1`,
        [req1.body.data.id],
      );

      // Reapply (second submission)
      await request(app.getHttpServer())
        .post('/api/v1/join-requests')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          group_id: group.id,
          full_name: 'طالب معيد 2',
          gender: 'Male',
          age: 22,
          phone_number: '+21698765428',
          occupation: 'طالب',
          city: 'تونس',
          memorized_ahzab: [1, 2, 3, 4, 5, 6],
          tajweed_level: 'Intermediate',
          studied_tajweed_theory: true,
          studied_qalun: false,
          fee_agreement: true,
          program_goal: 'Memorization',
        })
        .expect(HttpStatus.CREATED);

      // Latest should be Pending
      const res = await request(app.getHttpServer())
        .get('/api/v1/join-requests/mine')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data.status).toBe('Pending');
    });
  });

  describe('Authorization matrix', () => {
    it('returns 401 UNAUTHORIZED when no token is provided', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/join-requests/mine')
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it.each([
      [UserRole.Admin],
      [UserRole.Teacher],
      [UserRole.Assistant],
      [UserRole.Student],
    ])('returns 403 FORBIDDEN for role %s', async (role: UserRole) => {
      const actor = await registerAndLogin(
        `actor-${role.toLowerCase()}-${uuidv7()}@test-mine-join-request.com`,
        role,
        'مستخدم آخر',
        'Male',
      );

      await request(app.getHttpServer())
        .get('/api/v1/join-requests/mine')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('returns 403 FORBIDDEN for a Student even if they previously had a join request in DB', async () => {
      const student = await registerAndLogin(
        `student-with-prior-req-${uuidv7()}@test-mine-join-request.com`,
        UserRole.Student,
        'طالب حالي',
        'Male',
      );
      const group = await createTestGroup({
        gender: 'Male',
        enrollmentStatus: 'Open',
      });

      // Insert an accepted join request for this student
      await dataSource.query(
        `INSERT INTO join_requests (id, user_id, group_id, full_name, gender, age, phone_number, occupation, city, memorized_hizb_count, tajweed_level, studied_tajweed_theory, studied_qalun, fee_agreement, program_goal, score, status, resolution_source, reviewed_at, reviewed_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, now(), $19, now())`,
        [
          uuidv7(),
          student.userId,
          group.id,
          'طالب حالي',
          'Male',
          25,
          '+21698765427',
          'طالب',
          'تونس',
          10,
          'Intermediate',
          true,
          true,
          true,
          'Memorization',
          75.0,
          'Accepted',
          'Assistant',
          group.assistantId,
        ],
      );

      // Calling GET /join-requests/mine with Student token must be 403
      await request(app.getHttpServer())
        .get('/api/v1/join-requests/mine')
        .set('Authorization', `Bearer ${student.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });
  });
});
