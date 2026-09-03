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
import {
  purgeNotificationLog,
  stopScheduledJobs,
} from '../shared/scheduled-jobs';

interface TestActor {
  accessToken: string;
  userId: string;
}

interface TestGroup {
  id: string;
  teacher: TestActor;
  assistant: TestActor;
}

interface AtRiskEntry {
  membership_id: string;
  full_name: string | null;
  days_since_last_report: number;
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

/**
 * F-PERF-04 / API-040 — the fixture set the Development Plan §7 calls for by
 * name: "the at-risk predicate is easy to get subtly wrong at the query
 * level — needs its own dedicated fixture-based test". Each `describe`
 * below is one of the four patterns DEC-B05 distinguishes.
 */
describe('GET /groups/{id}/at-risk (F-PERF-04 / API-040 Integration)', () => {
  jest.setTimeout(180000);

  let app: INestApplication<App>;
  let dataSource: DataSource;

  const testEmailDomain = '@test-at-risk-list.com';
  const testGroupPrefix = 'F-PERF-04 test group';
  const mockMailer: IMailer = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  };

  const today = todayIn(STUDENT_TIMEZONE);
  const todayIsoDay = isoDay(today);
  /** Far enough back that no window under test is prorated (FR-WR-09). */
  const startedLongAgo = shift(today, -120);

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
    await purgeNotificationLog(dataSource);
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
   * A Student row inserted directly — students never authenticate in this
   * suite, so hashing a password for each would cost an argon2 pass for
   * nothing (TS §16).
   */
  async function createStudentUser(fullName: string | null): Promise<string> {
    const id = uuidv7();
    await dataSource.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, gender, timezone)
       VALUES ($1, $2, 'not-a-login-in-this-suite', 'Student', $3, 'Male', $4)`,
      [id, `student-${id}${testEmailDomain}`, fullName, STUDENT_TIMEZONE],
    );
    return id;
  }

  /**
   * A group whose recitation day defaults to today's, so today is never an
   * expected day and the most recent expected days are today−1, today−2, …
   */
  async function createGroup(
    options: {
      staff?: { teacher: TestActor; assistant: TestActor };
      recitationDay?: number;
      archivedAt?: string;
    } = {},
  ): Promise<TestGroup> {
    const teacher = options.staff?.teacher ?? sharedTeacher;
    const assistant = options.staff?.assistant ?? sharedAssistant;
    const id = uuidv7();
    await dataSource.query(
      `INSERT INTO groups (
         id, name, gender, recitation_day, enrollment_status,
         lifecycle_state, teacher_id, assistant_id, created_by,
         archived_at, created_at, updated_at
       ) VALUES ($1, $2, 'Male', $3, 'Closed', $6, $4, $5, $4, $7, now(), now())`,
      [
        id,
        `${testGroupPrefix} ${uuidv7()}`,
        options.recitationDay ?? todayIsoDay,
        teacher.userId,
        assistant.userId,
        options.archivedAt ? 'Archived' : 'Active',
        options.archivedAt ?? null,
      ],
    );
    return { id, teacher, assistant };
  }

  /** One member of a group, Active unless `endedAt` says otherwise. */
  async function enrol(
    groupId: string,
    options: {
      fullName?: string | null;
      startedAt?: string;
      endedAt?: string;
    } = {},
  ): Promise<{ membershipId: string; userId: string }> {
    const userId = await createStudentUser(
      options.fullName === undefined
        ? `طالب ${uuidv7().slice(0, 6)}`
        : options.fullName,
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

  function getAtRisk(actor: TestActor, groupId: string, query = '') {
    return request(app.getHttpServer())
      .get(`/api/v1/groups/${groupId}/at-risk${query}`)
      .set('Authorization', `Bearer ${actor.accessToken}`);
  }

  async function atRiskIds(
    actor: TestActor,
    groupId: string,
  ): Promise<string[]> {
    const response = await getAtRisk(actor, groupId).expect(HttpStatus.OK);
    return (response.body.data as AtRiskEntry[]).map(
      (entry) => entry.membership_id,
    );
  }

  describe('pattern 1 — 3 consecutive expected days with no report (AC-15)', () => {
    it('flags a student silent for exactly three expected days', async () => {
      const group = await createGroup();
      const silent = await enrol(group.id, { fullName: 'الطالب الصامت' });
      // Today is the recitation day, so the expected days after a report on
      // today−4 are today−3, today−2 and today−1 — exactly three.
      await createNormalReport(silent.membershipId, shift(today, -4));

      const response = await getAtRisk(group.teacher, group.id).expect(
        HttpStatus.OK,
      );

      expect(response.body).toEqual({
        data: [
          {
            membership_id: silent.membershipId,
            full_name: 'الطالب الصامت',
            days_since_last_report: 3,
          },
        ],
      });
    });

    it('does NOT flag a student silent for only two expected days', async () => {
      const group = await createGroup();
      const student = await enrol(group.id);
      await createNormalReport(student.membershipId, shift(today, -3));

      await expect(atRiskIds(group.teacher, group.id)).resolves.toEqual([]);
    });

    it('does NOT flag a student who reported on the last expected day', async () => {
      const group = await createGroup();
      const student = await enrol(group.id);
      await createNormalReport(student.membershipId, shift(today, -1));

      await expect(atRiskIds(group.teacher, group.id)).resolves.toEqual([]);
    });

    it('flags a student who has never reported at all', async () => {
      const group = await createGroup();
      const never = await enrol(group.id);

      const response = await getAtRisk(group.teacher, group.id).expect(
        HttpStatus.OK,
      );

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].membership_id).toBe(never.membershipId);
      expect(
        response.body.data[0].days_since_last_report,
      ).toBeGreaterThanOrEqual(3);
    });

    it('does NOT flag a membership younger than three expected days (FR-WR-09)', async () => {
      const group = await createGroup();
      // Enrolled two expected days ago (today−2 and today−1), never
      // reported: the window does not hold the three days §18.4 counts.
      await enrol(group.id, { startedAt: shift(today, -2) });

      await expect(atRiskIds(group.teacher, group.id)).resolves.toEqual([]);
    });

    it('reports a null full_name as null, never as an empty string', async () => {
      const group = await createGroup();
      const anonymous = await enrol(group.id, { fullName: null });

      const response = await getAtRisk(group.teacher, group.id).expect(
        HttpStatus.OK,
      );

      expect(response.body.data[0]).toEqual({
        membership_id: anonymous.membershipId,
        full_name: null,
        days_since_last_report: expect.any(Number),
      });
    });
  });

  describe('pattern 2 — an excused absence BREAKS the streak (DEC-B05, BR-24)', () => {
    /**
     * Two students with the identical silence: no report on today−5,
     * today−4, today−2 or today−1. The only difference is that one filed a
     * `Sick` absence on today−3. That report "counts as REPORTED and
     * therefore BREAKS the streak", restarting the count at today−2 — two
     * expected days, one short of the predicate.
     */
    async function seedExcusedPair() {
      const group = await createGroup();
      const excused = await enrol(group.id, { fullName: 'الطالب المعذور' });
      const silent = await enrol(group.id, { fullName: 'الطالب الصامت' });

      await createNormalReport(excused.membershipId, shift(today, -6));
      await createAbsentReport(excused.membershipId, shift(today, -3), 'Sick');
      await createNormalReport(silent.membershipId, shift(today, -6));

      return { group, excused, silent };
    }

    it('does not flag the student whose excused absence reset the streak', async () => {
      const { group, excused, silent } = await seedExcusedPair();

      const response = await getAtRisk(group.teacher, group.id).expect(
        HttpStatus.OK,
      );
      const entries = response.body.data as AtRiskEntry[];

      // The control student — same reports MINUS the sick note — is flagged
      // with the full five-day silence; the excused one is absent entirely.
      expect(entries).toEqual([
        {
          membership_id: silent.membershipId,
          full_name: 'الطالب الصامت',
          days_since_last_report: 5,
        },
      ]);
      expect(entries.map((e) => e.membership_id)).not.toContain(
        excused.membershipId,
      );
    });

    it('flags the excused student again once three expected days pass after the absence', async () => {
      const group = await createGroup();
      const excused = await enrol(group.id);
      // Sick note on today−4: today−3, today−2, today−1 follow it.
      await createAbsentReport(excused.membershipId, shift(today, -4), 'Sick');

      const response = await getAtRisk(group.teacher, group.id).expect(
        HttpStatus.OK,
      );

      expect(response.body.data).toEqual([
        {
          membership_id: excused.membershipId,
          full_name: expect.any(String),
          days_since_last_report: 3,
        },
      ]);
    });

    it.each(['Studying', 'Other'] as const)(
      'breaks the streak on an %s absence too (BR-25, §18.4)',
      async (reason) => {
        const group = await createGroup();
        const student = await enrol(group.id);
        await createAbsentReport(
          student.membershipId,
          shift(today, -2),
          reason,
        );

        await expect(atRiskIds(group.teacher, group.id)).resolves.toEqual([]);
      },
    );
  });

  describe('pattern 3 — a recitation day is SKIPPED, neither counted nor resetting', () => {
    /**
     * A group whose recitation day falls on today−2, so the expected days
     * running back from today are: today, today−1, [today−2 skipped],
     * today−3, today−4 …
     */
    async function createSpanningGroup() {
      return createGroup({ recitationDay: isoDay(shift(today, -2)) });
    }

    it('does not count the recitation day, so a streak across it stays short', async () => {
      const group = await createSpanningGroup();
      const student = await enrol(group.id);
      // Reported on today−3. The days after it are the recitation day
      // today−2 (skipped), today−1 and today — two expected days. Counting
      // the recitation day as a miss would wrongly make it three.
      await createNormalReport(student.membershipId, shift(today, -3));

      await expect(atRiskIds(group.teacher, group.id)).resolves.toEqual([]);
    });

    it('does not let the recitation day break a streak that spans it', async () => {
      const group = await createSpanningGroup();
      const student = await enrol(group.id, { fullName: 'الطالب المتجاوز' });
      // Reported on today−4: today−3, [today−2 skipped], today−1, today are
      // three consecutive EXPECTED days with no report. A recitation day
      // carries no report and cannot reset the streak (VR-12 makes one
      // impossible), so the student IS at risk.
      await createNormalReport(student.membershipId, shift(today, -4));

      const response = await getAtRisk(group.teacher, group.id).expect(
        HttpStatus.OK,
      );

      expect(response.body.data).toEqual([
        {
          membership_id: student.membershipId,
          full_name: 'الطالب المتجاوز',
          days_since_last_report: 3,
        },
      ]);
    });

    it('skips every recitation day of a long silence when counting the days', async () => {
      const group = await createGroup();
      const student = await enrol(group.id);
      // Today is this group's recitation day, so today and today−7 are both
      // skipped: the 8 calendar days after a report on today−8 hold 6
      // expected days.
      await createNormalReport(student.membershipId, shift(today, -8));

      const response = await getAtRisk(group.teacher, group.id).expect(
        HttpStatus.OK,
      );

      expect(response.body.data).toEqual([
        {
          membership_id: student.membershipId,
          full_name: expect.any(String),
          days_since_last_report: 6,
        },
      ]);
    });
  });

  describe('pattern 4 — terminated memberships are excluded ENTIRELY (FR-PERF-10, DEC-C04, AC-33)', () => {
    it('never lists a removed student, however long their silence', async () => {
      const group = await createGroup();
      const removed = await enrol(group.id, {
        fullName: 'الطالب المُزال',
        endedAt: shift(today, -1),
      });
      await cascadeSoftDelete(removed.membershipId);
      const active = await enrol(group.id, { fullName: 'الطالب النشط' });

      const response = await getAtRisk(group.teacher, group.id).expect(
        HttpStatus.OK,
      );
      const entries = response.body.data as AtRiskEntry[];

      // The Active student with the same (absent) reporting history IS
      // flagged, so the exclusion is the membership state and nothing else.
      expect(entries.map((e) => e.membership_id)).toEqual([
        active.membershipId,
      ]);
    });

    it('excludes a student terminated today, even though today is inside the window', async () => {
      const group = await createGroup();
      const removed = await enrol(group.id, { endedAt: today });
      await cascadeSoftDelete(removed.membershipId);

      await expect(atRiskIds(group.teacher, group.id)).resolves.toEqual([]);
    });

    it('ignores a removed student’s soft-deleted reports rather than reading them', async () => {
      // The termination cascade stamps `deleted_at` on every report. Were
      // the read to include them, this membership would still be excluded —
      // the state test comes first — so the assertion is simply that no
      // deleted row can put anyone on the list.
      const group = await createGroup();
      const removed = await enrol(group.id, { endedAt: shift(today, -1) });
      await createNormalReport(removed.membershipId, shift(today, -2));
      await cascadeSoftDelete(removed.membershipId);

      await expect(atRiskIds(group.teacher, group.id)).resolves.toEqual([]);
    });
  });

  describe('the response contract (APIS §9.1, §10.9)', () => {
    it('returns the bounded-collection envelope: data, no pagination, no total', async () => {
      const group = await createGroup();
      await enrol(group.id);

      const response = await getAtRisk(group.teacher, group.id).expect(
        HttpStatus.OK,
      );

      const body = response.body as { data: AtRiskEntry[] };
      const entries = body.data;
      expect(Object.keys(body)).toEqual(['data']);
      expect(Array.isArray(entries)).toBe(true);
      expect(Object.keys(entries[0]).sort()).toEqual([
        'days_since_last_report',
        'full_name',
        'membership_id',
      ]);
    });

    it('answers an empty group with an empty list, never an error', async () => {
      const group = await createGroup();

      const response = await getAtRisk(group.teacher, group.id).expect(
        HttpStatus.OK,
      );

      expect(response.body).toEqual({ data: [] });
    });

    it('agrees with API-039 about days_since_last_report (CON-07, TS §24)', async () => {
      const group = await createGroup();
      const student = await enrol(group.id);
      await createNormalReport(student.membershipId, shift(today, -5));

      const list = await getAtRisk(group.teacher, group.id).expect(
        HttpStatus.OK,
      );
      const dashboard = await request(app.getHttpServer())
        .get(`/api/v1/memberships/${student.membershipId}/performance`)
        .set('Authorization', `Bearer ${group.teacher.accessToken}`)
        .expect(HttpStatus.OK);

      expect(list.body.data[0].days_since_last_report).toBe(
        dashboard.body.data.days_since_last_report,
      );
    });

    it('silently ignores a ?period= a client sends anyway (APIS §9.3)', async () => {
      const group = await createGroup();
      const student = await enrol(group.id);
      await createNormalReport(student.membershipId, shift(today, -5));

      const plain = await getAtRisk(group.teacher, group.id).expect(
        HttpStatus.OK,
      );
      const withPeriod = await getAtRisk(
        group.teacher,
        group.id,
        '?period=3months',
      ).expect(HttpStatus.OK);

      // The predicate always looks backwards from today (SAS §18.4), so a
      // period cannot change the answer — and never yields a 422 either.
      expect(withPeriod.body).toEqual(plain.body);
    });

    it('never persists the flag — it is recomputed on every call (DMS §22, DBD §68)', async () => {
      const group = await createGroup();
      const student = await enrol(group.id);
      await createNormalReport(student.membershipId, shift(today, -4));

      const first = await getAtRisk(group.teacher, group.id).expect(
        HttpStatus.OK,
      );
      // A report filed now removes the student from the list immediately,
      // with no invalidation step of any kind.
      await createNormalReport(student.membershipId, shift(today, -1));
      const second = await getAtRisk(group.teacher, group.id).expect(
        HttpStatus.OK,
      );

      expect(first.body.data).toHaveLength(1);
      expect(second.body.data).toEqual([]);
    });

    it('truncates the window at an archived group rather than at today (FR-WR-10, BR-42)', async () => {
      const group = await createGroup({
        archivedAt: `${shift(today, -2)}T12:00:00.000Z`,
      });
      const student = await enrol(group.id);
      // Reported on today−4. `EffectiveWindow(m)` closes at the archival
      // date, so only today−3 and today−2 follow it — two expected days,
      // not the four that would follow if the window ran to today.
      await createNormalReport(student.membershipId, shift(today, -4));

      await expect(atRiskIds(group.teacher, group.id)).resolves.toEqual([]);
    });
  });

  describe('scope and authorization (APIS §6.1, §10.9, SA §14)', () => {
    it('returns 401 without a token', async () => {
      const group = await createGroup();

      await request(app.getHttpServer())
        .get(`/api/v1/groups/${group.id}/at-risk`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('lets the assigned Teacher read their own group', async () => {
      const group = await createGroup();

      await getAtRisk(group.teacher, group.id).expect(HttpStatus.OK);
    });

    it('returns 403 SCOPE_DENIED to a Teacher of another group (AC-17)', async () => {
      const theirs = await createGroup({
        staff: { teacher: otherTeacher, assistant: sharedAssistant },
      });

      const response = await getAtRisk(sharedTeacher, theirs.id).expect(
        HttpStatus.FORBIDDEN,
      );

      expect(response.body.error).toBe('SCOPE_DENIED');
      expect(response.body).not.toHaveProperty('data');
      expect(response.body.correlationId).toBeDefined();
    });

    it('masks a non-existent group as the SAME 403 for a Teacher (NFR-20)', async () => {
      const theirs = await createGroup({
        staff: { teacher: otherTeacher, assistant: sharedAssistant },
      });

      const missing = await getAtRisk(sharedTeacher, uuidv7()).expect(
        HttpStatus.FORBIDDEN,
      );
      const outOfScope = await getAtRisk(sharedTeacher, theirs.id).expect(
        HttpStatus.FORBIDDEN,
      );

      expect(missing.body.error).toBe('SCOPE_DENIED');
      expect(missing.body.message).toBe(outOfScope.body.message);
    });

    it('returns 403 to the Assistant UNCONDITIONALLY, even for their own group (DEC-B09)', async () => {
      const group = await createGroup();
      await enrol(group.id);

      const response = await getAtRisk(group.assistant, group.id).expect(
        HttpStatus.FORBIDDEN,
      );

      expect(response.body.statusCode).toBe(HttpStatus.FORBIDDEN);
      expect(response.body).not.toHaveProperty('data');
      expect(response.body.correlationId).toBeDefined();
    });

    it.each([UserRole.User, UserRole.Student])(
      'returns 403 for the %s role',
      async (role) => {
        const group = await createGroup();
        const actor = await registerAndLogin(role);

        await getAtRisk(actor, group.id).expect(HttpStatus.FORBIDDEN);
      },
    );

    it('lets the Admin read any group (DEC-C07 ScopeGuard bypass)', async () => {
      const group = await createGroup({
        staff: { teacher: otherTeacher, assistant: sharedAssistant },
      });
      const student = await enrol(group.id);

      const response = await getAtRisk(admin, group.id).expect(HttpStatus.OK);

      expect(response.body.data[0].membership_id).toBe(student.membershipId);
    });

    it('answers 404 NOT_FOUND to the Admin for a group that does not exist', async () => {
      const response = await getAtRisk(admin, uuidv7()).expect(
        HttpStatus.NOT_FOUND,
      );

      expect(response.body.error).toBe('NOT_FOUND');
    });

    it('answers 404 to a malformed id, before any scope lookup (APIS §9.6)', async () => {
      const group = await createGroup();

      const response = await getAtRisk(group.teacher, 'not-a-uuid').expect(
        HttpStatus.NOT_FOUND,
      );

      expect(response.body.error).toBe('NOT_FOUND');
    });

    it('never leaks another group’s at-risk students into the answer', async () => {
      const mine = await createGroup();
      const theirs = await createGroup({
        staff: { teacher: otherTeacher, assistant: sharedAssistant },
      });
      const ours = await enrol(mine.id);
      await enrol(theirs.id);

      await expect(atRiskIds(mine.teacher, mine.id)).resolves.toEqual([
        ours.membershipId,
      ]);
    });
  });
});
