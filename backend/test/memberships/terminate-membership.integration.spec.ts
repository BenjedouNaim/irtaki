/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import { AppModule } from '../../src/app.module';
import {
  IMailer,
  MAILER,
} from '../../src/modules/identity/domain/mailer.interface';
import {
  PASSWORD_HASHER,
  IPasswordHasher,
} from '../../src/modules/identity/domain/password-hasher.interface';
import { UserRole } from '../../src/modules/identity/domain/user-role.enum';

interface TestActor {
  accessToken: string;
  userId: string;
}

describe('DELETE /memberships/:id (F-MEM-03 / API-027 Integration)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const testEmailDomain = '@test-terminate.com';
  const testGroupPrefix = 'F-MEM-03 test group';

  const STARTED = '2026-01-01';
  const TODAY = new Date().toISOString().split('T')[0];

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

  async function cleanDatabase(): Promise<void> {
    // Child-first ordering; scope limited to this file's email/group tags
    await dataSource.query(
      `DELETE FROM coverage_intervals WHERE coverage_id IN (
         SELECT id FROM memorization_coverage WHERE membership_id IN (
           SELECT id FROM memberships
           WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)
              OR group_id IN (SELECT id FROM groups WHERE name LIKE $2)
         )
       )`,
      [`%${testEmailDomain}`, `${testGroupPrefix}%`],
    );
    await dataSource.query(
      `DELETE FROM memorization_coverage WHERE membership_id IN (
         SELECT id FROM memberships
         WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)
            OR group_id IN (SELECT id FROM groups WHERE name LIKE $2)
       )`,
      [`%${testEmailDomain}`, `${testGroupPrefix}%`],
    );
    await dataSource.query(
      `DELETE FROM daily_reports WHERE membership_id IN (
         SELECT id FROM memberships
         WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)
            OR group_id IN (SELECT id FROM groups WHERE name LIKE $2)
       )`,
      [`%${testEmailDomain}`, `${testGroupPrefix}%`],
    );
    await dataSource.query(
      `DELETE FROM weekly_reports WHERE membership_id IN (
         SELECT id FROM memberships
         WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)
            OR group_id IN (SELECT id FROM groups WHERE name LIKE $2)
       )`,
      [`%${testEmailDomain}`, `${testGroupPrefix}%`],
    );
    await dataSource.query(
      `DELETE FROM payment_records WHERE membership_id IN (
         SELECT id FROM memberships
         WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)
            OR group_id IN (SELECT id FROM groups WHERE name LIKE $2)
       )`,
      [`%${testEmailDomain}`, `${testGroupPrefix}%`],
    );
    await dataSource.query(
      `DELETE FROM memberships
       WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)
          OR group_id IN (SELECT id FROM groups WHERE name LIKE $2)`,
      [`%${testEmailDomain}`, `${testGroupPrefix}%`],
    );
    await dataSource.query(
      `DELETE FROM join_request_ahzab WHERE join_request_id IN (
         SELECT id FROM join_requests
         WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)
            OR group_id IN (SELECT id FROM groups WHERE name LIKE $2)
       )`,
      [`%${testEmailDomain}`, `${testGroupPrefix}%`],
    );
    await dataSource.query(
      `DELETE FROM join_requests
       WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)
          OR group_id IN (SELECT id FROM groups WHERE name LIKE $2)`,
      [`%${testEmailDomain}`, `${testGroupPrefix}%`],
    );
    await dataSource.query(
      `DELETE FROM groups
       WHERE name LIKE $1
          OR teacher_id IN (SELECT id FROM users WHERE email LIKE $2)
          OR assistant_id IN (SELECT id FROM users WHERE email LIKE $2)
          OR created_by IN (SELECT id FROM users WHERE email LIKE $2)`,
      [`${testGroupPrefix}%`, `%${testEmailDomain}`],
    );
    await dataSource.query(
      'DELETE FROM audit_entries WHERE actor_id IN (SELECT id FROM users WHERE email LIKE $1)',
      [`%${testEmailDomain}`],
    );
    await dataSource.query(
      'DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)',
      [`%${testEmailDomain}`],
    );
    await dataSource.query('DELETE FROM users WHERE email LIKE $1', [
      `%${testEmailDomain}`,
    ]);
  }

  async function registerAndLogin(
    role: UserRole,
    options?: { fullName?: string | null; gender?: 'Male' | 'Female' | null },
  ): Promise<TestActor> {
    const email = `${role.toLowerCase()}-${uuidv7()}${testEmailDomain}`;
    const password = 'Password123!';

    // Reuse a single Admin row via the password-reset trick (house pattern)
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
          accessToken: loginRes.body.access_token as string,
          userId: adminId,
        };
      }
    }

    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, timezone: 'Africa/Tunis' })
      .expect(HttpStatus.CREATED);

    const userId = registration.body.id as string;
    await dataSource.query(
      'UPDATE users SET role = $1, full_name = $2, gender = $3 WHERE id = $4',
      [
        role,
        options?.fullName ?? `${role} test user`,
        options?.gender ?? 'Male',
        userId,
      ],
    );

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(HttpStatus.OK);

    return {
      accessToken: login.body.access_token as string,
      userId,
    };
  }

  async function seedStaff(): Promise<{
    teacher: TestActor;
    assistant: TestActor;
  }> {
    const teacher = await registerAndLogin(UserRole.Teacher);
    const assistant = await registerAndLogin(UserRole.Assistant);
    return { teacher, assistant };
  }

  async function seedGroup(params: {
    teacherId: string;
    assistantId: string;
    createdBy: string;
  }): Promise<string> {
    const groupId = uuidv7();
    await dataSource.query(
      `INSERT INTO groups (
         id, name, gender, recitation_day, enrollment_status,
         lifecycle_state, teacher_id, assistant_id, created_by,
         created_at, updated_at
       ) VALUES ($1, $2, 'Male', 4, 'Closed', 'Active', $3, $4, $5, now(), now())`,
      [
        groupId,
        `${testGroupPrefix} ${uuidv7()}`,
        params.teacherId,
        params.assistantId,
        params.createdBy,
      ],
    );
    return groupId;
  }

  async function seedMembership(params: {
    userId: string;
    groupId: string;
    state: 'Active' | 'Terminated';
    startedAt: string;
    endedAt?: string | null;
    joinRequestId?: string | null;
  }): Promise<string> {
    const membershipId = uuidv7();
    await dataSource.query(
      `INSERT INTO memberships (
         id, user_id, group_id, join_request_id, state, started_at,
         ended_at, ended_by, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, now(), now())`,
      [
        membershipId,
        params.userId,
        params.groupId,
        params.joinRequestId ?? null,
        params.state,
        params.startedAt,
        params.endedAt ?? null,
      ],
    );
    return membershipId;
  }

  async function seedJoinRequestForMembership(
    userId: string,
    groupId: string,
    reviewedBy: string,
  ): Promise<string> {
    const id = uuidv7();
    // Gender must match the group's gender ('Male') per DB trigger;
    // all NOT NULL/CHECK columns satisfied per migration 1723820003000.
    await dataSource.query(
      `INSERT INTO join_requests (
         id, user_id, group_id, full_name, gender, age, phone_number,
         occupation, city, memorized_hizb_count, tajweed_level,
         studied_tajweed_theory, studied_qalun, fee_agreement,
         program_goal, score, status, resolution_source,
         reviewed_at, reviewed_by
       ) VALUES ($1, $2, $3, 'طالب مُنهى تجريبي', 'Male', 25, '+21698123456',
                 'مهندس', 'تونس', 8, 'Intermediate',
                 true, true, true,
                 'Memorization', 87.5, 'Accepted', 'manual',
                 now(), $4)`,
      [id, userId, groupId, reviewedBy],
    );
    return id;
  }

  async function seedCoverage(membershipId: string): Promise<string> {
    const coverageId = uuidv7();
    await dataSource.query(
      `INSERT INTO memorization_coverage (id, membership_id, ahzab_completed)
       VALUES ($1, $2, 3)`,
      [coverageId, membershipId],
    );
    await dataSource.query(
      `INSERT INTO coverage_intervals (id, coverage_id, start_ordinal, end_ordinal)
       VALUES ($1, $2, 1, 10)`,
      [uuidv7(), coverageId],
    );
    return coverageId;
  }

  async function seedDailyReport(
    membershipId: string,
    reportDate: string,
  ): Promise<void> {
    // Required cols per migration 1723820004000: id, membership_id,
    // report_date, type, submitted_timezone (submitted_at defaults to now()).
    await dataSource.query(
      `INSERT INTO daily_reports (id, membership_id, report_date, type, submitted_timezone)
       VALUES ($1, $2, $3, 'Normal', 'Africa/Tunis')`,
      [uuidv7(), membershipId, reportDate],
    );
  }

  async function seedWeeklyReport(
    membershipId: string,
    weekStart: string,
    weekEnd: string,
  ): Promise<void> {
    // Required cols per migration 1723820005000; state defaults to 'Open',
    // attended_recitation_call defaults to false - both stated explicitly.
    await dataSource.query(
      `INSERT INTO weekly_reports (
         id, membership_id, week_start, week_end, expected_days,
         missed_daily_reports, missed_daily_memorization, missed_daily_revision,
         missed_50_repetitions, missed_single_session,
         attended_recitation_call, state
       ) VALUES ($1, $2, $3, $4, 6, 0, 0, 0, 0, 0, false, 'Open')`,
      [uuidv7(), membershipId, weekStart, weekEnd],
    );
  }

  async function seedPaymentRecord(
    membershipId: string,
    recordedBy: string,
  ): Promise<void> {
    // amount CHECK = 30.00 and cycle_index >= 0 per migration 1723820006000.
    await dataSource.query(
      `INSERT INTO payment_records (id, membership_id, cycle_index, amount, recorded_by)
       VALUES ($1, $2, 0, 30.00, $3)`,
      [uuidv7(), membershipId, recordedBy],
    );
  }

  describe('Admin terminates a student (happy path / UC-12)', () => {
    it('returns 200 with the API-027 envelope and soft-deletes reports/payments/join-request while keeping coverage intervals', async () => {
      const admin = await registerAndLogin(UserRole.Admin);
      const staff = await seedStaff();
      const groupId = await seedGroup({
        teacherId: staff.teacher.userId,
        assistantId: staff.assistant.userId,
        createdBy: admin.userId,
      });

      const student = await registerAndLogin(UserRole.Student);
      const joinRequestId = await seedJoinRequestForMembership(
        student.userId,
        groupId,
        admin.userId,
      );
      const membershipId = await seedMembership({
        userId: student.userId,
        groupId,
        state: 'Active',
        startedAt: STARTED,
        joinRequestId,
      });
      const coverageId = await seedCoverage(membershipId);
      await seedDailyReport(membershipId, '2026-08-19');
      await seedWeeklyReport(membershipId, '2026-08-17', '2026-08-23');
      await seedPaymentRecord(membershipId, admin.userId);

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/memberships/${membershipId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body).toEqual({
        data: { membership_id: membershipId, state: 'Terminated' },
      });

      // Membership row: Terminated + audit fields set
      const memRows: Array<{
        state: string;
        ended_at: string;
        ended_by: string;
      }> = await dataSource.query(
        'SELECT state, ended_at::text AS ended_at, ended_by FROM memberships WHERE id = $1',
        [membershipId],
      );
      expect(memRows).toHaveLength(1);
      expect(memRows[0].state).toBe('Terminated');
      expect(memRows[0].ended_at).toBe(TODAY);
      expect(memRows[0].ended_by).toBe(admin.userId);

      // Former student demoted to plain User
      const userRows: Array<{ role: string }> = await dataSource.query(
        'SELECT role FROM users WHERE id = $1',
        [student.userId],
      );
      expect(userRows[0].role).toBe('User');

      // Cascade soft-delete: exactly one of each record, all soft-deleted
      const cascadeCounts: Array<{
        deleted_daily: string;
        live_daily: string;
        deleted_weekly: string;
        live_weekly: string;
        deleted_payments: string;
        live_payments: string;
      }> = await dataSource.query(
        `SELECT
           (SELECT COUNT(*) FROM daily_reports WHERE membership_id = $1 AND deleted_at IS NOT NULL) AS deleted_daily,
           (SELECT COUNT(*) FROM daily_reports WHERE membership_id = $1 AND deleted_at IS NULL) AS live_daily,
           (SELECT COUNT(*) FROM weekly_reports WHERE membership_id = $1 AND deleted_at IS NOT NULL) AS deleted_weekly,
           (SELECT COUNT(*) FROM weekly_reports WHERE membership_id = $1 AND deleted_at IS NULL) AS live_weekly,
           (SELECT COUNT(*) FROM payment_records WHERE membership_id = $1 AND deleted_at IS NOT NULL) AS deleted_payments,
           (SELECT COUNT(*) FROM payment_records WHERE membership_id = $1 AND deleted_at IS NULL) AS live_payments`,
        [membershipId],
      );
      expect(Number(cascadeCounts[0].deleted_daily)).toBe(1);
      expect(Number(cascadeCounts[0].live_daily)).toBe(0);
      expect(Number(cascadeCounts[0].deleted_weekly)).toBe(1);
      expect(Number(cascadeCounts[0].live_weekly)).toBe(0);
      expect(Number(cascadeCounts[0].deleted_payments)).toBe(1);
      expect(Number(cascadeCounts[0].live_payments)).toBe(0);

      // Join request soft-deleted too
      const jrRows: Array<{ deleted_at: Date | null }> = await dataSource.query(
        'SELECT deleted_at FROM join_requests WHERE id = $1',
        [joinRequestId],
      );
      expect(jrRows).toHaveLength(1);
      expect(jrRows[0].deleted_at).not.toBeNull();

      // Coverage row soft-deleted, but its interval rows physically survive
      const covRows: Array<{ id: string; deleted_at: Date | null }> =
        await dataSource.query(
          'SELECT id, deleted_at FROM memorization_coverage WHERE membership_id = $1',
          [membershipId],
        );
      expect(covRows).toHaveLength(1);
      expect(covRows[0].id).toBe(coverageId);
      expect(covRows[0].deleted_at).not.toBeNull();

      const intervalCount: Array<{ n: string }> = await dataSource.query(
        'SELECT COUNT(*) AS n FROM coverage_intervals WHERE coverage_id = $1',
        [coverageId],
      );
      expect(Number(intervalCount[0].n)).toBe(1);
    });
  });

  describe('Conflict & self-removal guards', () => {
    it('returns 409 ALREADY_TERMINATED on double terminate', async () => {
      const admin = await registerAndLogin(UserRole.Admin);
      const staff = await seedStaff();
      const groupId = await seedGroup({
        teacherId: staff.teacher.userId,
        assistantId: staff.assistant.userId,
        createdBy: admin.userId,
      });
      const student = await registerAndLogin(UserRole.Student);
      const membershipId = await seedMembership({
        userId: student.userId,
        groupId,
        state: 'Active',
        startedAt: STARTED,
      });

      await request(app.getHttpServer())
        .delete(`/api/v1/memberships/${membershipId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.OK);

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/memberships/${membershipId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.CONFLICT);

      expect(res.body.statusCode).toBe(HttpStatus.CONFLICT);
      expect(res.body.error).toBe('ALREADY_TERMINATED');
    });

    it('returns 403 CANNOT_REMOVE_SELF when the Admin terminates their own membership', async () => {
      const admin = await registerAndLogin(UserRole.Admin);

      // Defensive: retire any pre-existing Active membership owned by the
      // shared Admin row so DB-UQ-02 does not reject our seed below.
      await dataSource.query(
        `UPDATE memberships
         SET state = 'Terminated', ended_at = GREATEST(started_at, CURRENT_DATE)
         WHERE user_id = $1 AND state = 'Active'`,
        [admin.userId],
      );

      const staff = await seedStaff();
      const groupId = await seedGroup({
        teacherId: staff.teacher.userId,
        assistantId: staff.assistant.userId,
        createdBy: admin.userId,
      });
      const membershipId = await seedMembership({
        userId: admin.userId,
        groupId,
        state: 'Active',
        startedAt: STARTED,
      });

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/memberships/${membershipId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);

      expect(res.body.statusCode).toBe(HttpStatus.FORBIDDEN);
      expect(res.body.error).toBe('CANNOT_REMOVE_SELF');

      const memRows: Array<{ state: string }> = await dataSource.query(
        'SELECT state FROM memberships WHERE id = $1',
        [membershipId],
      );
      expect(memRows[0].state).toBe('Active');
    });
  });

  describe.each([
    ['Student', UserRole.Student],
    ['User', UserRole.User],
    ['Teacher', UserRole.Teacher],
    ['Assistant', UserRole.Assistant],
  ])('%s role rejection (RolesGuard)', (roleName, role) => {
    it(`rejects role ${roleName} with 403 SCOPE_DENIED`, async () => {
      const admin = await registerAndLogin(UserRole.Admin);
      const staff = await seedStaff();
      const groupId = await seedGroup({
        teacherId: staff.teacher.userId,
        assistantId: staff.assistant.userId,
        createdBy: admin.userId,
      });
      const student = await registerAndLogin(UserRole.Student);
      const membershipId = await seedMembership({
        userId: student.userId,
        groupId,
        state: 'Active',
        startedAt: STARTED,
      });

      const actor = await registerAndLogin(role);

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/memberships/${membershipId}`)
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);

      expect(res.body.statusCode).toBe(HttpStatus.FORBIDDEN);
      expect(res.body.error).toBe('SCOPE_DENIED');
    });
  });

  describe('Not-found semantics (API-027 / uniform 404)', () => {
    it('returns 404 NOT_FOUND for a well-formed but nonexistent membership UUID', async () => {
      const admin = await registerAndLogin(UserRole.Admin);

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/memberships/${uuidv7()}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.NOT_FOUND);

      expect(res.body.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(res.body.error).toBe('NOT_FOUND');
    });

    it('returns 404 NOT_FOUND (not 422) for a malformed id, per APIS.md doc-exact behavior', async () => {
      const admin = await registerAndLogin(UserRole.Admin);

      const res = await request(app.getHttpServer())
        .delete('/api/v1/memberships/not-a-uuid')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.NOT_FOUND);

      expect(res.body.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(res.body.error).toBe('NOT_FOUND');
    });
  });
});
