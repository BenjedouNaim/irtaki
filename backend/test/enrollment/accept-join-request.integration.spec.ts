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

describe('POST /join-requests/{id}/accept (F-ENR-05 / API-023 Integration)', () => {
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
    await dataSource.query(`
      DELETE FROM coverage_intervals WHERE coverage_id IN (
        SELECT id FROM memorization_coverage WHERE membership_id IN (
          SELECT id FROM memberships WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-accept.com')
            OR group_id IN (SELECT id FROM groups WHERE name LIKE '%طابور القبول%')
        )
      );
    `);
    await dataSource.query(`
      DELETE FROM memorization_coverage WHERE membership_id IN (
        SELECT id FROM memberships WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-accept.com')
          OR group_id IN (SELECT id FROM groups WHERE name LIKE '%طابور القبول%')
      );
    `);
    await dataSource.query(`
      DELETE FROM memberships WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-accept.com')
        OR group_id IN (SELECT id FROM groups WHERE name LIKE '%طابور القبول%');
    `);
    await dataSource.query(`
      DELETE FROM join_request_ahzab WHERE join_request_id IN (
        SELECT id FROM join_requests WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-accept.com')
          OR group_id IN (SELECT id FROM groups WHERE name LIKE '%طابور القبول%')
      );
    `);
    await dataSource.query(`
      DELETE FROM join_requests WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-accept.com')
        OR group_id IN (SELECT id FROM groups WHERE name LIKE '%طابور القبول%');
    `);
    await dataSource.query(`
      DELETE FROM groups WHERE name LIKE '%طابور القبول%'
        OR teacher_id IN (SELECT id FROM users WHERE email LIKE '%@test-accept.com')
        OR assistant_id IN (SELECT id FROM users WHERE email LIKE '%@test-accept.com');
    `);
    await dataSource.query(`
      DELETE FROM audit_entries WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@test-accept.com');
    `);
    await dataSource.query(`
      DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-accept.com');
    `);
    await dataSource.query(`
      DELETE FROM users WHERE email LIKE '%@test-accept.com';
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
    const fullName = props.fullName ?? 'متقدم تجريبي للقبول';
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

  describe('Happy path (API-023 / DS-01 / AR-04)', () => {
    it('atomically accepts join request, promotes User to Student, creates Membership and seeds Coverage', async () => {
      const teacher = await registerAndLogin(
        'teacher-hp@test-accept.com',
        UserRole.Teacher,
        'الشيخ علي',
        'Male',
      );
      const assistant = await registerAndLogin(
        'assistant-hp@test-accept.com',
        UserRole.Assistant,
        'المساعد بلال',
        'Male',
      );
      const applicant = await registerAndLogin('applicant-hp@test-accept.com');

      const groupId = await createGroup(
        teacher.userId,
        assistant.userId,
        'حلقة طابور القبول الأولى',
        'Male',
      );

      const memorizedAhzab = [1, 2, 3, 4, 5, 6, 7, 8];
      const requestId = await createJoinRequest(applicant.userId, groupId, {
        fullName: 'أحمد التونسي',
        gender: 'Male',
        memorizedAhzab,
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/join-requests/${requestId}/accept`)
        .set('Authorization', `Bearer ${assistant.accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body).toHaveProperty('data.membership_id');
      const membershipId = res.body.data.membership_id;
      expect(typeof membershipId).toBe('string');

      // 1. Assert membership created
      const membershipRows = await dataSource.query(
        'SELECT * FROM memberships WHERE id = $1',
        [membershipId],
      );
      expect(membershipRows).toHaveLength(1);
      const membership = membershipRows[0];
      expect(membership.user_id).toBe(applicant.userId);
      expect(membership.group_id).toBe(groupId);
      expect(membership.join_request_id).toBe(requestId);
      expect(membership.state).toBe('Active');
      expect(membership.ended_at).toBeNull();
      expect(membership.ended_by).toBeNull();

      // 2. Assert user role promoted to Student with name & gender
      const userRows = await dataSource.query(
        'SELECT id, role, full_name, gender FROM users WHERE id = $1',
        [applicant.userId],
      );
      expect(userRows).toHaveLength(1);
      expect(userRows[0].role).toBe('Student');
      expect(userRows[0].full_name).toBe('أحمد التونسي');
      expect(userRows[0].gender).toBe('Male');

      // 3. Assert join request status updated to Accepted
      const jrRows = await dataSource.query(
        'SELECT id, status, reviewed_by, reviewed_at, resolution_source FROM join_requests WHERE id = $1',
        [requestId],
      );
      expect(jrRows).toHaveLength(1);
      expect(jrRows[0].status).toBe('Accepted');
      expect(jrRows[0].reviewed_by).toBe(assistant.userId);
      expect(jrRows[0].reviewed_at).toBeTruthy();
      expect(jrRows[0].resolution_source).toBe('manual');

      // 4. Assert memorization coverage row exists with ahzab_completed = 8
      const coverageRows = await dataSource.query(
        'SELECT * FROM memorization_coverage WHERE membership_id = $1',
        [membershipId],
      );
      expect(coverageRows).toHaveLength(1);
      const coverage = coverageRows[0];
      expect(coverage.ahzab_completed).toBe(8);

      // 5. Assert coverage intervals match hizb boundaries
      const intervalRows: Array<{
        start_ordinal: number;
        end_ordinal: number;
      }> = await dataSource.query(
        'SELECT * FROM coverage_intervals WHERE coverage_id = $1 ORDER BY start_ordinal ASC',
        [coverage.id],
      );
      expect(intervalRows).toHaveLength(8);

      const expectedBoundaries: Array<{
        start_ordinal: number;
        end_ordinal: number;
      }> = await dataSource.query(
        'SELECT start_ordinal, end_ordinal FROM hizb_boundaries WHERE hizb_number BETWEEN 1 AND 8 ORDER BY hizb_number ASC',
      );
      expect(
        intervalRows.map((i) => ({
          start_ordinal: i.start_ordinal,
          end_ordinal: i.end_ordinal,
        })),
      ).toEqual(
        expectedBoundaries.map((b) => ({
          start_ordinal: b.start_ordinal,
          end_ordinal: b.end_ordinal,
        })),
      );
    });
  });

  describe('Concurrency Protection (0-row conditional update)', () => {
    it('fires near-simultaneous accepts and asserts exactly one succeeds (200) and one receives 409 ALREADY_DECIDED', async () => {
      const teacher = await registerAndLogin(
        'teacher-conc@test-accept.com',
        UserRole.Teacher,
        'الشيخ علي',
        'Male',
      );
      const assistant1 = await registerAndLogin(
        'assistant-conc1@test-accept.com',
        UserRole.Assistant,
        'مساعد 1',
        'Male',
      );
      const applicant = await registerAndLogin(
        'applicant-conc@test-accept.com',
      );

      const groupId = await createGroup(
        teacher.userId,
        assistant1.userId,
        'حلقة طابور القبول التنافسي',
        'Male',
      );

      const requestId = await createJoinRequest(applicant.userId, groupId, {
        fullName: 'طالب تنافسي',
        gender: 'Male',
      });

      // Admin + Assistant1 both call accept at the same instant
      const admin = await registerAndLogin(
        'admin-conc@test-accept.com',
        UserRole.Admin,
      );

      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/join-requests/${requestId}/accept`)
          .set('Authorization', `Bearer ${assistant1.accessToken}`),
        request(app.getHttpServer())
          .post(`/api/v1/join-requests/${requestId}/accept`)
          .set('Authorization', `Bearer ${admin.accessToken}`),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([HttpStatus.OK, HttpStatus.CONFLICT]);

      const conflictRes =
        res1.status === Number(HttpStatus.CONFLICT) ? res1 : res2;
      expect(conflictRes.body.error).toBe('ALREADY_DECIDED');

      // Exactly one membership row created
      const memberships = await dataSource.query(
        'SELECT * FROM memberships WHERE join_request_id = $1',
        [requestId],
      );
      expect(memberships).toHaveLength(1);
    });
  });

  describe('Conflict Errors (409)', () => {
    it('returns 409 ALREADY_DECIDED when join request is already Accepted', async () => {
      const teacher = await registerAndLogin(
        'teacher-dec@test-accept.com',
        UserRole.Teacher,
      );
      const assistant = await registerAndLogin(
        'assistant-dec@test-accept.com',
        UserRole.Assistant,
      );
      const applicant = await registerAndLogin('applicant-dec@test-accept.com');

      const groupId = await createGroup(
        teacher.userId,
        assistant.userId,
        'حلقة طابور القبول المحسوم',
      );

      const requestId = await createJoinRequest(applicant.userId, groupId, {
        status: 'Accepted',
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/join-requests/${requestId}/accept`)
        .set('Authorization', `Bearer ${assistant.accessToken}`)
        .expect(HttpStatus.CONFLICT);

      expect(res.body.error).toBe('ALREADY_DECIDED');
    });

    it('returns 409 APPLICANT_NO_LONGER_ELIGIBLE when applicant already has an active membership (DB-UQ-02)', async () => {
      const teacher = await registerAndLogin(
        'teacher-el@test-accept.com',
        UserRole.Teacher,
      );
      const assistant = await registerAndLogin(
        'assistant-el@test-accept.com',
        UserRole.Assistant,
      );
      const applicant = await registerAndLogin('applicant-el@test-accept.com');

      const group1 = await createGroup(
        teacher.userId,
        assistant.userId,
        'حلقة طابور القبول الأولى للأهلية',
      );
      const group2 = await createGroup(
        teacher.userId,
        assistant.userId,
        'حلقة طابور القبول الثانية للأهلية',
      );

      // Create existing active membership for this applicant in group1
      const existingMemId = uuidv7();
      await dataSource.query(
        `INSERT INTO memberships (id, user_id, group_id, state, started_at)
         VALUES ($1, $2, $3, 'Active', '2026-08-01')`,
        [existingMemId, applicant.userId, group1],
      );

      // Create a pending join request in group2
      const requestId = await createJoinRequest(applicant.userId, group2);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/join-requests/${requestId}/accept`)
        .set('Authorization', `Bearer ${assistant.accessToken}`)
        .expect(HttpStatus.CONFLICT);

      expect(res.body.error).toBe('APPLICANT_NO_LONGER_ELIGIBLE');
    });
  });

  describe('Authorization & Uniform 403 (NFR-20 / APIQ-04)', () => {
    it('returns 403 for non-existent join request ID', async () => {
      const assistant = await registerAndLogin(
        'assistant-ne@test-accept.com',
        UserRole.Assistant,
      );

      await request(app.getHttpServer())
        .post(`/api/v1/join-requests/${uuidv7()}/accept`)
        .set('Authorization', `Bearer ${assistant.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('returns 403 when Assistant belongs to a different group', async () => {
      const teacher = await registerAndLogin(
        'teacher-diff@test-accept.com',
        UserRole.Teacher,
      );
      const assistant1 = await registerAndLogin(
        'assistant-diff1@test-accept.com',
        UserRole.Assistant,
      );
      const assistant2 = await registerAndLogin(
        'assistant-diff2@test-accept.com',
        UserRole.Assistant,
      );
      const applicant = await registerAndLogin(
        'applicant-diff@test-accept.com',
      );

      const groupId = await createGroup(
        teacher.userId,
        assistant1.userId,
        'حلقة طابور القبول للمساعد الأول',
      );

      const requestId = await createJoinRequest(applicant.userId, groupId);

      // Assistant2 tries to accept Assistant1's group request
      await request(app.getHttpServer())
        .post(`/api/v1/join-requests/${requestId}/accept`)
        .set('Authorization', `Bearer ${assistant2.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it.each([
      ['Teacher', UserRole.Teacher],
      ['Student', UserRole.Student],
      ['User', UserRole.User],
    ])('rejects role %s with 403 Forbidden', async (roleName, role) => {
      const caller = await registerAndLogin(
        `caller-${roleName.toLowerCase()}@test-accept.com`,
        role,
      );
      const teacher = await registerAndLogin(
        `teacher-rbac-${roleName.toLowerCase()}@test-accept.com`,
        UserRole.Teacher,
      );
      const assistant = await registerAndLogin(
        `ast-rbac-${roleName.toLowerCase()}@test-accept.com`,
        UserRole.Assistant,
      );
      const applicant = await registerAndLogin(
        `applicant-rbac-${roleName.toLowerCase()}@test-accept.com`,
      );

      const groupId = await createGroup(
        teacher.userId,
        assistant.userId,
        `حلقة القبول ${roleName}`,
      );
      const requestId = await createJoinRequest(applicant.userId, groupId);

      await request(app.getHttpServer())
        .post(`/api/v1/join-requests/${requestId}/accept`)
        .set('Authorization', `Bearer ${caller.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('rejects unauthenticated caller with 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/join-requests/${uuidv7()}/accept`)
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });
});
