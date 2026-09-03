/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { HttpStatus, INestApplication } from '@nestjs/common';
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
import {
  purgeNotificationLog,
  stopScheduledJobs,
} from '../shared/scheduled-jobs';

interface TestActor {
  accessToken: string;
  userId: string;
}

const STUDENT_TIMEZONE = 'Africa/Tunis';

/** Independent computation of "today" in the student's timezone (VR-10, T-01). */
function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** ISO day-of-week (1 = Monday … 7 = Sunday) of a YYYY-MM-DD date. */
function isoDay(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

describe('GET /daily-reports/today (F-DR-01 / API-029 Integration)', () => {
  jest.setTimeout(60000);

  let app: INestApplication<App>;
  let dataSource: DataSource;

  const testEmailDomain = '@test-today-report-status.com';
  const testGroupPrefix = 'F-DR-01 test group';
  const mockMailer: IMailer = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  };

  const today = todayIn(STUDENT_TIMEZONE);
  const todayIsoDay = isoDay(today);
  /** Any weekday that is NOT today, so the recitation-day rule stays out of the way. */
  const otherDay = (todayIsoDay % 7) + 1;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MAILER)
      .useValue(mockMailer)
      .compile();

    app = moduleFixture.createNestApplication();
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

  async function cleanDatabase(): Promise<void> {
    await purgeNotificationLog(dataSource);
    await dataSource.query(
      `DELETE FROM daily_reports
       WHERE membership_id IN (
         SELECT id FROM memberships
         WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)
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
    await dataSource.query('DELETE FROM users WHERE email LIKE $1', [
      `%${testEmailDomain}`,
    ]);
  }

  async function registerAndLogin(role: UserRole): Promise<TestActor> {
    const password = 'Password123!';

    // If role is Admin, respect DB-UQ-08 (single admin system-wide)
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

    const email = `${role.toLowerCase()}-${uuidv7()}${testEmailDomain}`;
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, timezone: STUDENT_TIMEZONE })
      .expect(HttpStatus.CREATED);

    const userId = registration.body.id as string;
    await dataSource.query(
      'UPDATE users SET role = $1, full_name = $2, gender = $3 WHERE id = $4',
      [role, `${role} test user`, 'Male', userId],
    );

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(HttpStatus.OK);

    return { accessToken: login.body.access_token as string, userId };
  }

  async function createGroup(options: {
    recitationDay: number;
    lifecycleState?: 'Active' | 'Archived';
  }): Promise<string> {
    const teacher = await registerAndLogin(UserRole.Teacher);
    const assistant = await registerAndLogin(UserRole.Assistant);
    const id = uuidv7();
    const archived = options.lifecycleState === 'Archived';
    await dataSource.query(
      `INSERT INTO groups (
         id, name, gender, recitation_day, enrollment_status,
         lifecycle_state, archived_at, teacher_id, assistant_id, created_by,
         created_at, updated_at
       ) VALUES ($1, $2, 'Male', $3, 'Closed', $4, $5, $6, $7, $6, now(), now())`,
      [
        id,
        `${testGroupPrefix} ${uuidv7()}`,
        options.recitationDay,
        archived ? 'Archived' : 'Active',
        archived ? new Date() : null,
        teacher.userId,
        assistant.userId,
      ],
    );
    return id;
  }

  async function createMembership(options: {
    userId: string;
    groupId: string;
    state: 'Active' | 'Terminated';
  }): Promise<string> {
    const id = uuidv7();
    await dataSource.query(
      `INSERT INTO memberships (
         id, user_id, group_id, state, started_at, ended_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, '2026-08-01', $5, now(), now())`,
      [
        id,
        options.userId,
        options.groupId,
        options.state,
        options.state === 'Terminated' ? '2026-08-20' : null,
      ],
    );
    return id;
  }

  async function ordinalOf(surah: number, ayah: number): Promise<number> {
    const rows: Array<{ ordinal_offset: number | string }> =
      await dataSource.query(
        'SELECT ordinal_offset FROM surahs WHERE number = $1',
        [surah],
      );
    return Number(rows[0].ordinal_offset) + ayah;
  }

  async function createNormalReport(options: {
    membershipId: string;
    reportDate: string;
    deleted?: boolean;
  }): Promise<string> {
    const id = uuidv7();
    await dataSource.query(
      `INSERT INTO daily_reports (
         id, membership_id, report_date, type, submitted_at, submitted_timezone,
         no_memorization_today, memo_from_ordinal, memo_to_ordinal,
         memo_time_from, memo_time_to, completed_50_repetitions,
         repetitions_in_single_session, no_revision_today,
         rev_from_ordinal, rev_to_ordinal, rev_time_from, rev_time_to,
         read_tafsir, absence_reason, deleted_at
       ) VALUES (
         $1, $2, $3::date, 'Normal', '2026-09-02T08:30:00Z', $4,
         false, $5, $6,
         '18:00', '18:45', true,
         true, false,
         $7, $8, '19:00', '19:10',
         false, NULL, $9
       )`,
      [
        id,
        options.membershipId,
        options.reportDate,
        STUDENT_TIMEZONE,
        await ordinalOf(2, 1),
        await ordinalOf(2, 20),
        await ordinalOf(1, 1),
        await ordinalOf(1, 7),
        options.deleted ? new Date() : null,
      ],
    );
    return id;
  }

  async function createAbsentReport(options: {
    membershipId: string;
    reportDate: string;
  }): Promise<string> {
    const id = uuidv7();
    await dataSource.query(
      `INSERT INTO daily_reports (
         id, membership_id, report_date, type, submitted_timezone, absence_reason
       ) VALUES ($1, $2, $3::date, 'Absent', $4, 'Sick')`,
      [id, options.membershipId, options.reportDate, STUDENT_TIMEZONE],
    );
    return id;
  }

  describe('can_submit = true', () => {
    it('returns { can_submit: true } with no block_reason and no existing_report on a memorization day', async () => {
      const student = await registerAndLogin(UserRole.Student);
      const groupId = await createGroup({ recitationDay: otherDay });
      await createMembership({
        userId: student.userId,
        groupId,
        state: 'Active',
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/daily-reports/today')
        .set('Authorization', `Bearer ${student.accessToken}`)
        .expect(HttpStatus.OK);

      expect(response.body).toEqual({ data: { can_submit: true } });
    });

    it('ignores a soft-deleted report for today (DB-UQ-04 is partial on deleted_at IS NULL)', async () => {
      const student = await registerAndLogin(UserRole.Student);
      const groupId = await createGroup({ recitationDay: otherDay });
      const membershipId = await createMembership({
        userId: student.userId,
        groupId,
        state: 'Active',
      });
      await createNormalReport({
        membershipId,
        reportDate: today,
        deleted: true,
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/daily-reports/today')
        .set('Authorization', `Bearer ${student.accessToken}`)
        .expect(HttpStatus.OK);

      expect(response.body).toEqual({ data: { can_submit: true } });
    });

    it('ignores a report submitted on a previous date', async () => {
      const student = await registerAndLogin(UserRole.Student);
      const groupId = await createGroup({ recitationDay: otherDay });
      const membershipId = await createMembership({
        userId: student.userId,
        groupId,
        state: 'Active',
      });
      await createAbsentReport({ membershipId, reportDate: '2026-08-15' });

      const response = await request(app.getHttpServer())
        .get('/api/v1/daily-reports/today')
        .set('Authorization', `Bearer ${student.accessToken}`)
        .expect(HttpStatus.OK);

      expect(response.body).toEqual({ data: { can_submit: true } });
    });
  });

  describe('block_reason = already_submitted', () => {
    it('returns the full existing report as a DailyReportDto with surah/ayah ranges (AC-07, APIS §11)', async () => {
      const student = await registerAndLogin(UserRole.Student);
      const groupId = await createGroup({ recitationDay: otherDay });
      const membershipId = await createMembership({
        userId: student.userId,
        groupId,
        state: 'Active',
      });
      const reportId = await createNormalReport({
        membershipId,
        reportDate: today,
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/daily-reports/today')
        .set('Authorization', `Bearer ${student.accessToken}`)
        .expect(HttpStatus.OK);

      expect(response.body).toEqual({
        data: {
          can_submit: false,
          block_reason: 'already_submitted',
          existing_report: {
            id: reportId,
            report_date: today,
            type: 'Normal',
            submitted_at: '2026-09-02T08:30:00.000Z',
            submitted_timezone: STUDENT_TIMEZONE,
            no_memorization_today: false,
            memo_range: {
              from: { surah: 2, ayah: 1 },
              to: { surah: 2, ayah: 20 },
            },
            memo_time: { from: '18:00', to: '18:45' },
            completed_50_repetitions: true,
            repetitions_in_single_session: true,
            no_revision_today: false,
            rev_range: {
              from: { surah: 1, ayah: 1 },
              to: { surah: 1, ayah: 7 },
            },
            rev_time: { from: '19:00', to: '19:10' },
            read_tafsir: false,
            absence_reason: null,
          },
        },
      });
      // Ordinals are internal (APIS §11) and membership ids are not part of the DTO.
      expect(JSON.stringify(response.body)).not.toContain('ordinal');
      expect(JSON.stringify(response.body)).not.toContain('membership_id');
    });

    it('returns an Absent report with null type-conditional groups', async () => {
      const student = await registerAndLogin(UserRole.Student);
      const groupId = await createGroup({ recitationDay: otherDay });
      const membershipId = await createMembership({
        userId: student.userId,
        groupId,
        state: 'Active',
      });
      const reportId = await createAbsentReport({
        membershipId,
        reportDate: today,
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/daily-reports/today')
        .set('Authorization', `Bearer ${student.accessToken}`)
        .expect(HttpStatus.OK);

      expect(response.body.data.can_submit).toBe(false);
      expect(response.body.data.block_reason).toBe('already_submitted');
      expect(response.body.data.existing_report).toMatchObject({
        id: reportId,
        report_date: today,
        type: 'Absent',
        absence_reason: 'Sick',
        memo_range: null,
        memo_time: null,
        rev_range: null,
        rev_time: null,
        no_memorization_today: null,
        completed_50_repetitions: null,
        repetitions_in_single_session: null,
        no_revision_today: null,
        read_tafsir: null,
      });
    });
  });

  describe('block_reason = recitation_day', () => {
    it('blocks when today (in the student timezone) is the group recitation day, without existing_report (VR-12, AC-10)', async () => {
      const student = await registerAndLogin(UserRole.Student);
      const groupId = await createGroup({ recitationDay: todayIsoDay });
      await createMembership({
        userId: student.userId,
        groupId,
        state: 'Active',
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/daily-reports/today')
        .set('Authorization', `Bearer ${student.accessToken}`)
        .expect(HttpStatus.OK);

      expect(response.body).toEqual({
        data: { can_submit: false, block_reason: 'recitation_day' },
      });
    });
  });

  describe('block_reason = group_archived', () => {
    it('blocks when the group is Archived (FR-DR-11, INV-21)', async () => {
      const student = await registerAndLogin(UserRole.Student);
      const groupId = await createGroup({
        recitationDay: otherDay,
        lifecycleState: 'Archived',
      });
      await createMembership({
        userId: student.userId,
        groupId,
        state: 'Active',
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/daily-reports/today')
        .set('Authorization', `Bearer ${student.accessToken}`)
        .expect(HttpStatus.OK);

      expect(response.body).toEqual({
        data: { can_submit: false, block_reason: 'group_archived' },
      });
    });

    it('takes precedence over an existing report and the recitation day (UC-05 precondition order)', async () => {
      const student = await registerAndLogin(UserRole.Student);
      const groupId = await createGroup({
        recitationDay: todayIsoDay,
        lifecycleState: 'Archived',
      });
      const membershipId = await createMembership({
        userId: student.userId,
        groupId,
        state: 'Active',
      });
      await createAbsentReport({ membershipId, reportDate: today });

      const response = await request(app.getHttpServer())
        .get('/api/v1/daily-reports/today')
        .set('Authorization', `Bearer ${student.accessToken}`)
        .expect(HttpStatus.OK);

      expect(response.body).toEqual({
        data: { can_submit: false, block_reason: 'group_archived' },
      });
    });
  });

  describe('block_reason = membership_inactive', () => {
    it('blocks a Student whose only membership is Terminated (VR-35)', async () => {
      const student = await registerAndLogin(UserRole.Student);
      const groupId = await createGroup({ recitationDay: otherDay });
      await createMembership({
        userId: student.userId,
        groupId,
        state: 'Terminated',
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/daily-reports/today')
        .set('Authorization', `Bearer ${student.accessToken}`)
        .expect(HttpStatus.OK);

      expect(response.body).toEqual({
        data: { can_submit: false, block_reason: 'membership_inactive' },
      });
    });

    it('blocks a Student with no membership at all', async () => {
      const student = await registerAndLogin(UserRole.Student);

      const response = await request(app.getHttpServer())
        .get('/api/v1/daily-reports/today')
        .set('Authorization', `Bearer ${student.accessToken}`)
        .expect(HttpStatus.OK);

      expect(response.body).toEqual({
        data: { can_submit: false, block_reason: 'membership_inactive' },
      });
    });
  });

  describe('scope (own membership only)', () => {
    it('never reads another student report for the same date', async () => {
      const groupId = await createGroup({ recitationDay: otherDay });
      const other = await registerAndLogin(UserRole.Student);
      const otherMembershipId = await createMembership({
        userId: other.userId,
        groupId,
        state: 'Active',
      });
      await createAbsentReport({
        membershipId: otherMembershipId,
        reportDate: today,
      });
      const student = await registerAndLogin(UserRole.Student);
      await createMembership({
        userId: student.userId,
        groupId,
        state: 'Active',
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/daily-reports/today')
        .set('Authorization', `Bearer ${student.accessToken}`)
        .expect(HttpStatus.OK);

      expect(response.body).toEqual({ data: { can_submit: true } });
    });
  });

  describe('authorization (APIS §6.1, TS §36)', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/daily-reports/today')
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it.each([
      UserRole.User,
      UserRole.Teacher,
      UserRole.Assistant,
      UserRole.Admin,
    ])(
      'returns 403 SCOPE_DENIED for the %s role (Assistant blocked by RolesGuard alone, DEC-B09)',
      async (role) => {
        const actor = await registerAndLogin(role);

        const response = await request(app.getHttpServer())
          .get('/api/v1/daily-reports/today')
          .set('Authorization', `Bearer ${actor.accessToken}`)
          .expect(HttpStatus.FORBIDDEN);

        expect(response.body.statusCode).toBe(HttpStatus.FORBIDDEN);
        expect(response.body.error).toBe('SCOPE_DENIED');
        expect(response.body).not.toHaveProperty('data');
        expect(response.body.correlationId).toBeDefined();
      },
    );
  });
});
