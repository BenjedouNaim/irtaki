/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { HttpStatus, INestApplication } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
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
import { WEEKLY_REPORT_FINALIZATION_CRON } from '../../src/modules/reports/infrastructure/jobs/weekly-report-finalization.job';
import { stopScheduledJobs } from '../shared/scheduled-jobs';

interface TestActor {
  accessToken: string;
  userId: string;
}

interface EnrolledStudent extends TestActor {
  membershipId: string;
  groupId: string;
  teacher: TestActor;
  assistant: TestActor;
}

const STUDENT_TIMEZONE = 'Africa/Tunis';
/** A staff timezone deliberately far from the student's (T-01, INV-27). */
const STAFF_TIMEZONE = 'Pacific/Auckland';

/** Independent computation of "today" in the student's timezone (T-01). */
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

/** Independent UTC date arithmetic on a YYYY-MM-DD value. */
function shift(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

describe('GET /memberships/{id}/performance (F-PERF-03 / API-039 Integration)', () => {
  jest.setTimeout(120000);

  let app: INestApplication<App>;
  let dataSource: DataSource;

  const testEmailDomain = '@test-membership-performance.com';
  const testGroupPrefix = 'F-PERF-03 test group';
  const mockMailer: IMailer = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  };

  const today = todayIn(STUDENT_TIMEZONE);
  const todayIsoDay = isoDay(today);
  /** Far enough back that no window under test is prorated (FR-WR-09). */
  const startedLongAgo = shift(today, -120);
  const missingMembershipId = uuidv7();

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

    // DS-02's cron must not finalise a fixture week mid-suite (ADR-024).
    void app
      .get(SchedulerRegistry)
      .getCronJob(WEEKLY_REPORT_FINALIZATION_CRON)
      .stop();

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
    for (const table of ['weekly_reports', 'daily_reports']) {
      await dataSource.query(
        `DELETE FROM ${table}
         WHERE membership_id IN (
           SELECT id FROM memberships
           WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)
         )`,
        [`%${testEmailDomain}`],
      );
    }
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

  async function registerAndLogin(
    role: UserRole,
    timezone: string = STUDENT_TIMEZONE,
  ): Promise<TestActor> {
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

    const email = `${role.toLowerCase()}-${uuidv7()}${testEmailDomain}`;
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, timezone })
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

  async function createGroup(
    recitationDay: number,
  ): Promise<{ groupId: string; teacher: TestActor; assistant: TestActor }> {
    // Staff live in a different timezone on purpose: every figure must be
    // measured in the STUDENT's day, never the reader's (T-01, INV-27).
    const teacher = await registerAndLogin(UserRole.Teacher, STAFF_TIMEZONE);
    const assistant = await registerAndLogin(
      UserRole.Assistant,
      STAFF_TIMEZONE,
    );
    const groupId = uuidv7();
    await dataSource.query(
      `INSERT INTO groups (
         id, name, gender, recitation_day, enrollment_status,
         lifecycle_state, teacher_id, assistant_id, created_by,
         created_at, updated_at
       ) VALUES ($1, $2, 'Male', $3, 'Closed', 'Active', $4, $5, $4, now(), now())`,
      [
        groupId,
        `${testGroupPrefix} ${uuidv7()}`,
        recitationDay,
        teacher.userId,
        assistant.userId,
      ],
    );
    return { groupId, teacher, assistant };
  }

  /** A Student in a fresh group. Recitation day defaults to today's. */
  async function enrolStudent(
    options: { recitationDay?: number; startedAt?: string } = {},
  ): Promise<EnrolledStudent> {
    const student = await registerAndLogin(UserRole.Student);
    const { groupId, teacher, assistant } = await createGroup(
      options.recitationDay ?? todayIsoDay,
    );
    const membershipId = uuidv7();
    await dataSource.query(
      `INSERT INTO memberships (
         id, user_id, group_id, state, started_at, ended_at, created_at, updated_at
       ) VALUES ($1, $2, $3, 'Active', $4::date, NULL, now(), now())`,
      [
        membershipId,
        student.userId,
        groupId,
        options.startedAt ?? startedLongAgo,
      ],
    );
    return { ...student, membershipId, groupId, teacher, assistant };
  }

  async function ordinalOf(surah: number, ayah: number): Promise<number> {
    const rows: Array<{ ordinal_offset: number | string }> =
      await dataSource.query(
        'SELECT ordinal_offset FROM surahs WHERE number = $1',
        [surah],
      );
    return Number(rows[0].ordinal_offset) + ayah;
  }

  interface NormalOptions {
    memo?: boolean;
    completed50?: boolean;
    revision?: boolean;
  }

  async function createNormalReport(
    membershipId: string,
    reportDate: string,
    options: NormalOptions = {},
  ): Promise<void> {
    const memo = options.memo ?? true;
    const revision = options.revision ?? true;
    const completed50 = memo ? (options.completed50 ?? true) : null;
    const singleSession = memo ? completed50 : null;
    await dataSource.query(
      `INSERT INTO daily_reports (
         id, membership_id, report_date, type, submitted_timezone,
         no_memorization_today, memo_from_ordinal, memo_to_ordinal,
         memo_time_from, memo_time_to, completed_50_repetitions,
         repetitions_in_single_session, no_revision_today,
         rev_from_ordinal, rev_to_ordinal, rev_time_from, rev_time_to,
         read_tafsir
       ) VALUES (
         $1, $2, $3::date, 'Normal', $4,
         $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, false
       )`,
      [
        uuidv7(),
        membershipId,
        reportDate,
        STUDENT_TIMEZONE,
        !memo,
        memo ? await ordinalOf(2, 1) : null,
        memo ? await ordinalOf(2, 20) : null,
        memo ? '18:00' : null,
        memo ? '18:45' : null,
        completed50,
        singleSession,
        !revision,
        revision ? await ordinalOf(1, 1) : null,
        revision ? await ordinalOf(1, 7) : null,
        revision ? '19:00' : null,
        revision ? '19:10' : null,
      ],
    );
  }

  async function createRevisionReport(
    membershipId: string,
    reportDate: string,
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO daily_reports (
         id, membership_id, report_date, type, submitted_timezone,
         no_revision_today, rev_from_ordinal, rev_to_ordinal, rev_time_from, rev_time_to
       ) VALUES ($1, $2, $3::date, 'Revision', $4, false, $5, $6, '19:00', '19:30')`,
      [
        uuidv7(),
        membershipId,
        reportDate,
        STUDENT_TIMEZONE,
        await ordinalOf(1, 1),
        await ordinalOf(1, 7),
      ],
    );
  }

  async function createAbsentReport(
    membershipId: string,
    reportDate: string,
    reason: 'Sick' | 'Studying' | 'Other',
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO daily_reports (
         id, membership_id, report_date, type, submitted_timezone, absence_reason
       ) VALUES ($1, $2, $3::date, 'Absent', $4, $5)`,
      [uuidv7(), membershipId, reportDate, STUDENT_TIMEZONE, reason],
    );
  }

  /** A finalised E-06 row — AttendanceRate's only numerator source. */
  async function createFinalisedWeek(
    membershipId: string,
    weekStart: string,
    attended: boolean,
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO weekly_reports (
         id, membership_id, week_start, week_end, expected_days,
         missed_daily_reports, missed_daily_memorization, missed_daily_revision,
         missed_50_repetitions, missed_single_session,
         attended_recitation_call, state, finalised_at
       ) VALUES ($1, $2, $3::date, $4::date, 6, 0, 0, 0, 0, 0, $5, 'Finalised', now())`,
      [uuidv7(), membershipId, weekStart, shift(weekStart, 6), attended],
    );
  }

  function getMembershipPerformance(
    actor: TestActor,
    membershipId: string,
    query = '',
  ) {
    return request(app.getHttpServer())
      .get(`/api/v1/memberships/${membershipId}/performance${query}`)
      .set('Authorization', `Bearer ${actor.accessToken}`);
  }

  function getOwnPerformance(actor: TestActor, query = '') {
    return request(app.getHttpServer())
      .get(`/api/v1/me/performance${query}`)
      .set('Authorization', `Bearer ${actor.accessToken}`);
  }

  /**
   * Recitation day = today's, so the reporting week containing today is
   * today−6 … today and its six EXPECTED days are today−6 … today−1:
   *
   *   today−6  NORMAL, memorised, 50 done, revised
   *   today−5  NORMAL, memorised, 50 NOT done, revised
   *   today−4  NORMAL, no memorization, revised
   *   today−3  REVISION
   *   today−2  ABSENT Sick        (leaves every denominator, BR-24)
   *   today−1  no report
   *
   * submission 80 · memorization 50 · revision 80 · quality 50 ·
   * attendance undefined (EC-44: the running week has not passed its
   * recitation day) → score = mean(80, 50, 80) = 70.
   */
  async function seedFixtureWeek(): Promise<EnrolledStudent> {
    const student = await enrolStudent();
    await createNormalReport(student.membershipId, shift(today, -6));
    await createNormalReport(student.membershipId, shift(today, -5), {
      completed50: false,
    });
    await createNormalReport(student.membershipId, shift(today, -4), {
      memo: false,
    });
    await createRevisionReport(student.membershipId, shift(today, -3));
    await createAbsentReport(student.membershipId, shift(today, -2), 'Sick');
    await createFinalisedWeek(student.membershipId, shift(today, -6), true);
    return student;
  }

  describe('the payload (APIS §10.9 — "same shape as /me/performance")', () => {
    it('returns the whole PerformanceDto inside the §9.1 envelope', async () => {
      const student = await seedFixtureWeek();

      const response = await getMembershipPerformance(
        student.teacher,
        student.membershipId,
      ).expect(HttpStatus.OK);

      expect(response.body).toEqual({
        data: {
          commitment_score: 70,
          submission_rate: 80,
          memorization_rate: 50,
          revision_rate: 80,
          attendance_rate: null,
          repetition_quality: 50,
          day_breakdown: {
            normal: 3,
            revision: 1,
            absent_excused: 1,
            absent_other: 0,
            no_report: 1,
          },
          days_since_last_report: 1,
        },
      });
    });

    it('is byte-identical to what the Student reads on /me/performance', async () => {
      const student = await seedFixtureWeek();

      const staffView = await getMembershipPerformance(
        student.teacher,
        student.membershipId,
      ).expect(HttpStatus.OK);
      const ownView = await getOwnPerformance(student).expect(HttpStatus.OK);

      // The Teacher lives in Pacific/Auckland and the student in
      // Africa/Tunis: the figures still agree, because "today" is the
      // STUDENT's (T-01, INV-27).
      expect(staffView.body).toEqual(ownView.body);
    });

    it('agrees with /me/performance on every period (FR-PERF-03)', async () => {
      const student = await seedFixtureWeek();

      for (const period of ['week', 'month', '3months']) {
        const staffView = await getMembershipPerformance(
          student.teacher,
          student.membershipId,
          `?period=${period}`,
        ).expect(HttpStatus.OK);
        const ownView = await getOwnPerformance(
          student,
          `?period=${period}`,
        ).expect(HttpStatus.OK);

        expect(staffView.body).toEqual(ownView.body);
      }
    });

    it('widens the window on ?period=month and keeps the older report', async () => {
      const student = await enrolStudent();
      await createNormalReport(student.membershipId, shift(today, -20));

      const week = await getMembershipPerformance(
        student.teacher,
        student.membershipId,
        '?period=week',
      ).expect(HttpStatus.OK);
      const month = await getMembershipPerformance(
        student.teacher,
        student.membershipId,
        '?period=month',
      ).expect(HttpStatus.OK);

      expect(week.body.data.day_breakdown.normal).toBe(0);
      expect(month.body.data.day_breakdown.normal).toBe(1);
    });

    it('leaves every rate null rather than 0 on a membership with no data (DEC-B04)', async () => {
      const student = await enrolStudent({ startedAt: today });

      const response = await getMembershipPerformance(
        student.teacher,
        student.membershipId,
      ).expect(HttpStatus.OK);

      expect(response.body.data).toMatchObject({
        commitment_score: null,
        submission_rate: null,
        memorization_rate: null,
        revision_rate: null,
        attendance_rate: null,
        repetition_quality: null,
      });
    });

    it('never persists anything — DS-03 is recomputed per call (TS §24, DBD §68)', async () => {
      const student = await seedFixtureWeek();
      const countRows = async (table: string): Promise<number> => {
        const rows: Array<{ count: string }> = await dataSource.query(
          `SELECT count(*)::text AS count FROM ${table} WHERE membership_id = $1`,
          [student.membershipId],
        );
        return Number(rows[0].count);
      };
      const before = [
        await countRows('daily_reports'),
        await countRows('weekly_reports'),
      ];

      await getMembershipPerformance(
        student.teacher,
        student.membershipId,
      ).expect(HttpStatus.OK);
      await getMembershipPerformance(
        student.teacher,
        student.membershipId,
      ).expect(HttpStatus.OK);

      expect([
        await countRows('daily_reports'),
        await countRows('weekly_reports'),
      ]).toEqual(before);
    });

    it('never leaks another student’s reports into the answer', async () => {
      const student = await enrolStudent();
      const groupmate = await registerAndLogin(UserRole.Student);
      const groupmateMembership = uuidv7();
      await dataSource.query(
        `INSERT INTO memberships (
           id, user_id, group_id, state, started_at, created_at, updated_at
         ) VALUES ($1, $2, $3, 'Active', $4::date, now(), now())`,
        [
          groupmateMembership,
          groupmate.userId,
          student.groupId,
          startedLongAgo,
        ],
      );
      for (let offset = 6; offset >= 1; offset -= 1) {
        await createNormalReport(groupmateMembership, shift(today, -offset));
      }

      const response = await getMembershipPerformance(
        student.teacher,
        student.membershipId,
      ).expect(HttpStatus.OK);

      expect(response.body.data.day_breakdown.no_report).toBe(6);
      expect(response.body.data.submission_rate).toBe(0);
    });
  });

  describe('scope and authorization (APIS §6.1, §10.9, SA §14)', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/memberships/${missingMembershipId}/performance`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('lets the assigned Teacher read a student of their own group', async () => {
      const student = await seedFixtureWeek();

      await getMembershipPerformance(
        student.teacher,
        student.membershipId,
      ).expect(HttpStatus.OK);
    });

    it('returns 403 SCOPE_DENIED to a Teacher of another group (AC-17, FR-PERF-06)', async () => {
      const student = await enrolStudent();
      const outsider = await enrolStudent();

      const response = await getMembershipPerformance(
        outsider.teacher,
        student.membershipId,
      ).expect(HttpStatus.FORBIDDEN);

      expect(response.body.error).toBe('SCOPE_DENIED');
      expect(response.body).not.toHaveProperty('data');
      expect(response.body.correlationId).toBeDefined();
    });

    it('masks a non-existent membership as the SAME 403 for a Teacher (NFR-20)', async () => {
      const student = await enrolStudent();

      const outOfScope = await getMembershipPerformance(
        student.teacher,
        (await enrolStudent()).membershipId,
      ).expect(HttpStatus.FORBIDDEN);
      const missing = await getMembershipPerformance(
        student.teacher,
        missingMembershipId,
      ).expect(HttpStatus.FORBIDDEN);

      expect(missing.body.error).toBe(outOfScope.body.error);
      expect(missing.body.message).toBe(outOfScope.body.message);
    });

    it('masks a Terminated membership of the Teacher’s OWN group as 403 (UC-16)', async () => {
      const student = await enrolStudent();
      await dataSource.query(
        `UPDATE memberships SET state = 'Terminated', ended_at = $2::date WHERE id = $1`,
        [student.membershipId, today],
      );

      const response = await getMembershipPerformance(
        student.teacher,
        student.membershipId,
      ).expect(HttpStatus.FORBIDDEN);

      expect(response.body.error).toBe('SCOPE_DENIED');
    });

    it('returns 403 to the Assistant UNCONDITIONALLY, even for their own group (DEC-B09)', async () => {
      const student = await seedFixtureWeek();

      const response = await getMembershipPerformance(
        student.assistant,
        student.membershipId,
      ).expect(HttpStatus.FORBIDDEN);

      expect(response.body.error).toBe('SCOPE_DENIED');
      expect(response.body).not.toHaveProperty('data');
      expect(response.body.correlationId).toBeDefined();
    });

    it('returns 403 to a User, who has no membership to read', async () => {
      const student = await enrolStudent();
      const user = await registerAndLogin(UserRole.User);

      const response = await getMembershipPerformance(
        user,
        student.membershipId,
      ).expect(HttpStatus.FORBIDDEN);

      expect(response.body.error).toBe('SCOPE_DENIED');
    });

    it('lets the Student read their OWN membership (APIS §6.1 ✓ own)', async () => {
      const student = await seedFixtureWeek();

      const ownRoute = await getMembershipPerformance(
        student,
        student.membershipId,
      ).expect(HttpStatus.OK);
      const meRoute = await getOwnPerformance(student).expect(HttpStatus.OK);

      expect(ownRoute.body).toEqual(meRoute.body);
    });

    it('returns 403 SCOPE_DENIED to a Student reading a groupmate’s membership', async () => {
      const student = await enrolStudent();
      const groupmate = await registerAndLogin(UserRole.Student);
      const groupmateMembership = uuidv7();
      await dataSource.query(
        `INSERT INTO memberships (
           id, user_id, group_id, state, started_at, created_at, updated_at
         ) VALUES ($1, $2, $3, 'Active', $4::date, now(), now())`,
        [
          groupmateMembership,
          groupmate.userId,
          student.groupId,
          startedLongAgo,
        ],
      );

      const response = await getMembershipPerformance(
        student,
        groupmateMembership,
      ).expect(HttpStatus.FORBIDDEN);

      expect(response.body.error).toBe('SCOPE_DENIED');
    });

    it('lets the Admin read any membership (DEC-C07 ScopeGuard bypass)', async () => {
      const student = await seedFixtureWeek();
      const admin = await registerAndLogin(UserRole.Admin);

      const response = await getMembershipPerformance(
        admin,
        student.membershipId,
      ).expect(HttpStatus.OK);

      expect(response.body.data.commitment_score).toBe(70);
    });

    it('answers 404 NOT_FOUND to the Admin for a membership that does not exist', async () => {
      const admin = await registerAndLogin(UserRole.Admin);

      const response = await getMembershipPerformance(
        admin,
        missingMembershipId,
      ).expect(HttpStatus.NOT_FOUND);

      expect(response.body.error).toBe('NOT_FOUND');
      expect(response.body).not.toHaveProperty('data');
    });

    it('answers 404 to a malformed id, before any scope lookup (APIS §9.6)', async () => {
      const student = await enrolStudent();
      const admin = await registerAndLogin(UserRole.Admin);

      for (const actor of [student.teacher, admin, student]) {
        const response = await getMembershipPerformance(
          actor,
          'not-a-uuid',
        ).expect(HttpStatus.NOT_FOUND);
        expect(response.body.error).toBe('NOT_FOUND');
      }
    });
  });

  describe('query validation (APIS §9.5, §10.9)', () => {
    let student: EnrolledStudent;

    beforeAll(async () => {
      student = await enrolStudent();
    });

    it('rejects period=custom without from/to with 422', async () => {
      const response = await getMembershipPerformance(
        student.teacher,
        student.membershipId,
        '?period=custom',
      ).expect(HttpStatus.UNPROCESSABLE_ENTITY);

      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'period' })]),
      );
    });

    it('rejects period=custom with only one bound', async () => {
      await getMembershipPerformance(
        student.teacher,
        student.membershipId,
        '?period=custom&from=2026-01-01',
      ).expect(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('rejects an unknown period value', async () => {
      const response = await getMembershipPerformance(
        student.teacher,
        student.membershipId,
        '?period=year',
      ).expect(HttpStatus.UNPROCESSABLE_ENTITY);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('rejects a malformed from date', async () => {
      await getMembershipPerformance(
        student.teacher,
        student.membershipId,
        '?period=custom&from=01-01-2026&to=2026-01-31',
      ).expect(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('accepts from/to on a non-custom period and ignores them', async () => {
      const plain = await getMembershipPerformance(
        student.teacher,
        student.membershipId,
        '?period=week',
      ).expect(HttpStatus.OK);
      const noisy = await getMembershipPerformance(
        student.teacher,
        student.membershipId,
        '?period=week&from=2020-01-01&to=2020-01-02',
      ).expect(HttpStatus.OK);

      expect(noisy.body).toEqual(plain.body);
    });

    it('scopes a custom range to the reporting weeks it touches', async () => {
      await createNormalReport(student.membershipId, shift(today, -40));

      const response = await getMembershipPerformance(
        student.teacher,
        student.membershipId,
        `?period=custom&from=${shift(today, -41)}&to=${shift(today, -39)}`,
      ).expect(HttpStatus.OK);

      expect(response.body.data.day_breakdown.normal).toBe(1);
    });
  });
});
