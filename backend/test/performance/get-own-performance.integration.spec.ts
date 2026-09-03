/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
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

interface TestActor {
  accessToken: string;
  userId: string;
}

const STUDENT_TIMEZONE = 'Africa/Tunis';

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

describe('GET /me/performance (F-PERF-01 / API-037 Integration)', () => {
  jest.setTimeout(120000);

  let app: INestApplication<App>;
  let dataSource: DataSource;

  const testEmailDomain = '@test-own-performance.com';
  const testGroupPrefix = 'F-PERF-01 test group';
  const mockMailer: IMailer = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  };

  const today = todayIn(STUDENT_TIMEZONE);
  const todayIsoDay = isoDay(today);
  /** Far enough back that no window under test is prorated (FR-WR-09). */
  const startedLongAgo = shift(today, -120);

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

  async function registerAndLogin(role: UserRole): Promise<TestActor> {
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

  async function createGroup(recitationDay: number): Promise<string> {
    const teacher = await registerAndLogin(UserRole.Teacher);
    const assistant = await registerAndLogin(UserRole.Assistant);
    const id = uuidv7();
    await dataSource.query(
      `INSERT INTO groups (
         id, name, gender, recitation_day, enrollment_status,
         lifecycle_state, teacher_id, assistant_id, created_by,
         created_at, updated_at
       ) VALUES ($1, $2, 'Male', $3, 'Closed', 'Active', $4, $5, $4, now(), now())`,
      [
        id,
        `${testGroupPrefix} ${uuidv7()}`,
        recitationDay,
        teacher.userId,
        assistant.userId,
      ],
    );
    return id;
  }

  /** A Student in a fresh group. Recitation day defaults to today's. */
  async function enrolStudent(
    options: { recitationDay?: number; startedAt?: string } = {},
  ): Promise<TestActor & { membershipId: string }> {
    const student = await registerAndLogin(UserRole.Student);
    const groupId = await createGroup(options.recitationDay ?? todayIsoDay);
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
    return { ...student, membershipId };
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

  function getPerformance(actor: TestActor, query = '') {
    return request(app.getHttpServer())
      .get(`/api/v1/me/performance${query}`)
      .set('Authorization', `Bearer ${actor.accessToken}`);
  }

  describe('the fixture week (SAS §18.3 over one reporting week)', () => {
    /**
     * Recitation day = today's, so the reporting week containing today is
     * today−6 … today and its six EXPECTED days are today−6 … today−1,
     * all already inside `EffectiveWindow(m)`:
     *
     *   today−6  NORMAL, memorised, 50 done, revised
     *   today−5  NORMAL, memorised, 50 NOT done, revised
     *   today−4  NORMAL, no memorization, revised
     *   today−3  REVISION
     *   today−2  ABSENT Sick        (leaves every denominator, BR-24)
     *   today−1  no report
     *
     *   |ExpectedDays| = 6 · |D_eff| = 5 · |D_memo| = 4 · memo days = 2
     *   submission   = (5−1)/5 = 80    memorization = (4−2)/4 = 50
     *   revision     = (5−1)/5 = 80    attendance   =  1/1    = 100
     *   quality      = (2−1)/2 = 50    score = mean(80,50,80,100) = 77.5
     */
    async function seedFixtureWeek(): Promise<
      TestActor & { membershipId: string }
    > {
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

    it('returns the whole API-037 payload inside the §9.1 envelope', async () => {
      const student = await seedFixtureWeek();

      const response = await getPerformance(student).expect(HttpStatus.OK);

      expect(response.body).toEqual({
        data: {
          commitment_score: 77.5,
          submission_rate: 80,
          memorization_rate: 50,
          revision_rate: 80,
          attendance_rate: 100,
          repetition_quality: 50,
          day_breakdown: {
            normal: 3,
            revision: 1,
            absent_excused: 1,
            absent_other: 0,
            no_report: 1,
          },
          // today−2 is the newest report; today−1 is the only expected day
          // after it (today itself is the recitation day, skipped).
          days_since_last_report: 1,
        },
      });
    });

    it('day_breakdown sums to the period’s expected days', async () => {
      const student = await seedFixtureWeek();

      const { day_breakdown } = (
        await getPerformance(student).expect(HttpStatus.OK)
      ).body.data;

      expect(
        Object.values(day_breakdown as Record<string, number>).reduce(
          (a, b) => a + b,
          0,
        ),
      ).toBe(6);
    });

    it('is identical for ?period=week and for the default', async () => {
      const student = await seedFixtureWeek();

      const explicit = await getPerformance(student, '?period=week').expect(
        HttpStatus.OK,
      );
      const implicit = await getPerformance(student).expect(HttpStatus.OK);

      expect(explicit.body).toEqual(implicit.body);
    });

    it('counts only Finalised weekly rows towards attendance (ST-06)', async () => {
      const student = await enrolStudent();
      await createNormalReport(student.membershipId, shift(today, -6));
      // No weekly row at all → W(P) = 1, attended = 0: a REAL 0 %, not null.
      const response = await getPerformance(student).expect(HttpStatus.OK);

      expect(response.body.data.attendance_rate).toBe(0);
    });

    it('never persists anything — DS-03 is recomputed on every call (DBD §68, TS §24)', async () => {
      const student = await seedFixtureWeek();

      await getPerformance(student).expect(HttpStatus.OK);
      await getPerformance(student).expect(HttpStatus.OK);

      const rows: Array<{ count: string }> = await dataSource.query(
        'SELECT count(*) AS count FROM weekly_reports WHERE membership_id = $1',
        [student.membershipId],
      );
      // Only the one row the fixture inserted; the read created none.
      expect(Number(rows[0].count)).toBe(1);

      // A new report changes the answer immediately — nothing is cached.
      await createNormalReport(student.membershipId, shift(today, -1));
      const after = await getPerformance(student).expect(HttpStatus.OK);
      expect(after.body.data.submission_rate).toBe(100);
      expect(after.body.data.days_since_last_report).toBe(0);
    });

    it('ignores soft-deleted reports and other students’ rows', async () => {
      const student = await enrolStudent();
      await createNormalReport(student.membershipId, shift(today, -6));
      await dataSource.query(
        'UPDATE daily_reports SET deleted_at = now() WHERE membership_id = $1',
        [student.membershipId],
      );

      const response = await getPerformance(student).expect(HttpStatus.OK);

      expect(response.body.data.day_breakdown.normal).toBe(0);
      expect(response.body.data.day_breakdown.no_report).toBe(6);
    });
  });

  describe('every period value (FR-PERF-03, APIS §9.3)', () => {
    /** One lone report 20 days back — outside this week, inside every wider window. */
    async function seedOneOldReport(): Promise<
      TestActor & { membershipId: string }
    > {
      const student = await enrolStudent({ startedAt: shift(today, -60) });
      await createNormalReport(student.membershipId, shift(today, -20));
      return student;
    }

    it('week sees only the current reporting week', async () => {
      const student = await seedOneOldReport();

      const { data } = (
        await getPerformance(student, '?period=week').expect(HttpStatus.OK)
      ).body;

      expect(data.day_breakdown).toEqual({
        normal: 0,
        revision: 0,
        absent_excused: 0,
        absent_other: 0,
        no_report: 6,
      });
      expect(data.submission_rate).toBe(0);
    });

    it('month widens the window and picks the older report up', async () => {
      const student = await seedOneOldReport();

      const week = (await getPerformance(student, '?period=week')).body.data;
      const month = (
        await getPerformance(student, '?period=month').expect(HttpStatus.OK)
      ).body.data;

      expect(month.day_breakdown.normal).toBe(1);
      expect(Number(month.day_breakdown.no_report)).toBeGreaterThan(
        Number(week.day_breakdown.no_report),
      );
    });

    it('3months widens it further still', async () => {
      const student = await seedOneOldReport();

      const month = (await getPerformance(student, '?period=month')).body.data;
      const quarter = (
        await getPerformance(student, '?period=3months').expect(HttpStatus.OK)
      ).body.data;

      expect(quarter.day_breakdown.normal).toBe(1);
      expect(Number(quarter.day_breakdown.no_report)).toBeGreaterThan(
        Number(month.day_breakdown.no_report),
      );
      // Clamped to [started_at, today] — never before the membership began.
      expect(quarter.day_breakdown.no_report).toBeLessThanOrEqual(60);
    });

    it('custom scopes to the caller’s own range, resolved to whole reporting weeks', async () => {
      const student = await seedOneOldReport();
      const day = shift(today, -20);

      const { data } = (
        await getPerformance(
          student,
          `?period=custom&from=${day}&to=${day}`,
        ).expect(HttpStatus.OK)
      ).body;

      // The one reporting week containing that day: six expected days, one
      // reported.
      expect(data.day_breakdown).toEqual({
        normal: 1,
        revision: 0,
        absent_excused: 0,
        absent_other: 0,
        no_report: 5,
      });
      expect(data.submission_rate).toBeCloseTo((1 / 6) * 100, 10);
    });

    it('reports days_since_last_report from today whatever the period asks for', async () => {
      const student = await seedOneOldReport();
      const day = shift(today, -20);

      const historical = (
        await getPerformance(
          student,
          `?period=custom&from=${day}&to=${day}`,
        ).expect(HttpStatus.OK)
      ).body.data;
      const week = (await getPerformance(student, '?period=week')).body.data;

      expect(historical.days_since_last_report).toBe(
        week.days_since_last_report,
      );
      // 20 days back, minus the ~3 recitation days in between.
      expect(historical.days_since_last_report).toBeGreaterThan(10);
    });
  });

  describe('nullable rates — DEC-B04 / API-X07, never 0 when undefined', () => {
    it('leaves submission, revision and memorization null when every expected day is excused', async () => {
      const student = await enrolStudent();
      for (let offset = 6; offset >= 1; offset -= 1) {
        await createAbsentReport(
          student.membershipId,
          shift(today, -offset),
          offset % 2 === 0 ? 'Sick' : 'Studying',
        );
      }

      const { data } = (await getPerformance(student).expect(HttpStatus.OK))
        .body;

      // |D_eff| = 0 → three undefined components (BR-24).
      expect(data.submission_rate).toBeNull();
      expect(data.revision_rate).toBeNull();
      expect(data.memorization_rate).toBeNull();
      expect(data.repetition_quality).toBeNull();
      // W(P) is still one week — attendance is a real 0 %, not null.
      expect(data.attendance_rate).toBe(0);
      expect(data.commitment_score).toBe(0);
      expect(data.day_breakdown.absent_excused).toBe(6);
    });

    it('leaves memorization null on a week of Revision days while submission stays defined', async () => {
      const student = await enrolStudent();
      for (let offset = 6; offset >= 1; offset -= 1) {
        await createRevisionReport(student.membershipId, shift(today, -offset));
      }

      const { data } = (await getPerformance(student).expect(HttpStatus.OK))
        .body;

      // |D_memo| = 0 (BR-27, BR-28a) but |D_eff| = 6.
      expect(data.memorization_rate).toBeNull();
      expect(data.submission_rate).toBe(100);
      expect(data.revision_rate).toBe(100);
      expect(data.repetition_quality).toBeNull();
    });

    it('leaves repetition_quality null when memorization was expected but never happened', async () => {
      const student = await enrolStudent();
      for (let offset = 6; offset >= 1; offset -= 1) {
        await createNormalReport(student.membershipId, shift(today, -offset), {
          memo: false,
        });
      }

      const { data } = (await getPerformance(student).expect(HttpStatus.OK))
        .body;

      // Memorization days = 0 → quality undefined; the RATE is a real 0 %.
      expect(data.repetition_quality).toBeNull();
      expect(data.memorization_rate).toBe(0);
      expect(data.submission_rate).toBe(100);
    });

    it('leaves attendance_rate and the whole score null when the period is empty', async () => {
      const student = await enrolStudent({ startedAt: shift(today, -10) });
      await createNormalReport(student.membershipId, shift(today, -6));

      // A window entirely before the membership existed: W(P) = ∅.
      const { data } = (
        await getPerformance(
          student,
          '?period=custom&from=2020-01-01&to=2020-01-31',
        ).expect(HttpStatus.OK)
      ).body;

      expect(data).toEqual({
        commitment_score: null,
        submission_rate: null,
        memorization_rate: null,
        revision_rate: null,
        attendance_rate: null,
        repetition_quality: null,
        day_breakdown: {
          normal: 0,
          revision: 0,
          absent_excused: 0,
          absent_other: 0,
          no_report: 0,
        },
        days_since_last_report: expect.any(Number),
      });
    });

    it('never returns 0 in place of an undefined rate on a brand-new membership', async () => {
      // Started today, and today is the recitation day: no expected day
      // exists yet (EC-13), but the week itself is in W(P).
      const student = await enrolStudent({ startedAt: today });

      const { data } = (await getPerformance(student).expect(HttpStatus.OK))
        .body;

      expect(data.submission_rate).toBeNull();
      expect(data.memorization_rate).toBeNull();
      expect(data.revision_rate).toBeNull();
      expect(data.repetition_quality).toBeNull();
      expect(data.days_since_last_report).toBe(0);
    });
  });

  describe('query validation (APIS §9.5, §10.9)', () => {
    it('rejects period=custom without from/to with 422', async () => {
      const student = await enrolStudent();

      const response = await getPerformance(student, '?period=custom').expect(
        HttpStatus.UNPROCESSABLE_ENTITY,
      );

      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'period' })]),
      );
      expect(response.body.correlationId).toBeDefined();
    });

    it('rejects period=custom with only one bound', async () => {
      const student = await enrolStudent();

      await getPerformance(student, '?period=custom&from=2026-01-01').expect(
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    });

    it('rejects an unknown period value', async () => {
      const student = await enrolStudent();

      const response = await getPerformance(student, '?period=year').expect(
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('rejects a malformed from date', async () => {
      const student = await enrolStudent();

      await getPerformance(
        student,
        '?period=custom&from=01-01-2026&to=2026-02-01',
      ).expect(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('accepts from/to on a non-custom period and ignores them', async () => {
      const student = await enrolStudent();
      await createNormalReport(student.membershipId, shift(today, -6));

      const plain = await getPerformance(student, '?period=week').expect(
        HttpStatus.OK,
      );
      const noisy = await getPerformance(
        student,
        '?period=week&from=2020-01-01&to=2020-01-02',
      ).expect(HttpStatus.OK);

      expect(noisy.body).toEqual(plain.body);
    });
  });

  describe('scope and authorization (APIS §6.1, SA §14)', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/me/performance')
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

        const response = await getPerformance(actor).expect(
          HttpStatus.FORBIDDEN,
        );

        expect(response.body.statusCode).toBe(HttpStatus.FORBIDDEN);
        expect(response.body.error).toBe('SCOPE_DENIED');
        expect(response.body).not.toHaveProperty('data');
        expect(response.body.correlationId).toBeDefined();
      },
    );

    it('answers 404 NOT_FOUND to a Student with no Active membership', async () => {
      const student = await registerAndLogin(UserRole.Student);

      const response = await getPerformance(student).expect(
        HttpStatus.NOT_FOUND,
      );
      expect(response.body.error).toBe('NOT_FOUND');
    });

    it('sees only its own membership’s reports', async () => {
      const student = await enrolStudent();
      const groupRows: Array<{ group_id: string }> = await dataSource.query(
        'SELECT group_id FROM memberships WHERE id = $1',
        [student.membershipId],
      );
      const groupmate = await registerAndLogin(UserRole.Student);
      const groupmateMembership = uuidv7();
      await dataSource.query(
        `INSERT INTO memberships (
           id, user_id, group_id, state, started_at, created_at, updated_at
         ) VALUES ($1, $2, $3, 'Active', $4::date, now(), now())`,
        [
          groupmateMembership,
          groupmate.userId,
          groupRows[0].group_id,
          startedLongAgo,
        ],
      );
      for (let offset = 6; offset >= 1; offset -= 1) {
        await createNormalReport(groupmateMembership, shift(today, -offset));
      }

      const response = await getPerformance(student).expect(HttpStatus.OK);

      expect(response.body.data.day_breakdown.no_report).toBe(6);
      expect(response.body.data.submission_rate).toBe(0);
    });
  });
});
