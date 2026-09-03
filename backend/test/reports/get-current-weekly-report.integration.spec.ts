/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
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
import { stopScheduledJobs } from '../shared/scheduled-jobs';

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

/** Independent UTC date arithmetic on a YYYY-MM-DD value. */
function shift(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

type WeeklyReportRow = {
  id: string;
  week_start: string;
  week_end: string;
  expected_days: number;
  missed_daily_reports: number;
  missed_daily_memorization: number;
  missed_daily_revision: number;
  missed_50_repetitions: number;
  missed_single_session: number;
  attended_recitation_call: boolean;
  state: string;
  finalised_at: string | null;
  finalised_by: string | null;
};

describe('GET /weekly-reports/current (F-WR-01 / API-033 Integration)', () => {
  jest.setTimeout(60000);

  let app: INestApplication<App>;
  let dataSource: DataSource;

  const testEmailDomain = '@test-current-weekly-report.com';
  const testGroupPrefix = 'F-WR-01 test group';
  const mockMailer: IMailer = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  };

  const today = todayIn(STUDENT_TIMEZONE);
  const todayIsoDay = isoDay(today);
  /** Membership start safely before any week under test (FR-WR-09 stays out of the way). */
  const startedLongAgo = shift(today, -30);

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

  async function createGroup(options: {
    recitationDay: number;
    archivedAt?: Date;
  }): Promise<string> {
    const teacher = await registerAndLogin(UserRole.Teacher);
    const assistant = await registerAndLogin(UserRole.Assistant);
    const id = uuidv7();
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
        options.archivedAt ? 'Archived' : 'Active',
        options.archivedAt ?? null,
        teacher.userId,
        assistant.userId,
      ],
    );
    return id;
  }

  async function createMembership(options: {
    userId: string;
    groupId: string;
    state?: 'Active' | 'Terminated';
    startedAt?: string;
  }): Promise<string> {
    const id = uuidv7();
    const state = options.state ?? 'Active';
    await dataSource.query(
      `INSERT INTO memberships (
         id, user_id, group_id, state, started_at, ended_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5::date, $6, now(), now())`,
      [
        id,
        options.userId,
        options.groupId,
        state,
        options.startedAt ?? startedLongAgo,
        state === 'Terminated' ? shift(today, -1) : null,
      ],
    );
    return id;
  }

  /** A Student enrolled in a fresh group with the given recitation day. */
  async function enrolStudent(options: {
    recitationDay: number;
    startedAt?: string;
    archivedAt?: Date;
  }): Promise<TestActor & { membershipId: string }> {
    const student = await registerAndLogin(UserRole.Student);
    const groupId = await createGroup({
      recitationDay: options.recitationDay,
      archivedAt: options.archivedAt,
    });
    const membershipId = await createMembership({
      userId: student.userId,
      groupId,
      startedAt: options.startedAt,
    });
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
    singleSession?: boolean;
    revision?: boolean;
    deleted?: boolean;
  }

  async function createNormalReport(
    membershipId: string,
    reportDate: string,
    options: NormalOptions = {},
  ): Promise<void> {
    const memo = options.memo ?? true;
    const revision = options.revision ?? true;
    const completed50 = memo ? (options.completed50 ?? true) : null;
    const singleSession = memo
      ? completed50
        ? (options.singleSession ?? true)
        : false
      : null;
    await dataSource.query(
      `INSERT INTO daily_reports (
         id, membership_id, report_date, type, submitted_timezone,
         no_memorization_today, memo_from_ordinal, memo_to_ordinal,
         memo_time_from, memo_time_to, completed_50_repetitions,
         repetitions_in_single_session, no_revision_today,
         rev_from_ordinal, rev_to_ordinal, rev_time_from, rev_time_to,
         read_tafsir, deleted_at
       ) VALUES (
         $1, $2, $3::date, 'Normal', $4,
         $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, false, $17
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
        options.deleted ? new Date() : null,
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

  async function weeklyRowsOf(
    membershipId: string,
  ): Promise<WeeklyReportRow[]> {
    return dataSource.query(
      `SELECT id, week_start::text AS week_start, week_end::text AS week_end,
              expected_days, missed_daily_reports, missed_daily_memorization,
              missed_daily_revision, missed_50_repetitions, missed_single_session,
              attended_recitation_call, state, finalised_at, finalised_by
         FROM weekly_reports WHERE membership_id = $1`,
      [membershipId],
    );
  }

  function getCurrent(actor: TestActor) {
    return request(app.getHttpServer())
      .get('/api/v1/weekly-reports/current')
      .set('Authorization', `Bearer ${actor.accessToken}`);
  }

  describe('before the recitation day (live, DBD §14 / ADR-003)', () => {
    // Recitation day two days ahead: the week runs today−4 … today+2 and
    // only today−4 … today are expected so far (EffectiveWindow ends today).
    const weekEnd = shift(today, 2);
    const weekStart = shift(today, -4);
    const recitationDay = isoDay(weekEnd);

    it('returns the live metrics with id null, can_confirm false and writes no row', async () => {
      const student = await enrolStudent({ recitationDay });
      await createNormalReport(student.membershipId, shift(today, -1));

      const response = await getCurrent(student).expect(HttpStatus.OK);

      expect(response.body).toEqual({
        data: {
          id: null,
          week_start: weekStart,
          week_end: weekEnd,
          expected_days: 5,
          missed_daily_reports: 4,
          missed_daily_memorization: 4,
          missed_daily_revision: 4,
          missed_50_repetitions: 0,
          missed_single_session: 0,
          attended_recitation_call: false,
          state: 'Open',
          can_confirm: false,
        },
      });
      expect(await weeklyRowsOf(student.membershipId)).toEqual([]);
    });

    it('re-computes on every read as the inputs change today', async () => {
      const student = await enrolStudent({ recitationDay });

      const before = await getCurrent(student).expect(HttpStatus.OK);
      expect(before.body.data.missed_daily_reports).toBe(5);

      await createAbsentReport(student.membershipId, today, 'Sick');

      const after = await getCurrent(student).expect(HttpStatus.OK);
      expect(after.body.data).toMatchObject({
        id: null,
        expected_days: 5,
        missed_daily_reports: 4,
        can_confirm: false,
      });
    });

    it('ignores soft-deleted reports (partial DB-UQ-04 semantics) and other students', async () => {
      const student = await enrolStudent({ recitationDay });
      await createNormalReport(student.membershipId, shift(today, -2), {
        deleted: true,
      });
      const groupmate = await registerAndLogin(UserRole.Student);
      const groupRows: Array<{ group_id: string }> = await dataSource.query(
        'SELECT group_id FROM memberships WHERE id = $1',
        [student.membershipId],
      );
      const groupmateMembership = await createMembership({
        userId: groupmate.userId,
        groupId: groupRows[0].group_id,
      });
      await createNormalReport(groupmateMembership, shift(today, -3));

      const response = await getCurrent(student).expect(HttpStatus.OK);
      expect(response.body.data.missed_daily_reports).toBe(5);
    });

    it('prorates expected days from started_at for a membership that began mid-week (FR-WR-09)', async () => {
      const student = await enrolStudent({
        recitationDay,
        startedAt: shift(today, -1),
      });

      const response = await getCurrent(student).expect(HttpStatus.OK);
      expect(response.body.data).toMatchObject({
        expected_days: 2,
        missed_daily_reports: 2,
      });
    });
  });

  describe('on the recitation day (stored row, DBD §14 / ST-06)', () => {
    const weekStart = shift(today, -6);
    const d = (offset: number) => shift(today, offset);

    it('creates the weekly_reports row lazily on first read with the six metrics stored NOT NULL, can_confirm true', async () => {
      const student = await enrolStudent({ recitationDay: todayIsoDay });
      // Every DayClassification across the six memorisation days:
      //   today−6 NORMAL (50 done, split sessions) → missed_single_session
      //   today−5 NORMAL (memo, 50 missed, no revision) → missed_50 + missed_revision
      //   today−4 REVISION
      //   today−3 ABSENT_EXCUSED (Sick)
      //   today−2 ABSENT_OTHER
      //   today−1 NO_REPORT
      await createNormalReport(student.membershipId, d(-6), {
        singleSession: false,
      });
      await createNormalReport(student.membershipId, d(-5), {
        completed50: false,
        revision: false,
      });
      await createRevisionReport(student.membershipId, d(-4));
      await createAbsentReport(student.membershipId, d(-3), 'Sick');
      await createAbsentReport(student.membershipId, d(-2), 'Other');

      const response = await getCurrent(student).expect(HttpStatus.OK);

      const expected = {
        week_start: weekStart,
        week_end: today,
        expected_days: 6,
        missed_daily_reports: 1,
        missed_daily_memorization: 2,
        missed_daily_revision: 3,
        missed_50_repetitions: 1,
        missed_single_session: 1,
        attended_recitation_call: false,
        state: 'Open',
        can_confirm: true,
      };
      expect(response.body).toEqual({
        data: { id: expect.any(String), ...expected },
      });

      const rows = await weeklyRowsOf(student.membershipId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({
        id: response.body.data.id,
        week_start: weekStart,
        week_end: today,
        expected_days: 6,
        missed_daily_reports: 1,
        missed_daily_memorization: 2,
        missed_daily_revision: 3,
        missed_50_repetitions: 1,
        missed_single_session: 1,
        attended_recitation_call: false,
        state: 'Open',
        finalised_at: null,
        finalised_by: null,
      });
    });

    it('returns the same row on a second read and never recomputes it (metrics frozen at creation)', async () => {
      const student = await enrolStudent({ recitationDay: todayIsoDay });
      await createNormalReport(student.membershipId, d(-1));

      const first = await getCurrent(student).expect(HttpStatus.OK);
      expect(first.body.data.missed_daily_reports).toBe(5);

      // Backdating is impossible through the API (BR-21); a raw insert
      // simulates any later change of the inputs to prove the snapshot holds.
      await createNormalReport(student.membershipId, d(-2));

      const second = await getCurrent(student).expect(HttpStatus.OK);
      expect(second.body.data).toEqual(first.body.data);
      expect(await weeklyRowsOf(student.membershipId)).toHaveLength(1);
    });

    it('serves a pre-existing row created on entering the day (no duplicate, DB-UQ-05)', async () => {
      const student = await enrolStudent({ recitationDay: todayIsoDay });
      const id = uuidv7();
      await dataSource.query(
        `INSERT INTO weekly_reports (
           id, membership_id, week_start, week_end, expected_days,
           missed_daily_reports, missed_daily_memorization, missed_daily_revision,
           missed_50_repetitions, missed_single_session
         ) VALUES ($1, $2, $3::date, $4::date, 6, 2, 3, 4, 1, 0)`,
        [id, student.membershipId, weekStart, today],
      );

      const response = await getCurrent(student).expect(HttpStatus.OK);
      expect(response.body.data).toEqual({
        id,
        week_start: weekStart,
        week_end: today,
        expected_days: 6,
        missed_daily_reports: 2,
        missed_daily_memorization: 3,
        missed_daily_revision: 4,
        missed_50_repetitions: 1,
        missed_single_session: 0,
        attended_recitation_call: false,
        state: 'Open',
        can_confirm: true,
      });
      expect(await weeklyRowsOf(student.membershipId)).toHaveLength(1);
    });

    it('never offers confirmation on a Finalised row (VR-36, EC-24)', async () => {
      const student = await enrolStudent({ recitationDay: todayIsoDay });
      const id = uuidv7();
      await dataSource.query(
        `INSERT INTO weekly_reports (
           id, membership_id, week_start, week_end, expected_days,
           missed_daily_reports, missed_daily_memorization, missed_daily_revision,
           missed_50_repetitions, missed_single_session, attended_recitation_call,
           state, finalised_at, finalised_by
         ) VALUES ($1, $2, $3::date, $4::date, 6, 0, 0, 0, 0, 0, true, 'Finalised', now(), $5)`,
        [id, student.membershipId, weekStart, today, student.userId],
      );

      const response = await getCurrent(student).expect(HttpStatus.OK);
      expect(response.body.data).toMatchObject({
        id,
        attended_recitation_call: true,
        state: 'Finalised',
        can_confirm: false,
      });
    });

    it('zero-denominator week: all six days excused → every metric 0, expected_days 6 (UC-06 3a, DEC-B04)', async () => {
      const student = await enrolStudent({ recitationDay: todayIsoDay });
      for (const offset of [-6, -5, -4, -3, -2, -1]) {
        await createAbsentReport(
          student.membershipId,
          d(offset),
          offset % 2 === 0 ? 'Sick' : 'Studying',
        );
      }

      const response = await getCurrent(student).expect(HttpStatus.OK);
      expect(response.body.data).toMatchObject({
        id: expect.any(String),
        expected_days: 6,
        missed_daily_reports: 0,
        missed_daily_memorization: 0,
        missed_daily_revision: 0,
        missed_50_repetitions: 0,
        missed_single_session: 0,
        can_confirm: true,
      });
    });

    it('zero-submission week is produced with every daily miss counted (FR-WR-08, DEC-A07)', async () => {
      const student = await enrolStudent({ recitationDay: todayIsoDay });

      const response = await getCurrent(student).expect(HttpStatus.OK);
      expect(response.body.data).toMatchObject({
        id: expect.any(String),
        expected_days: 6,
        missed_daily_reports: 6,
        missed_daily_memorization: 6,
        missed_daily_revision: 6,
        missed_50_repetitions: 0,
        missed_single_session: 0,
      });
    });

    it('stores expected_days = 0 for a membership that starts on the recitation day (EC-13)', async () => {
      const student = await enrolStudent({
        recitationDay: todayIsoDay,
        startedAt: today,
      });

      const response = await getCurrent(student).expect(HttpStatus.OK);
      expect(response.body.data).toMatchObject({
        id: expect.any(String),
        expected_days: 0,
        missed_daily_reports: 0,
        can_confirm: true,
      });
      expect(await weeklyRowsOf(student.membershipId)).toHaveLength(1);
    });

    it('produces no row for an Archived group — live, truncated at archived_at (BR-42, FR-WR-10)', async () => {
      // Archived at noon (student-local) three days ago: today−6 … today−3 expected.
      const archivedAt = new Date(`${d(-3)}T12:00:00+01:00`);
      const student = await enrolStudent({
        recitationDay: todayIsoDay,
        archivedAt,
      });

      const response = await getCurrent(student).expect(HttpStatus.OK);
      expect(response.body.data).toMatchObject({
        id: null,
        expected_days: 4,
        missed_daily_reports: 4,
        can_confirm: false,
      });
      expect(await weeklyRowsOf(student.membershipId)).toEqual([]);
    });
  });

  describe('scope (own Active membership only)', () => {
    it('answers 404 NOT_FOUND to a Student whose only membership is Terminated', async () => {
      const student = await registerAndLogin(UserRole.Student);
      const groupId = await createGroup({ recitationDay: todayIsoDay });
      await createMembership({
        userId: student.userId,
        groupId,
        state: 'Terminated',
      });

      const response = await getCurrent(student).expect(HttpStatus.NOT_FOUND);
      expect(response.body.error).toBe('NOT_FOUND');
      expect(response.body).not.toHaveProperty('data');
      expect(response.body.correlationId).toBeDefined();
    });

    it('answers 404 NOT_FOUND to a Student with no membership at all', async () => {
      const student = await registerAndLogin(UserRole.Student);

      const response = await getCurrent(student).expect(HttpStatus.NOT_FOUND);
      expect(response.body.error).toBe('NOT_FOUND');
    });
  });

  describe('authorization (APIS §6.1, TS §36)', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/weekly-reports/current')
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

        const response = await getCurrent(actor).expect(HttpStatus.FORBIDDEN);

        expect(response.body.statusCode).toBe(HttpStatus.FORBIDDEN);
        expect(response.body.error).toBe('SCOPE_DENIED');
        expect(response.body).not.toHaveProperty('data');
        expect(response.body.correlationId).toBeDefined();
      },
    );
  });
});
