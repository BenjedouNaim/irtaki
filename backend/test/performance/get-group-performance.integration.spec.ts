/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
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

interface TestGroup {
  id: string;
  teacher: TestActor;
  assistant: TestActor;
}

const STUDENT_TIMEZONE = 'Africa/Tunis';

/** Independent computation of "today" in the actor's timezone (T-01). */
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

describe('GET /groups/{id}/performance (F-PERF-02 / API-038 Integration)', () => {
  jest.setTimeout(180000);

  let app: INestApplication<App>;
  let dataSource: DataSource;

  const testEmailDomain = '@test-group-performance.com';
  const testGroupPrefix = 'F-PERF-02 test group';
  const mockMailer: IMailer = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  };

  const today = todayIn(STUDENT_TIMEZONE);
  const todayIsoDay = isoDay(today);
  /** Far enough back that no window under test is prorated (FR-WR-09). */
  const startedLongAgo = shift(today, -120);

  /**
   * The staff actors are registered ONCE for the whole suite: every group
   * below reuses them, so the run costs a handful of argon2 passes rather
   * than one per fixture group (TS §16).
   */
  let sharedTeacher: TestActor;
  let sharedAssistant: TestActor;
  let otherTeacher: TestActor;
  let admin: TestActor;

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

    sharedTeacher = await registerAndLogin(UserRole.Teacher);
    sharedAssistant = await registerAndLogin(UserRole.Assistant);
    otherTeacher = await registerAndLogin(UserRole.Teacher);
    admin = await registerAndLogin(UserRole.Admin);
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

  /**
   * A Student row inserted directly. Students never authenticate in this
   * suite — only the staff actors do — so hashing a password for each one
   * would buy nothing and cost an argon2 pass per member (TS §16's ~250ms
   * work factor).
   */
  async function createStudentUser(fullName: string): Promise<string> {
    const id = uuidv7();
    await dataSource.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, gender, timezone)
       VALUES ($1, $2, 'not-a-login-in-this-suite', 'Student', $3, 'Male', $4)`,
      [id, `student-${id}${testEmailDomain}`, fullName, STUDENT_TIMEZONE],
    );
    return id;
  }

  /**
   * A group whose recitation day is today's, so the running week is
   * today−6…today. The staff pair is shared across the suite unless a test
   * needs a second Teacher for the out-of-scope case.
   */
  async function createGroup(staff?: {
    teacher: TestActor;
    assistant: TestActor;
  }): Promise<TestGroup> {
    const teacher = staff?.teacher ?? sharedTeacher;
    const assistant = staff?.assistant ?? sharedAssistant;
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
        todayIsoDay,
        teacher.userId,
        assistant.userId,
      ],
    );
    return { id, teacher, assistant };
  }

  /** One member of a group, Active unless `endedAt` says otherwise. */
  async function enrol(
    groupId: string,
    options: {
      fullName?: string;
      startedAt?: string;
      endedAt?: string;
    } = {},
  ): Promise<{ membershipId: string; userId: string }> {
    const userId = await createStudentUser(
      options.fullName ?? `طالب ${uuidv7().slice(0, 6)}`,
    );
    const membershipId = uuidv7();
    await dataSource.query(
      `INSERT INTO memberships (
         id, user_id, group_id, state, started_at, ended_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5::date, $6::date, now(), now())`,
      [
        membershipId,
        userId,
        groupId,
        options.endedAt ? 'Terminated' : 'Active',
        options.startedAt ?? startedLongAgo,
        options.endedAt ?? null,
      ],
    );
    return { membershipId, userId };
  }

  async function ordinalOf(surah: number, ayah: number): Promise<number> {
    const rows: Array<{ ordinal_offset: number | string }> =
      await dataSource.query(
        'SELECT ordinal_offset FROM surahs WHERE number = $1',
        [surah],
      );
    return Number(rows[0].ordinal_offset) + ayah;
  }

  async function createNormalReport(
    membershipId: string,
    reportDate: string,
  ): Promise<void> {
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
         false, $5, $6, '18:00', '18:45', true, true, false, $7, $8,
         '19:00', '19:10', false
       )`,
      [
        uuidv7(),
        membershipId,
        reportDate,
        STUDENT_TIMEZONE,
        await ordinalOf(2, 1),
        await ordinalOf(2, 20),
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

  /**
   * The soft-delete cascade `DELETE /memberships/{id}` runs on termination
   * (`MembershipRepository.terminate`, SAS §20.2). Reproduced verbatim so a
   * "removed student" fixture is genuinely removed.
   */
  async function cascadeSoftDelete(membershipId: string): Promise<void> {
    await dataSource.query(
      `UPDATE daily_reports SET deleted_at = now()
        WHERE membership_id = $1 AND deleted_at IS NULL`,
      [membershipId],
    );
    await dataSource.query(
      `UPDATE weekly_reports SET deleted_at = now()
        WHERE membership_id = $1 AND deleted_at IS NULL`,
      [membershipId],
    );
  }

  function getGroupPerformance(actor: TestActor, groupId: string, query = '') {
    return request(app.getHttpServer())
      .get(`/api/v1/groups/${groupId}/performance${query}`)
      .set('Authorization', `Bearer ${actor.accessToken}`);
  }

  /**
   * The six expected days of the running week — today−6 … today−1. Today is
   * the recitation day and is never an expected day (BR-45, DEC-A03).
   */
  const EXPECTED_DAYS = [6, 5, 4, 3, 2, 1].map((offset) =>
    shift(today, -offset),
  );

  describe('weakest-first ordering and the four figures (UF §17, AC-15)', () => {
    /**
     * Three members of one group over the running week:
     *   perfect — a report on all six expected days      → 100
     *   middling — reports on three of them              →  50
     *   silent  — no report at all                       →   0
     * Attendance is undefined for all three (the week has not reached its
     * recitation day, DEC-A03), so each score is the mean of the three
     * daily components.
     */
    async function seedGroup() {
      const group = await createGroup();
      const perfect = await enrol(group.id, { fullName: 'الطالب المثالي' });
      const middling = await enrol(group.id, { fullName: 'الطالب المتوسط' });
      const silent = await enrol(group.id, { fullName: 'الطالب الصامت' });

      for (const date of EXPECTED_DAYS) {
        await createNormalReport(perfect.membershipId, date);
      }
      for (const date of EXPECTED_DAYS.slice(0, 3)) {
        await createNormalReport(middling.membershipId, date);
      }

      return { group, perfect, middling, silent };
    }

    it('returns the whole API-038 payload inside the §9.1 envelope', async () => {
      const { group, perfect, middling, silent } = await seedGroup();

      const response = await getGroupPerformance(
        group.teacher,
        group.id,
      ).expect(HttpStatus.OK);

      expect(response.body).toEqual({
        data: {
          commitment_average: 50,
          students: [
            {
              membership_id: silent.membershipId,
              full_name: 'الطالب الصامت',
              commitment_score: 0,
            },
            {
              membership_id: middling.membershipId,
              full_name: 'الطالب المتوسط',
              commitment_score: 50,
            },
            {
              membership_id: perfect.membershipId,
              full_name: 'الطالب المثالي',
              commitment_score: 100,
            },
          ],
          absence_breakdown: { sick: 0, studying: 0, other: 0 },
          // Pooled over the member set: 9 reported of 18 effective days.
          submission_rate: 50,
        },
      });
    });

    it('sorts strictly ascending — the weakest student is always first', async () => {
      const { group } = await seedGroup();

      const { data } = (
        await getGroupPerformance(group.teacher, group.id).expect(HttpStatus.OK)
      ).body;

      const scores = data.students.map(
        (s: { commitment_score: number }) => s.commitment_score,
      );
      expect(scores).toEqual([...scores].sort((a, b) => a - b));
    });

    it('places a student with no data last, never as the weakest (DEC-B04)', async () => {
      const { group, silent } = await seedGroup();
      // Joins tomorrow: no expected day of this week is inside their window,
      // so every component is undefined and the score is null.
      const newcomer = await enrol(group.id, {
        fullName: 'طالب جديد',
        startedAt: shift(today, 1),
      });

      const { data } = (
        await getGroupPerformance(group.teacher, group.id).expect(HttpStatus.OK)
      ).body;

      expect(data.students[0].membership_id).toBe(silent.membershipId);
      expect(data.students[data.students.length - 1]).toEqual({
        membership_id: newcomer.membershipId,
        full_name: 'طالب جديد',
        commitment_score: null,
      });
      // The null member is skipped by the average, never counted as a zero.
      expect(data.commitment_average).toBe(50);
    });

    it('breaks down the absences by VR-19 reason (UC-07 step 4)', async () => {
      const group = await createGroup();
      const student = await enrol(group.id);
      await createAbsentReport(student.membershipId, EXPECTED_DAYS[0], 'Sick');
      await createAbsentReport(
        student.membershipId,
        EXPECTED_DAYS[1],
        'Studying',
      );
      await createAbsentReport(student.membershipId, EXPECTED_DAYS[2], 'Other');
      await createNormalReport(student.membershipId, EXPECTED_DAYS[3]);

      const { data } = (
        await getGroupPerformance(group.teacher, group.id).expect(HttpStatus.OK)
      ).body;

      expect(data.absence_breakdown).toEqual({
        sick: 1,
        studying: 1,
        other: 1,
      });
      // Sick + Studying leave every denominator (BR-24): 4 effective days,
      // 2 of them unreported.
      expect(data.submission_rate).toBe(50);
    });

    it('answers an empty group without a zero-division artefact (UC-07 3a)', async () => {
      const group = await createGroup();

      const { data } = (
        await getGroupPerformance(group.teacher, group.id).expect(HttpStatus.OK)
      ).body;

      expect(data).toEqual({
        commitment_average: null,
        students: [],
        absence_breakdown: { sick: 0, studying: 0, other: 0 },
        submission_rate: null,
      });
    });

    it('says "not enough data" when every member score is null (UC-07 5a)', async () => {
      const group = await createGroup();
      await enrol(group.id, { startedAt: shift(today, 1) });
      await enrol(group.id, { startedAt: shift(today, 2) });

      const { data } = (
        await getGroupPerformance(group.teacher, group.id).expect(HttpStatus.OK)
      ).body;

      expect(data.commitment_average).toBeNull();
      expect(data.submission_rate).toBeNull();
      expect(data.students).toHaveLength(2);
    });

    it('never persists anything — every figure is recomputed per call (TS §24)', async () => {
      const { group } = await seedGroup();

      await getGroupPerformance(group.teacher, group.id).expect(HttpStatus.OK);
      await getGroupPerformance(group.teacher, group.id).expect(HttpStatus.OK);

      const rows: Array<{ count: string }> = await dataSource.query(
        `SELECT count(*) AS count FROM weekly_reports
          WHERE membership_id IN (SELECT id FROM memberships WHERE group_id = $1)`,
        [group.id],
      );
      expect(Number(rows[0].count)).toBe(0);
    });
  });

  /**
   * The rule this feature exists to get right, exercised end to end on ONE
   * fixture group holding one Active and one Terminated member — the same
   * two rows, read through both branches (APIS §10.9, FR-PERF-09/10).
   */
  describe('the member set: FR-PERF-09 vs the FR-PERF-10 current-week exception', () => {
    async function seedMixedGroup() {
      const group = await createGroup();
      const active = await enrol(group.id, { fullName: 'عضو نشط' });
      // Removed two days ago — INSIDE the running week, so its active
      // window plainly intersects that week.
      const terminated = await enrol(group.id, {
        fullName: 'عضو مُزال',
        endedAt: shift(today, -2),
      });

      for (const date of EXPECTED_DAYS) {
        await createNormalReport(active.membershipId, date);
        await createNormalReport(terminated.membershipId, date);
      }

      // The real removal path stamps `deleted_at` on the removed member's
      // reports (SAS §20.2 "Scope", DEC-B10) — reproduced here so these
      // fixtures test FR-PERF-09 against the data an actual termination
      // leaves behind, not against rows a global soft-delete filter would
      // still happen to see.
      await cascadeSoftDelete(terminated.membershipId);

      return { group, active, terminated };
    }

    it('excludes the terminated member ENTIRELY from the current week (FR-PERF-10)', async () => {
      const { group, active, terminated } = await seedMixedGroup();

      const { data } = (
        await getGroupPerformance(
          group.teacher,
          group.id,
          '?period=week',
        ).expect(HttpStatus.OK)
      ).body;

      expect(
        data.students.map((s: { membership_id: string }) => s.membership_id),
      ).toEqual([active.membershipId]);
      expect(data.students).not.toContainEqual(
        expect.objectContaining({ membership_id: terminated.membershipId }),
      );
    });

    it('takes the same branch when ?period= is omitted (UC-07 step 1 default)', async () => {
      const { group } = await seedMixedGroup();

      const implicit = await getGroupPerformance(
        group.teacher,
        group.id,
      ).expect(HttpStatus.OK);
      const explicit = await getGroupPerformance(
        group.teacher,
        group.id,
        '?period=week',
      ).expect(HttpStatus.OK);

      expect(implicit.body).toEqual(explicit.body);
      expect(implicit.body.data.students).toHaveLength(1);
    });

    it('INCLUDES that same terminated member on a wider period (FR-PERF-09)', async () => {
      const { group, active, terminated } = await seedMixedGroup();

      const { data } = (
        await getGroupPerformance(
          group.teacher,
          group.id,
          '?period=month',
        ).expect(HttpStatus.OK)
      ).body;

      expect(
        data.students
          .map((s: { membership_id: string }) => s.membership_id)
          .sort(),
      ).toEqual([active.membershipId, terminated.membershipId].sort());
    });

    it('counts a terminated member only for the days it was active', async () => {
      const { group, terminated } = await seedMixedGroup();

      const { data } = (
        await getGroupPerformance(
          group.teacher,
          group.id,
          '?period=month',
        ).expect(HttpStatus.OK)
      ).body;

      const row = data.students.find(
        (s: { membership_id: string }) =>
          s.membership_id === terminated.membershipId,
      );
      // Its EffectiveWindow closes at ended_at = today−2, so the two
      // expected days after that date are never counted as missed — the
      // member reported on every day it was expected to.
      expect(row.commitment_score).not.toBeNull();
      expect(row.commitment_score).toBeGreaterThan(0);
    });

    it('reads the removed member’s SOFT-DELETED reports on a historical period', async () => {
      // SAS §20.2: "Teacher, historical group aggregates | Yes, but only for
      // the period the membership was active (FR-PERF-09, DEC-C04)", and the
      // section's own warning that this "must be implemented as a
      // period-aware filter, not a global one". Every one of this member's
      // reports carries `deleted_at` after removal; under a blanket
      // `deleted_at IS NULL` the member is listed by FR-PERF-09 and then
      // contributes nothing at all.
      const group = await createGroup();
      const terminated = await enrol(group.id, {
        fullName: 'عضو مُزال',
        endedAt: shift(today, -2),
      });
      for (const date of EXPECTED_DAYS.slice(0, 4)) {
        await createNormalReport(terminated.membershipId, date);
      }
      await createAbsentReport(
        terminated.membershipId,
        shift(today, -2),
        'Sick',
      );
      await cascadeSoftDelete(terminated.membershipId);

      const live: Array<{ n: string }> = await dataSource.query(
        `SELECT count(*) AS n FROM daily_reports
          WHERE membership_id = $1 AND deleted_at IS NULL`,
        [terminated.membershipId],
      );
      expect(Number(live[0].n)).toBe(0);

      const { data } = (
        await getGroupPerformance(
          group.teacher,
          group.id,
          '?period=month',
        ).expect(HttpStatus.OK)
      ).body;

      const row = data.students.find(
        (s: { membership_id: string }) =>
          s.membership_id === terminated.membershipId,
      );
      // Every component would be 0 — not null — with the rows filtered away.
      expect(row.commitment_score).toBeGreaterThan(0);
      // And the group's absence tally would lose the one Sick day entirely.
      expect(data.absence_breakdown).toEqual({
        sick: 1,
        studying: 0,
        other: 0,
      });
    });

    it('still hides those rows from the current week (FR-PERF-10)', async () => {
      const { group, active } = await seedMixedGroup();

      const { data } = (
        await getGroupPerformance(
          group.teacher,
          group.id,
          '?period=week',
        ).expect(HttpStatus.OK)
      ).body;

      expect(
        data.students.map((s: { membership_id: string }) => s.membership_id),
      ).toEqual([active.membershipId]);
      expect(data.submission_rate).toBe(100);
    });

    it('excludes a membership whose window ended before the period began', async () => {
      const group = await createGroup();
      const active = await enrol(group.id);
      await enrol(group.id, {
        startedAt: shift(today, -100),
        endedAt: shift(today, -90),
      });

      const { data } = (
        await getGroupPerformance(
          group.teacher,
          group.id,
          '?period=month',
        ).expect(HttpStatus.OK)
      ).body;

      expect(
        data.students.map((s: { membership_id: string }) => s.membership_id),
      ).toEqual([active.membershipId]);
    });

    it('treats a custom range that IS the current week as the current week', async () => {
      const { group } = await seedMixedGroup();

      // "except when `period` RESOLVES TO the current week" (APIS §10.9).
      const { data } = (
        await getGroupPerformance(
          group.teacher,
          group.id,
          `?period=custom&from=${shift(today, -6)}&to=${today}`,
        ).expect(HttpStatus.OK)
      ).body;

      expect(data.students).toHaveLength(1);
    });

    it('applies FR-PERF-09 to a custom range that is not the current week', async () => {
      const { group } = await seedMixedGroup();

      const { data } = (
        await getGroupPerformance(
          group.teacher,
          group.id,
          `?period=custom&from=${shift(today, -20)}&to=${today}`,
        ).expect(HttpStatus.OK)
      ).body;

      expect(data.students).toHaveLength(2);
    });
  });

  describe('scope and authorization (APIS §6.1, §10.9, SA §14)', () => {
    it('returns 401 without a token', async () => {
      const group = await createGroup();

      await request(app.getHttpServer())
        .get(`/api/v1/groups/${group.id}/performance`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('lets the assigned Teacher read their own group', async () => {
      const group = await createGroup();

      await getGroupPerformance(group.teacher, group.id).expect(HttpStatus.OK);
    });

    it('returns 403 SCOPE_DENIED to a Teacher of another group (AC-17, FR-PERF-06)', async () => {
      const theirs = await createGroup({
        teacher: otherTeacher,
        assistant: sharedAssistant,
      });

      const response = await getGroupPerformance(
        sharedTeacher,
        theirs.id,
      ).expect(HttpStatus.FORBIDDEN);

      expect(response.body.error).toBe('SCOPE_DENIED');
      expect(response.body).not.toHaveProperty('data');
      expect(response.body.correlationId).toBeDefined();
    });

    it('masks a non-existent group as the SAME 403 for a Teacher (NFR-20)', async () => {
      const theirs = await createGroup({
        teacher: otherTeacher,
        assistant: sharedAssistant,
      });

      const missing = await getGroupPerformance(sharedTeacher, uuidv7()).expect(
        HttpStatus.FORBIDDEN,
      );
      const outOfScope = await getGroupPerformance(
        sharedTeacher,
        theirs.id,
      ).expect(HttpStatus.FORBIDDEN);

      expect(missing.body.error).toBe('SCOPE_DENIED');
      expect(missing.body.message).toBe(outOfScope.body.message);
    });

    it('returns 403 to the Assistant UNCONDITIONALLY, even for their own group (DEC-B09)', async () => {
      const group = await createGroup();
      await enrol(group.id);

      const response = await getGroupPerformance(
        group.assistant,
        group.id,
      ).expect(HttpStatus.FORBIDDEN);

      expect(response.body.statusCode).toBe(HttpStatus.FORBIDDEN);
      expect(response.body).not.toHaveProperty('data');
      expect(response.body.correlationId).toBeDefined();
    });

    it.each([UserRole.User, UserRole.Student])(
      'returns 403 for the %s role',
      async (role) => {
        const group = await createGroup();
        const actor = await registerAndLogin(role);

        await getGroupPerformance(actor, group.id).expect(HttpStatus.FORBIDDEN);
      },
    );

    it('lets the Admin read any group (DEC-C07 ScopeGuard bypass)', async () => {
      const group = await createGroup();
      await enrol(group.id);

      const response = await getGroupPerformance(admin, group.id).expect(
        HttpStatus.OK,
      );

      expect(response.body.data.students).toHaveLength(1);
    });

    it('answers 404 NOT_FOUND to the Admin for a group that does not exist', async () => {
      const response = await getGroupPerformance(admin, uuidv7()).expect(
        HttpStatus.NOT_FOUND,
      );

      expect(response.body.error).toBe('NOT_FOUND');
    });

    it('answers 404 to a malformed id, before any scope lookup (APIS §9.6)', async () => {
      const group = await createGroup();

      const response = await getGroupPerformance(
        group.teacher,
        'not-a-uuid',
      ).expect(HttpStatus.NOT_FOUND);

      expect(response.body.error).toBe('NOT_FOUND');
    });

    it('never leaks another group’s members into the answer', async () => {
      const mine = await createGroup();
      const theirs = await createGroup({
        teacher: otherTeacher,
        assistant: sharedAssistant,
      });
      const ours = await enrol(mine.id);
      await enrol(theirs.id);

      const { data } = (
        await getGroupPerformance(mine.teacher, mine.id).expect(HttpStatus.OK)
      ).body;

      expect(
        data.students.map((s: { membership_id: string }) => s.membership_id),
      ).toEqual([ours.membershipId]);
    });
  });

  describe('query validation (APIS §9.5, §10.9)', () => {
    it('rejects period=custom without from/to with 422', async () => {
      const group = await createGroup();

      const response = await getGroupPerformance(
        group.teacher,
        group.id,
        '?period=custom',
      ).expect(HttpStatus.UNPROCESSABLE_ENTITY);

      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'period' })]),
      );
    });

    it('rejects an unknown period value', async () => {
      const group = await createGroup();

      await getGroupPerformance(group.teacher, group.id, '?period=year').expect(
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    });

    it('rejects a malformed from date', async () => {
      const group = await createGroup();

      await getGroupPerformance(
        group.teacher,
        group.id,
        '?period=custom&from=01-01-2026&to=2026-02-01',
      ).expect(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('accepts 3months and widens the window', async () => {
      const group = await createGroup();
      const student = await enrol(group.id);
      await createNormalReport(student.membershipId, shift(today, -60));

      const week = (
        await getGroupPerformance(group.teacher, group.id, '?period=week')
      ).body.data;
      const quarter = (
        await getGroupPerformance(group.teacher, group.id, '?period=3months')
      ).body.data;

      expect(week.submission_rate).toBe(0);
      expect(quarter.submission_rate).toBeGreaterThan(0);
    });
  });
});
