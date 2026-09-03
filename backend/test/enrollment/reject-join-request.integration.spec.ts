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
import { HIZB_BOUNDARIES_DATA } from '../../seed/quran/hizb_boundaries.data';
import { SURAHS_DATA } from '../../seed/quran/surahs.data';
import {
  purgeNotificationLog,
  stopScheduledJobs,
} from '../shared/scheduled-jobs';

describe('POST /join-requests/{id}/reject (F-ENR-06 / API-024 Integration)', () => {
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

    // Ensure reference tables exist
    await seedReferenceData();
    await cleanDatabase();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await cleanDatabase();
    }
    await app.close();
  });

  async function seedReferenceData() {
    for (const s of SURAHS_DATA) {
      await dataSource.query(
        `INSERT INTO "surahs" ("number", "name_ar", "ayah_count", "ordinal_offset")
         VALUES ($1, $2, $3, $4)
         ON CONFLICT ("number") DO NOTHING`,
        [s.number, s.name_ar, s.ayah_count, s.ordinal_offset],
      );
    }

    for (const h of HIZB_BOUNDARIES_DATA) {
      await dataSource.query(
        `INSERT INTO "hizb_boundaries" ("hizb_number", "start_ordinal", "end_ordinal", "start_surah", "start_ayah", "end_surah", "end_ayah")
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT ("hizb_number") DO NOTHING`,
        [
          h.hizb_number,
          h.start_ordinal,
          h.end_ordinal,
          h.start_surah,
          h.start_ayah,
          h.end_surah,
          h.end_ayah,
        ],
      );
    }
  }

  async function cleanDatabase() {
    await purgeNotificationLog(dataSource);
    await dataSource.query(`
      DELETE FROM coverage_intervals WHERE coverage_id IN (
        SELECT id FROM memorization_coverage WHERE membership_id IN (
          SELECT id FROM memberships WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-reject.com')
            OR group_id IN (SELECT id FROM groups WHERE name LIKE '%طابور الرفض%')
        )
      );
    `);
    await dataSource.query(`
      DELETE FROM memorization_coverage WHERE membership_id IN (
        SELECT id FROM memberships WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-reject.com')
          OR group_id IN (SELECT id FROM groups WHERE name LIKE '%طابور الرفض%')
      );
    `);
    await dataSource.query(`
      DELETE FROM memberships WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-reject.com')
        OR group_id IN (SELECT id FROM groups WHERE name LIKE '%طابور الرفض%');
    `);
    await dataSource.query(`
      DELETE FROM join_request_ahzab WHERE join_request_id IN (
        SELECT id FROM join_requests WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-reject.com')
          OR group_id IN (SELECT id FROM groups WHERE name LIKE '%طابور الرفض%')
      );
    `);
    await dataSource.query(`
      DELETE FROM join_requests WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-reject.com')
        OR group_id IN (SELECT id FROM groups WHERE name LIKE '%طابور الرفض%');
    `);
    await dataSource.query(`
      DELETE FROM groups WHERE name LIKE '%طابور الرفض%'
        OR teacher_id IN (SELECT id FROM users WHERE email LIKE '%@test-reject.com')
        OR assistant_id IN (SELECT id FROM users WHERE email LIKE '%@test-reject.com');
    `);
    await dataSource.query(`
      DELETE FROM audit_entries WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@test-reject.com');
    `);
    await dataSource.query(`
      DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-reject.com');
    `);
    await dataSource.query(`
      DELETE FROM users WHERE email LIKE '%@test-reject.com';
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

  async function createGroup(
    teacherId: string,
    assistantId: string,
    name: string,
    gender: 'Male' | 'Female' = 'Male',
  ): Promise<string> {
    const groupId = uuidv7();
    await dataSource.query(
      `INSERT INTO groups (id, name, gender, recitation_day, enrollment_status, lifecycle_state, teacher_id, assistant_id, created_by)
       VALUES ($1, $2, $3, 5, 'Open', 'Active', $4, $5, $6)`,
      [groupId, name, gender, teacherId, assistantId, teacherId],
    );
    return groupId;
  }

  async function createJoinRequest(
    userId: string,
    groupId: string,
    props: {
      fullName?: string;
      gender?: 'Male' | 'Female';
      memorizedAhzab?: number[];
      status?: 'Pending' | 'Accepted' | 'Rejected';
    } = {},
  ): Promise<string> {
    const id = uuidv7();
    const fullName = props.fullName ?? 'متقدم تجريبي للرفض';
    const gender = props.gender ?? 'Male';
    const ahzab = props.memorizedAhzab ?? [1, 2, 3, 4, 5, 6, 7, 8];
    const status = props.status ?? 'Pending';

    await dataSource.query(
      `INSERT INTO join_requests (
        id, user_id, group_id, full_name, gender, age, phone_number,
        occupation, city, memorized_hizb_count, tajweed_level,
        studied_tajweed_theory, studied_qalun, fee_agreement,
        program_goal, score, status
      ) VALUES ($1, $2, $3, $4, $5, 25, '+21698123456', 'مهندس', 'تونس', $6, 'Intermediate', true, true, true, 'Memorization', 87.5, $7)`,
      [id, userId, groupId, fullName, gender, ahzab.length, status],
    );

    for (const h of ahzab) {
      await dataSource.query(
        `INSERT INTO join_request_ahzab (join_request_id, hizb_number) VALUES ($1, $2)`,
        [id, h],
      );
    }

    return id;
  }

  describe('Happy path (API-024 / FR-REQ-06)', () => {
    it('successfully rejects pending join request without creating membership or promoting role', async () => {
      const teacher = await registerAndLogin(
        'teacher-hp@test-reject.com',
        UserRole.Teacher,
        'الشيخ علي',
        'Male',
      );
      const assistant = await registerAndLogin(
        'assistant-hp@test-reject.com',
        UserRole.Assistant,
        'المساعد بلال',
        'Male',
      );
      const applicant = await registerAndLogin('applicant-hp@test-reject.com');

      const groupId = await createGroup(
        teacher.userId,
        assistant.userId,
        'حلقة طابور الرفض الأولى',
        'Male',
      );

      const requestId = await createJoinRequest(applicant.userId, groupId, {
        fullName: 'أحمد المرفوض',
        gender: 'Male',
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/join-requests/${requestId}/reject`)
        .set('Authorization', `Bearer ${assistant.accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body).toEqual({
        data: {
          status: 'Rejected',
        },
      });

      // 1. Assert join request status updated to Rejected
      const jrRows = await dataSource.query(
        'SELECT id, status, reviewed_by, reviewed_at, resolution_source FROM join_requests WHERE id = $1',
        [requestId],
      );
      expect(jrRows).toHaveLength(1);
      expect(jrRows[0].status).toBe('Rejected');
      expect(jrRows[0].reviewed_by).toBe(assistant.userId);
      expect(jrRows[0].reviewed_at).toBeTruthy();
      expect(jrRows[0].resolution_source).toBe('manual');

      // 2. Assert NO membership was created
      const membershipRows = await dataSource.query(
        'SELECT * FROM memberships WHERE join_request_id = $1',
        [requestId],
      );
      expect(membershipRows).toHaveLength(0);

      // 3. Assert applicant user role remained User (NOT promoted to Student)
      const userRows = await dataSource.query(
        'SELECT id, role FROM users WHERE id = $1',
        [applicant.userId],
      );
      expect(userRows).toHaveLength(1);
      expect(userRows[0].role).toBe(UserRole.User);
    });

    it('refuses the Admin — APIS §6.1 gives the Admin `—` on `accept|reject`, and SRS §10 grants it `R` on Join Request but never `A`', async () => {
      const teacher = await registerAndLogin(
        'teacher-admin@test-reject.com',
        UserRole.Teacher,
        'الشيخ علي',
        'Male',
      );
      const assistant = await registerAndLogin(
        'assistant-admin@test-reject.com',
        UserRole.Assistant,
        'المساعد بلال',
        'Male',
      );
      const applicant = await registerAndLogin(
        'applicant-admin@test-reject.com',
      );
      const admin = await registerAndLogin(
        'admin-reject@test-reject.com',
        UserRole.Admin,
      );

      const groupId = await createGroup(
        teacher.userId,
        assistant.userId,
        'حلقة طابور الرفض للإدارة',
        'Male',
      );

      const requestId = await createJoinRequest(applicant.userId, groupId);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/join-requests/${requestId}/reject`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);

      expect(res.body.error).toBe('SCOPE_DENIED');

      // The decision is untouched: the Admin reads the queue, the assigned
      // Assistant decides it (FR-REQ-04, UC-04).
      const jrRows = await dataSource.query(
        'SELECT status, reviewed_by FROM join_requests WHERE id = $1',
        [requestId],
      );
      expect(jrRows[0].status).toBe('Pending');
      expect(jrRows[0].reviewed_by).toBeNull();
    });
  });

  describe('Concurrency Protection (0-row conditional update)', () => {
    it('fires near-simultaneous rejects and asserts exactly one succeeds (200) and one receives 409 ALREADY_DECIDED', async () => {
      const teacher = await registerAndLogin(
        'teacher-conc@test-reject.com',
        UserRole.Teacher,
        'الشيخ علي',
        'Male',
      );
      const assistant1 = await registerAndLogin(
        'assistant-conc1@test-reject.com',
        UserRole.Assistant,
        'مساعد 1',
        'Male',
      );
      const applicant = await registerAndLogin(
        'applicant-conc@test-reject.com',
      );

      const groupId = await createGroup(
        teacher.userId,
        assistant1.userId,
        'حلقة طابور الرفض التنافسي',
        'Male',
      );

      const requestId = await createJoinRequest(applicant.userId, groupId);

      // APIS §9.7 frames this race as two Assistants, and §6.1 excludes the
      // Admin from `accept|reject`, so both racers are the assigned
      // Assistant on two sessions: the 0-row conditional UPDATE settles it.
      const secondSession = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'assistant-conc1@test-reject.com',
          password: 'Password123!',
        })
        .expect(HttpStatus.OK);
      const secondToken = (secondSession.body as { access_token: string })
        .access_token;

      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/join-requests/${requestId}/reject`)
          .set('Authorization', `Bearer ${assistant1.accessToken}`),
        request(app.getHttpServer())
          .post(`/api/v1/join-requests/${requestId}/reject`)
          .set('Authorization', `Bearer ${secondToken}`),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([HttpStatus.OK, HttpStatus.CONFLICT]);

      const conflictRes =
        res1.status === Number(HttpStatus.CONFLICT) ? res1 : res2;
      expect(conflictRes.body.error).toBe('ALREADY_DECIDED');
    });
  });

  describe('Conflict Errors (409)', () => {
    it('returns 409 ALREADY_DECIDED when join request is already Accepted', async () => {
      const teacher = await registerAndLogin(
        'teacher-acc@test-reject.com',
        UserRole.Teacher,
      );
      const assistant = await registerAndLogin(
        'assistant-acc@test-reject.com',
        UserRole.Assistant,
      );
      const applicant = await registerAndLogin('applicant-acc@test-reject.com');

      const groupId = await createGroup(
        teacher.userId,
        assistant.userId,
        'حلقة طابور الرفض بعد القبول',
      );

      const requestId = await createJoinRequest(applicant.userId, groupId, {
        status: 'Accepted',
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/join-requests/${requestId}/reject`)
        .set('Authorization', `Bearer ${assistant.accessToken}`)
        .expect(HttpStatus.CONFLICT);

      expect(res.body.error).toBe('ALREADY_DECIDED');
    });

    it('returns 409 ALREADY_DECIDED when join request is already Rejected', async () => {
      const teacher = await registerAndLogin(
        'teacher-rej@test-reject.com',
        UserRole.Teacher,
      );
      const assistant = await registerAndLogin(
        'assistant-rej@test-reject.com',
        UserRole.Assistant,
      );
      const applicant = await registerAndLogin('applicant-rej@test-reject.com');

      const groupId = await createGroup(
        teacher.userId,
        assistant.userId,
        'حلقة طابور الرفض المكرر',
      );

      const requestId = await createJoinRequest(applicant.userId, groupId, {
        status: 'Rejected',
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/join-requests/${requestId}/reject`)
        .set('Authorization', `Bearer ${assistant.accessToken}`)
        .expect(HttpStatus.CONFLICT);

      expect(res.body.error).toBe('ALREADY_DECIDED');
    });
  });

  describe('Authorization & Uniform 403 (NFR-20 / APIQ-04)', () => {
    it('returns 403 for non-existent join request ID', async () => {
      const assistant = await registerAndLogin(
        'assistant-ne@test-reject.com',
        UserRole.Assistant,
      );

      await request(app.getHttpServer())
        .post(`/api/v1/join-requests/${uuidv7()}/reject`)
        .set('Authorization', `Bearer ${assistant.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('returns 403 when Assistant belongs to a different group', async () => {
      const teacher = await registerAndLogin(
        'teacher-diff@test-reject.com',
        UserRole.Teacher,
      );
      const assistant1 = await registerAndLogin(
        'assistant-diff1@test-reject.com',
        UserRole.Assistant,
      );
      const assistant2 = await registerAndLogin(
        'assistant-diff2@test-reject.com',
        UserRole.Assistant,
      );
      const applicant = await registerAndLogin(
        'applicant-diff@test-reject.com',
      );

      const groupId = await createGroup(
        teacher.userId,
        assistant1.userId,
        'حلقة طابور الرفض للمساعد الأول',
      );

      const requestId = await createJoinRequest(applicant.userId, groupId);

      // Assistant2 tries to reject Assistant1's group request
      await request(app.getHttpServer())
        .post(`/api/v1/join-requests/${requestId}/reject`)
        .set('Authorization', `Bearer ${assistant2.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it.each([
      ['Teacher', UserRole.Teacher],
      ['Student', UserRole.Student],
      ['User', UserRole.User],
    ])('rejects role %s with 403 Forbidden', async (roleName, role) => {
      const caller = await registerAndLogin(
        `caller-${roleName.toLowerCase()}@test-reject.com`,
        role,
      );
      const teacher = await registerAndLogin(
        `teacher-rbac-${roleName.toLowerCase()}@test-reject.com`,
        UserRole.Teacher,
      );
      const assistant = await registerAndLogin(
        `ast-rbac-${roleName.toLowerCase()}@test-reject.com`,
        UserRole.Assistant,
      );
      const applicant = await registerAndLogin(
        `applicant-rbac-${roleName.toLowerCase()}@test-reject.com`,
      );

      const groupId = await createGroup(
        teacher.userId,
        assistant.userId,
        `حلقة الرفض ${roleName}`,
      );
      const requestId = await createJoinRequest(applicant.userId, groupId);

      await request(app.getHttpServer())
        .post(`/api/v1/join-requests/${requestId}/reject`)
        .set('Authorization', `Bearer ${caller.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('rejects unauthenticated caller with 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/join-requests/${uuidv7()}/reject`)
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });
});
