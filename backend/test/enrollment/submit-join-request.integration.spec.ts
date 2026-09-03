/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
import { JoinRequestSubmittedEvent } from '../../src/modules/enrollment/domain/events/join-request-submitted.event';
import {
  purgeNotificationLog,
  stopScheduledJobs,
} from '../shared/scheduled-jobs';

describe('POST /join-requests (API-019 Integration)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let eventEmitter: EventEmitter2;

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
    eventEmitter = app.get(EventEmitter2);

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
    await dataSource.query(`
      DELETE FROM join_request_ahzab WHERE join_request_id IN (
        SELECT id FROM join_requests WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-submit-join-request.com')
      );
    `);
    await dataSource.query(`
      DELETE FROM memberships WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-submit-join-request.com')
        OR group_id IN (SELECT id FROM groups WHERE name LIKE '%حلقة فحص التقديم%');
    `);
    await dataSource.query(`
      DELETE FROM join_requests WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-submit-join-request.com')
        OR group_id IN (SELECT id FROM groups WHERE name LIKE '%حلقة فحص التقديم%');
    `);
    await dataSource.query(`
      DELETE FROM groups WHERE name LIKE '%حلقة فحص التقديم%'
        OR teacher_id IN (SELECT id FROM users WHERE email LIKE '%@test-submit-join-request.com')
        OR assistant_id IN (SELECT id FROM users WHERE email LIKE '%@test-submit-join-request.com');
    `);
    await dataSource.query(`
      DELETE FROM audit_entries WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@test-submit-join-request.com');
    `);
    await dataSource.query(`
      DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-submit-join-request.com');
    `);
    await dataSource.query(`
      DELETE FROM users WHERE email LIKE '%@test-submit-join-request.com';
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
      `teacher-${uuidv7()}@test-submit-join-request.com`,
      UserRole.Teacher,
      'الشيخ المعلم',
      'Male',
    );
    const assistant = await registerAndLogin(
      `assistant-${uuidv7()}@test-submit-join-request.com`,
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
        `حلقة فحص التقديم ${uuidv7()}`,
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

  it('submits a valid join request: returns 201, computes score, writes to DB and emits event', async () => {
    const user = await registerAndLogin(
      `user-valid-${uuidv7()}@test-submit-join-request.com`,
      UserRole.User,
    );
    const group = await createTestGroup({
      gender: 'Male',
      enrollmentStatus: 'Open',
    });

    let emittedEvent: JoinRequestSubmittedEvent | null = null;
    const listener = (event: JoinRequestSubmittedEvent) => {
      emittedEvent = event;
    };
    eventEmitter.on(JoinRequestSubmittedEvent.EVENT_NAME, listener);

    const payload = {
      group_id: group.id,
      full_name: 'أحمد التونسي',
      gender: 'Male',
      age: 26,
      phone_number: '+21698123456',
      occupation: 'مهندس برمجيات',
      city: 'تونس',
      memorized_ahzab: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], // 10 ahzab -> (10/60)*50 = 8.33
      tajweed_level: 'Advanced', // 25
      studied_tajweed_theory: true, // 10
      studied_qalun: true, // 15
      fee_agreement: true,
      program_goal: 'Memorization',
    };
    // Expected score: 8.33 + 25 + 10 + 15 = 58.33

    const res = await request(app.getHttpServer())
      .post('/api/v1/join-requests')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send(payload);

    expect(res.status).toBe(HttpStatus.CREATED);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.status).toBe('Pending');
    expect(res.body.data.score).toBe(58.33);
    expect(res.body.data.created_at).toBeDefined();

    // Verify DB join_requests row
    const [dbRow] = await dataSource.query(
      `SELECT * FROM join_requests WHERE id = $1`,
      [res.body.data.id],
    );
    expect(dbRow).toBeDefined();
    expect(dbRow.user_id).toBe(user.userId);
    expect(dbRow.group_id).toBe(group.id);
    expect(dbRow.full_name).toBe('أحمد التونسي');
    expect(dbRow.gender).toBe('Male');
    expect(dbRow.memorized_hizb_count).toBe(10);
    expect(Number(dbRow.score)).toBe(58.33);
    expect(dbRow.status).toBe('Pending');

    // Verify DB join_request_ahzab rows
    const ahzabRows = await dataSource.query<{ hizb_number: number }[]>(
      `SELECT hizb_number FROM join_request_ahzab WHERE join_request_id = $1 ORDER BY hizb_number ASC`,
      [res.body.data.id],
    );
    expect(ahzabRows.map((r) => r.hizb_number)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);

    // Verify event emission
    expect(emittedEvent).toBeDefined();
    const capturedEvent = emittedEvent as JoinRequestSubmittedEvent | null;
    expect(capturedEvent?.joinRequestId).toBe(
      (res.body as { data: { id: string } }).data.id,
    );
    expect(capturedEvent?.applicantId).toBe(user.userId);
    expect(capturedEvent?.score).toBe(58.33);

    eventEmitter.off(JoinRequestSubmittedEvent.EVENT_NAME, listener);
  });

  describe('Authorization checks', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const group = await createTestGroup();
      const res = await request(app.getHttpServer())
        .post('/api/v1/join-requests')
        .send({
          group_id: group.id,
          full_name: 'مستخدم غير مسجل',
          gender: 'Male',
          age: 20,
          phone_number: '+21620111222',
          occupation: 'طالب',
          city: 'سوسة',
          memorized_ahzab: [1, 2, 3, 4, 5],
          tajweed_level: 'Beginner',
          studied_tajweed_theory: false,
          studied_qalun: false,
          fee_agreement: true,
          program_goal: 'Memorization',
        });

      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it.each([
      [UserRole.Admin],
      [UserRole.Teacher],
      [UserRole.Assistant],
      [UserRole.Student],
    ])('rejects role %s with 403 Forbidden', async (role) => {
      const actor = await registerAndLogin(
        `actor-${role.toLowerCase()}-${uuidv7()}@test-submit-join-request.com`,
        role,
      );
      const group = await createTestGroup();

      const res = await request(app.getHttpServer())
        .post('/api/v1/join-requests')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .send({
          group_id: group.id,
          full_name: 'فحص الصلاحيات',
          gender: 'Male',
          age: 22,
          phone_number: '+21620333444',
          occupation: 'موظف',
          city: 'صفاقس',
          memorized_ahzab: [1, 2, 3, 4, 5],
          tajweed_level: 'Beginner',
          studied_tajweed_theory: false,
          studied_qalun: false,
          fee_agreement: true,
          program_goal: 'Memorization',
        });

      expect(res.status).toBe(HttpStatus.FORBIDDEN);
    });
  });

  describe('Group availability & duplicate checks (409)', () => {
    it('returns 409 GROUP_UNAVAILABLE if group does not exist', async () => {
      const user = await registerAndLogin(
        `user-missing-group-${uuidv7()}@test-submit-join-request.com`,
        UserRole.User,
      );

      const res = await request(app.getHttpServer())
        .post('/api/v1/join-requests')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          group_id: uuidv7(),
          full_name: 'محمد علي',
          gender: 'Male',
          age: 30,
          phone_number: '+21622334455',
          occupation: 'طبيب',
          city: 'تونس',
          memorized_ahzab: [1, 2, 3, 4, 5],
          tajweed_level: 'Beginner',
          studied_tajweed_theory: false,
          studied_qalun: false,
          fee_agreement: true,
          program_goal: 'Memorization',
        });

      expect(res.status).toBe(HttpStatus.CONFLICT);
      expect(res.body.error).toBe('GROUP_UNAVAILABLE');
    });

    it('returns 409 GROUP_UNAVAILABLE if group is Closed', async () => {
      const user = await registerAndLogin(
        `user-closed-group-${uuidv7()}@test-submit-join-request.com`,
        UserRole.User,
      );
      const group = await createTestGroup({ enrollmentStatus: 'Closed' });

      const res = await request(app.getHttpServer())
        .post('/api/v1/join-requests')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          group_id: group.id,
          full_name: 'محمد علي',
          gender: 'Male',
          age: 30,
          phone_number: '+21622334455',
          occupation: 'طبيب',
          city: 'تونس',
          memorized_ahzab: [1, 2, 3, 4, 5],
          tajweed_level: 'Beginner',
          studied_tajweed_theory: false,
          studied_qalun: false,
          fee_agreement: true,
          program_goal: 'Memorization',
        });

      expect(res.status).toBe(HttpStatus.CONFLICT);
      expect(res.body.error).toBe('GROUP_UNAVAILABLE');
    });

    it('returns 409 GROUP_UNAVAILABLE if group is Archived', async () => {
      const user = await registerAndLogin(
        `user-archived-group-${uuidv7()}@test-submit-join-request.com`,
        UserRole.User,
      );
      const group = await createTestGroup({ lifecycleState: 'Archived' });

      const res = await request(app.getHttpServer())
        .post('/api/v1/join-requests')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          group_id: group.id,
          full_name: 'محمد علي',
          gender: 'Male',
          age: 30,
          phone_number: '+21622334455',
          occupation: 'طبيب',
          city: 'تونس',
          memorized_ahzab: [1, 2, 3, 4, 5],
          tajweed_level: 'Beginner',
          studied_tajweed_theory: false,
          studied_qalun: false,
          fee_agreement: true,
          program_goal: 'Memorization',
        });

      expect(res.status).toBe(HttpStatus.CONFLICT);
      expect(res.body.error).toBe('GROUP_UNAVAILABLE');
    });

    it('returns 409 DUPLICATE_JOIN_REQUEST if user already has a Pending request', async () => {
      const user = await registerAndLogin(
        `user-dup-pending-${uuidv7()}@test-submit-join-request.com`,
        UserRole.User,
      );
      const group1 = await createTestGroup();
      const group2 = await createTestGroup();

      const validPayload = {
        group_id: group1.id,
        full_name: 'علي المنستيري',
        gender: 'Male',
        age: 28,
        phone_number: '+21698765432',
        occupation: 'أستاذ',
        city: 'المنستير',
        memorized_ahzab: [1, 2, 3, 4, 5],
        tajweed_level: 'Beginner',
        studied_tajweed_theory: false,
        studied_qalun: false,
        fee_agreement: true,
        program_goal: 'Memorization',
      };

      // 1st request -> 201
      const res1 = await request(app.getHttpServer())
        .post('/api/v1/join-requests')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send(validPayload);
      expect(res1.status).toBe(HttpStatus.CREATED);

      // 2nd request to another group -> 409
      const res2 = await request(app.getHttpServer())
        .post('/api/v1/join-requests')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ ...validPayload, group_id: group2.id });
      expect(res2.status).toBe(HttpStatus.CONFLICT);
      expect(res2.body.error).toBe('DUPLICATE_JOIN_REQUEST');
    });

    it('returns 409 DUPLICATE_JOIN_REQUEST if user already has an Active Membership', async () => {
      const user = await registerAndLogin(
        `user-active-member-${uuidv7()}@test-submit-join-request.com`,
        UserRole.User,
      );
      const group1 = await createTestGroup();
      const group2 = await createTestGroup();

      // Seed an active membership
      await dataSource.query(
        `INSERT INTO memberships (id, user_id, group_id, state, started_at, created_at, updated_at)
         VALUES ($1, $2, $3, 'Active', '2026-01-01', now(), now())`,
        [uuidv7(), user.userId, group1.id],
      );

      const res = await request(app.getHttpServer())
        .post('/api/v1/join-requests')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          group_id: group2.id,
          full_name: 'طالب نشط',
          gender: 'Male',
          age: 24,
          phone_number: '+21655667788',
          occupation: 'طالب جامعي',
          city: 'نابل',
          memorized_ahzab: [1, 2, 3, 4, 5],
          tajweed_level: 'Intermediate',
          studied_tajweed_theory: true,
          studied_qalun: false,
          fee_agreement: true,
          program_goal: 'Memorization',
        });

      expect(res.status).toBe(HttpStatus.CONFLICT);
      expect(res.body.error).toBe('DUPLICATE_JOIN_REQUEST');
    });
  });

  describe('Validation & domain rule failures (422)', () => {
    it('rejects with 422 when fewer than 5 ahzab are provided (VR-04a)', async () => {
      const user = await registerAndLogin(
        `user-4ahzab-${uuidv7()}@test-submit-join-request.com`,
        UserRole.User,
      );
      const group = await createTestGroup();

      const res = await request(app.getHttpServer())
        .post('/api/v1/join-requests')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          group_id: group.id,
          full_name: 'قيس سعيد',
          gender: 'Male',
          age: 35,
          phone_number: '+21699887766',
          occupation: 'محاسب',
          city: 'تونس',
          memorized_ahzab: [1, 2, 3, 4], // 4 ahzab only
          tajweed_level: 'Beginner',
          studied_tajweed_theory: false,
          studied_qalun: false,
          fee_agreement: true,
          program_goal: 'Memorization',
        });

      expect(res.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(res.body.details).toContainEqual(
        expect.objectContaining({
          field: 'memorized_ahzab',
          rule: 'VR-04a',
        }),
      );
    });

    it('rejects with 422 when fee_agreement is false (VR-06)', async () => {
      const user = await registerAndLogin(
        `user-nofee-${uuidv7()}@test-submit-join-request.com`,
        UserRole.User,
      );
      const group = await createTestGroup();

      const res = await request(app.getHttpServer())
        .post('/api/v1/join-requests')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          group_id: group.id,
          full_name: 'قيس سعيد',
          gender: 'Male',
          age: 35,
          phone_number: '+21699887766',
          occupation: 'محاسب',
          city: 'تونس',
          memorized_ahzab: [1, 2, 3, 4, 5],
          tajweed_level: 'Beginner',
          studied_tajweed_theory: false,
          studied_qalun: false,
          fee_agreement: false, // rejected fee
          program_goal: 'Memorization',
        });

      expect(res.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(res.body.details).toContainEqual(
        expect.objectContaining({
          field: 'fee_agreement',
          rule: 'VR-06',
        }),
      );
    });

    it('rejects with 422 when program_goal is Revision (VR-07)', async () => {
      const user = await registerAndLogin(
        `user-revision-${uuidv7()}@test-submit-join-request.com`,
        UserRole.User,
      );
      const group = await createTestGroup();

      const res = await request(app.getHttpServer())
        .post('/api/v1/join-requests')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          group_id: group.id,
          full_name: 'قيس سعيد',
          gender: 'Male',
          age: 35,
          phone_number: '+21699887766',
          occupation: 'محاسب',
          city: 'تونس',
          memorized_ahzab: [1, 2, 3, 4, 5],
          tajweed_level: 'Beginner',
          studied_tajweed_theory: false,
          studied_qalun: false,
          fee_agreement: true,
          program_goal: 'Revision', // Revision only
        });

      expect(res.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(res.body.details).toContainEqual(
        expect.objectContaining({
          field: 'program_goal',
          rule: 'VR-07',
        }),
      );
    });

    it('rejects with 422 when gender does not match target group gender (VR-08)', async () => {
      const user = await registerAndLogin(
        `user-gendermismatch-${uuidv7()}@test-submit-join-request.com`,
        UserRole.User,
      );
      const femaleGroup = await createTestGroup({ gender: 'Female' });

      const res = await request(app.getHttpServer())
        .post('/api/v1/join-requests')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          group_id: femaleGroup.id,
          full_name: 'صالح التونسي',
          gender: 'Male', // male trying to apply to female group
          age: 30,
          phone_number: '+21699887766',
          occupation: 'محاسب',
          city: 'تونس',
          memorized_ahzab: [1, 2, 3, 4, 5],
          tajweed_level: 'Beginner',
          studied_tajweed_theory: false,
          studied_qalun: false,
          fee_agreement: true,
          program_goal: 'Memorization',
        });

      expect(res.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(res.body.details).toContainEqual(
        expect.objectContaining({
          field: 'gender',
          rule: 'VR-08',
        }),
      );
    });
  });

  describe('Concurrency & Race Condition Guard (DB-UQ-03)', () => {
    it('resolves concurrent submissions from the same user to exactly one 201 and one 409', async () => {
      const user = await registerAndLogin(
        `user-race-${uuidv7()}@test-submit-join-request.com`,
        UserRole.User,
      );
      const group = await createTestGroup();

      const payload = {
        group_id: group.id,
        full_name: 'طارق ذياب',
        gender: 'Male',
        age: 27,
        phone_number: '+21620123987',
        occupation: 'مدرب',
        city: 'تونس',
        memorized_ahzab: [1, 2, 3, 4, 5, 6],
        tajweed_level: 'Intermediate',
        studied_tajweed_theory: true,
        studied_qalun: false,
        fee_agreement: true,
        program_goal: 'Memorization',
      };

      // Fire two simultaneous requests
      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/join-requests')
          .set('Authorization', `Bearer ${user.accessToken}`)
          .send(payload),
        request(app.getHttpServer())
          .post('/api/v1/join-requests')
          .set('Authorization', `Bearer ${user.accessToken}`)
          .send(payload),
      ]);

      const statusCodes = [res1.status, res2.status].sort();
      expect(statusCodes).toEqual([HttpStatus.CREATED, HttpStatus.CONFLICT]);

      // Exactly 1 row in DB for this user
      const dbRows = await dataSource.query(
        `SELECT id, status FROM join_requests WHERE user_id = $1 AND status = 'Pending'`,
        [user.userId],
      );
      expect(dbRows).toHaveLength(1);
    });
  });
});
