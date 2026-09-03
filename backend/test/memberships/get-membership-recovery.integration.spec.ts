/* eslint-disable @typescript-eslint/no-unsafe-member-access */
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
  IPasswordHasher,
  PASSWORD_HASHER,
} from '../../src/modules/identity/domain/password-hasher.interface';
import { UserRole } from '../../src/modules/identity/domain/user-role.enum';
import { stopScheduledJobs } from '../shared/scheduled-jobs';

interface TestActor {
  accessToken: string;
  userId: string;
}

describe('GET /memberships/:id/recovery (F-MEM-04 / API-028 Integration)', () => {
  jest.setTimeout(30000);

  let app: INestApplication<App>;
  let dataSource: DataSource;

  const testEmailDomain = '@test-recovery.com';
  const testGroupPrefix = 'F-MEM-04 test group';
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
  }, 30000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await cleanDatabase();
    }
    await app.close();
  }, 30000);

  async function cleanDatabase(): Promise<void> {
    await dataSource.query(
      `DELETE FROM daily_reports
       WHERE membership_id IN (
         SELECT m.id FROM memberships m
         JOIN users u ON u.id = m.user_id
         WHERE u.email LIKE $1
       )`,
      [`%${testEmailDomain}`],
    );
    await dataSource.query(
      `DELETE FROM weekly_reports
       WHERE membership_id IN (
         SELECT m.id FROM memberships m
         JOIN users u ON u.id = m.user_id
         WHERE u.email LIKE $1
       )`,
      [`%${testEmailDomain}`],
    );
    await dataSource.query(
      `DELETE FROM payment_records
       WHERE membership_id IN (
         SELECT m.id FROM memberships m
         JOIN users u ON u.id = m.user_id
         WHERE u.email LIKE $1
       )`,
      [`%${testEmailDomain}`],
    );
    await dataSource.query(
      `DELETE FROM memberships
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
    await dataSource.query(
      "DELETE FROM users WHERE email LIKE $1 AND role <> 'Admin'",
      [`%${testEmailDomain}`],
    );
  }

  async function registerAndLogin(
    role: UserRole,
    options?: { fullName?: string | null; gender?: 'Male' | 'Female' | null },
  ): Promise<TestActor> {
    const email = `${role.toLowerCase()}-${uuidv7()}${testEmailDomain}`;
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
    const teacher = await registerAndLogin(UserRole.Teacher, {
      fullName: 'الشيخ عبد الله',
      gender: 'Male',
    });
    const assistant = await registerAndLogin(UserRole.Assistant, {
      fullName: 'المساعد محمد',
      gender: 'Male',
    });
    return { teacher, assistant };
  }

  async function seedGroup(params: {
    teacherId: string;
    assistantId: string;
    createdBy: string;
    gender?: 'Male' | 'Female';
  }): Promise<string> {
    const id = uuidv7();
    const groupName = `${testGroupPrefix} ${uuidv7()}`;
    await dataSource.query(
      `INSERT INTO groups (
         id, name, gender, recitation_day, enrollment_status,
         lifecycle_state, teacher_id, assistant_id, created_by,
         created_at, updated_at
       ) VALUES ($1, $2, $3, 4, 'Closed', 'Active', $4, $5, $6, now(), now())`,
      [
        id,
        groupName,
        params.gender ?? 'Male',
        params.teacherId,
        params.assistantId,
        params.createdBy,
      ],
    );
    return id;
  }

  async function seedMembership(params: {
    userId: string;
    groupId: string;
    state: 'Active' | 'Terminated';
    startedAt: string;
    endedAt?: string | null;
    endedBy?: string | null;
  }): Promise<string> {
    const id = uuidv7();
    await dataSource.query(
      `INSERT INTO memberships (id, user_id, group_id, state, started_at, ended_at, ended_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        params.userId,
        params.groupId,
        params.state,
        params.startedAt,
        params.endedAt ?? null,
        params.endedBy ?? null,
      ],
    );
    return id;
  }

  describe('Happy path — Admin recovery view', () => {
    it('returns terminated membership with populated soft-deleted history (filtering out active rows)', async () => {
      const admin = await registerAndLogin(UserRole.Admin);
      const staff = await seedStaff();
      const groupId = await seedGroup({
        teacherId: staff.teacher.userId,
        assistantId: staff.assistant.userId,
        createdBy: admin.userId,
      });

      const student = await registerAndLogin(UserRole.Student, {
        fullName: 'طالب مسترجع',
        gender: 'Male',
      });

      const membershipId = await seedMembership({
        userId: student.userId,
        groupId,
        state: 'Terminated',
        startedAt: '2026-05-01',
        endedAt: '2026-08-01',
        endedBy: admin.userId,
      });

      // 1. Seed soft-deleted daily report
      const deletedDailyReportId = uuidv7();
      await dataSource.query(
        `INSERT INTO daily_reports (
          id, membership_id, report_date, type, submitted_at, submitted_timezone,
          no_memorization_today, memo_from_ordinal, memo_to_ordinal, memo_time_from, memo_time_to,
          completed_50_repetitions, repetitions_in_single_session, no_revision_today,
          rev_from_ordinal, rev_to_ordinal, rev_time_from, rev_time_to, read_tafsir,
          deleted_at
        ) VALUES (
          $1, $2, '2026-05-02', 'Normal', '2026-05-02T08:00:00.000Z', 'Africa/Tunis',
          false, 1, 10, '08:00:00', '08:30:00',
          true, true, false,
          1, 5, '08:30:00', '09:00:00', true,
          '2026-08-01T12:00:00.000Z'
        )`,
        [deletedDailyReportId, membershipId],
      );

      // 2. Seed active daily report (deleted_at IS NULL) — MUST NOT appear
      const activeDailyReportId = uuidv7();
      await dataSource.query(
        `INSERT INTO daily_reports (
          id, membership_id, report_date, type, submitted_at, submitted_timezone,
          no_memorization_today, completed_50_repetitions, repetitions_in_single_session, no_revision_today, read_tafsir,
          deleted_at
        ) VALUES (
          $1, $2, '2026-05-03', 'Normal', '2026-05-03T08:00:00.000Z', 'Africa/Tunis',
          true, false, false, true, false,
          NULL
        )`,
        [activeDailyReportId, membershipId],
      );

      // 3. Seed soft-deleted weekly report
      const deletedWeeklyReportId = uuidv7();
      await dataSource.query(
        `INSERT INTO weekly_reports (
          id, membership_id, week_start, week_end, expected_days,
          missed_daily_reports, missed_daily_memorization, missed_daily_revision,
          missed_50_repetitions, missed_single_session, attended_recitation_call,
          state, finalised_at, finalised_by, deleted_at
        ) VALUES (
          $1, $2, '2026-05-01', '2026-05-07', 6,
          0, 0, 0,
          0, 0, true,
          'Finalised', '2026-05-07T18:00:00.000Z', $3, '2026-08-01T12:00:00.000Z'
        )`,
        [deletedWeeklyReportId, membershipId, staff.teacher.userId],
      );

      // 4. Seed soft-deleted payment record
      const deletedPaymentId = uuidv7();
      await dataSource.query(
        `INSERT INTO payment_records (
          id, membership_id, cycle_index, amount, paid_at, recorded_by, deleted_at
        ) VALUES (
          $1, $2, 0, 30.00, '2026-05-01T10:00:00.000Z', $3, '2026-08-01T12:00:00.000Z'
        )`,
        [deletedPaymentId, membershipId, staff.assistant.userId],
      );

      // Execute request
      const res = await request(app.getHttpServer())
        .get(`/api/v1/memberships/${membershipId}/recovery`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toBeDefined();
      expect(res.body.data.membership).toMatchObject({
        id: membershipId,
        user: {
          id: student.userId,
          full_name: 'طالب مسترجع',
          gender: 'Male',
        },
        group: {
          id: groupId,
          recitation_day: 4,
          enrollment_status: 'Closed',
        },
        state: 'Terminated',
        started_at: '2026-05-01',
        ended_at: '2026-08-01',
        ended_by: admin.userId,
      });

      // Daily reports assertion: contains soft-deleted row, does NOT contain active row
      expect(res.body.data.daily_reports).toHaveLength(1);
      expect(res.body.data.daily_reports[0].id).toBe(deletedDailyReportId);
      expect(res.body.data.daily_reports[0].report_date).toBe('2026-05-02');
      expect(res.body.data.daily_reports[0].type).toBe('Normal');
      expect(res.body.data.daily_reports[0].deleted_at).toBeDefined();

      // Weekly reports assertion
      expect(res.body.data.weekly_reports).toHaveLength(1);
      expect(res.body.data.weekly_reports[0].id).toBe(deletedWeeklyReportId);
      expect(res.body.data.weekly_reports[0].week_start).toBe('2026-05-01');
      expect(res.body.data.weekly_reports[0].state).toBe('Finalised');

      // Payment records assertion
      expect(res.body.data.payment_records).toHaveLength(1);
      expect(res.body.data.payment_records[0].id).toBe(deletedPaymentId);
      expect(res.body.data.payment_records[0].cycle_index).toBe(0);
      expect(res.body.data.payment_records[0].amount).toBe('30.00');
    });

    it('returns empty history arrays for a membership with no EPIC-05/07 data yet — expected, not an error', async () => {
      const admin = await registerAndLogin(UserRole.Admin);
      const staff = await seedStaff();
      const groupId = await seedGroup({
        teacherId: staff.teacher.userId,
        assistantId: staff.assistant.userId,
        createdBy: admin.userId,
      });

      const student = await registerAndLogin(UserRole.Student, {
        fullName: 'طالب بدون بيانات',
        gender: 'Male',
      });

      const membershipId = await seedMembership({
        userId: student.userId,
        groupId,
        state: 'Terminated',
        startedAt: '2026-07-01',
        endedAt: '2026-08-01',
        endedBy: admin.userId,
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/memberships/${membershipId}/recovery`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toBeDefined();
      expect(res.body.data.membership.id).toBe(membershipId);
      expect(res.body.data.membership.state).toBe('Terminated');
      expect(res.body.data.daily_reports).toEqual([]);
      expect(res.body.data.weekly_reports).toEqual([]);
      expect(res.body.data.payment_records).toEqual([]);
    });

    it('returns 200 with empty history arrays for an Active membership (APIQ-NEW-10)', async () => {
      const admin = await registerAndLogin(UserRole.Admin);
      const staff = await seedStaff();
      const groupId = await seedGroup({
        teacherId: staff.teacher.userId,
        assistantId: staff.assistant.userId,
        createdBy: admin.userId,
      });

      const student = await registerAndLogin(UserRole.Student, {
        fullName: 'طالب نشط',
        gender: 'Male',
      });

      const membershipId = await seedMembership({
        userId: student.userId,
        groupId,
        state: 'Active',
        startedAt: '2026-08-01',
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/memberships/${membershipId}/recovery`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toBeDefined();
      expect(res.body.data.membership.id).toBe(membershipId);
      expect(res.body.data.membership.state).toBe('Active');
      expect(res.body.data.daily_reports).toEqual([]);
      expect(res.body.data.weekly_reports).toEqual([]);
      expect(res.body.data.payment_records).toEqual([]);
    });
  });

  describe('Error cases & Authorization', () => {
    it('returns 404 NOT_FOUND for a nonexistent membership id (APIQ-NEW-09)', async () => {
      const admin = await registerAndLogin(UserRole.Admin);
      const randomId = uuidv7();

      const res = await request(app.getHttpServer())
        .get(`/api/v1/memberships/${randomId}/recovery`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.NOT_FOUND);

      expect(res.body.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(res.body.error).toBe('NOT_FOUND');
      expect(res.body.message).toBe('المورد المطلوب غير موجود');
    });

    it('returns 401 UNAUTHORIZED when no token is provided', async () => {
      const randomId = uuidv7();
      await request(app.getHttpServer())
        .get(`/api/v1/memberships/${randomId}/recovery`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    describe.each([
      UserRole.Teacher,
      UserRole.Assistant,
      UserRole.Student,
      UserRole.User,
    ])('%s role rejection', (role) => {
      it('returns 403 SCOPE_DENIED (RolesGuard)', async () => {
        const actor = await registerAndLogin(role);
        const randomId = uuidv7();

        const res = await request(app.getHttpServer())
          .get(`/api/v1/memberships/${randomId}/recovery`)
          .set('Authorization', `Bearer ${actor.accessToken}`)
          .expect(HttpStatus.FORBIDDEN);

        expect(res.body.statusCode).toBe(HttpStatus.FORBIDDEN);
        expect(res.body.error).toBe('SCOPE_DENIED');
      });
    });
  });
});
