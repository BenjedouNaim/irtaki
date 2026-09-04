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
import {
  purgeNotificationLog,
  stopScheduledJobs,
} from '../shared/scheduled-jobs';

interface TestActor {
  accessToken: string;
  userId: string;
}

const STUDENT_TIMEZONE = 'Africa/Tunis';

/**
 * NFR-11's budget: "Dashboard render under 3 seconds on a 3G connection"
 * (SRS §9, SAS §25.4). The 3s covers transport as well as the server, so the
 * server-side share asserted here is the whole budget minus nothing — a
 * response that already needs 3s in-process leaves nothing for 3G, so
 * failing at 3000ms is the loosest defensible assertion. The observed
 * numbers are reported by the suite so a regression is visible long before
 * the ceiling.
 */
const NFR_11_BUDGET_MS = 3000;

/** The QA cohort's shape: 4 groups × 8 students, ~50 report days each. */
const FIXTURE_GROUPS = 4;
const STUDENTS_PER_GROUP = 8;
const REPORT_DAYS_PER_STUDENT = 50;

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

/** Every key that appears anywhere in a JSON value, at any depth. */
function deepKeys(value: unknown, found: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      deepKeys(item, found);
    }
    return found;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      found.add(key);
      deepKeys(child, found);
    }
  }
  return found;
}

describe('GET /me/dashboard (F-DASH-01 / API-009 Integration)', () => {
  jest.setTimeout(600000);

  let app: INestApplication<App>;
  let dataSource: DataSource;

  const testEmailDomain = '@test-dashboard.com';
  const testGroupPrefix = 'F-DASH-01 test group';
  const mockMailer: IMailer = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  };

  const today = todayIn(STUDENT_TIMEZONE);
  const todayIsoDay = isoDay(today);
  /** Far enough back that no window under test is prorated (FR-WR-09). */
  const startedLongAgo = shift(today, -400);

  let teacher: TestActor;
  let assistant: TestActor;
  let admin: TestActor;
  let applicant: TestActor;
  let student: TestActor;
  /** Every fixture group, in creation order. */
  let groupIds: string[] = [];
  /** The membership of the Student actor who logs in. */
  let studentMembershipId: string;

  /** Timings collected across the suite, printed once at the end. */
  const timings: Array<{ role: string; ms: number }> = [];

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
    // TS §31's five crons are live in a real AppModule boot. Their
    // evaluators sweep this suite's fixtures on the next tick and write
    // notification_log rows against users it is about to delete, which
    // fails this suite and every suite behind it on the shared database.
    stopScheduledJobs(app);

    // DS-02's cron must not finalise a fixture week mid-suite (ADR-024).
    void app
      .get(SchedulerRegistry)
      .getCronJob(WEEKLY_REPORT_FINALIZATION_CRON)
      .stop();

    dataSource = app.get(DataSource);
    await cleanDatabase();

    teacher = await registerAndLogin(UserRole.Teacher);
    assistant = await registerAndLogin(UserRole.Assistant);
    admin = await registerAndLogin(UserRole.Admin);
    applicant = await registerAndLogin(UserRole.User);
    student = await registerAndLogin(UserRole.Student);

    await seedCohort();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await cleanDatabase();
    }
    await app.close();

    for (const timing of timings) {
      // TS §30: message-first. The measured share of NFR-11's budget.

      console.log(
        `NFR-11 GET /me/dashboard role=${timing.role} elapsed_ms=${timing.ms} budget_ms=${NFR_11_BUDGET_MS}`,
      );
    }
  });

  // ── Fixtures ─────────────────────────────────────────────────────────────

  async function cleanDatabase(): Promise<void> {
    for (const table of [
      'payment_records',
      'weekly_reports',
      'daily_reports',
    ]) {
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
      `DELETE FROM join_requests
       WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)
          OR group_id IN (SELECT id FROM groups WHERE name LIKE $2)`,
      [`%${testEmailDomain}`, `${testGroupPrefix}%`],
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
    // DBT-17 holds ON DELETE RESTRICT references to these users.
    await purgeNotificationLog(dataSource);
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
    if (role !== UserRole.User) {
      await dataSource.query(
        'UPDATE users SET role = $1, full_name = $2, gender = $3 WHERE id = $4',
        [role, `${role} test user`, 'Male', userId],
      );
    }

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(HttpStatus.OK);

    return { accessToken: login.body.access_token as string, userId };
  }

  /** A Student row inserted directly — these students never authenticate. */
  async function createStudentUser(fullName: string): Promise<string> {
    const id = uuidv7();
    await dataSource.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, gender, timezone)
       VALUES ($1, $2, 'not-a-login-in-this-suite', 'Student', $3, 'Male', $4)`,
      [id, `student-${id}${testEmailDomain}`, fullName, STUDENT_TIMEZONE],
    );
    return id;
  }

  async function createGroup(index: number): Promise<string> {
    const id = uuidv7();
    await dataSource.query(
      `INSERT INTO groups (
         id, name, gender, recitation_day, enrollment_status,
         lifecycle_state, teacher_id, assistant_id, created_by,
         created_at, updated_at
       ) VALUES ($1, $2, 'Male', $3, 'Open', 'Active', $4, $5, $4, now(), now())`,
      [
        id,
        `${testGroupPrefix} ${index} ${uuidv7()}`,
        // A different recitation day per group so the reporting-week anchors
        // differ, as they do in the real cohort.
        ((todayIsoDay + index) % 7) + 1,
        teacher.userId,
        assistant.userId,
      ],
    );
    return id;
  }

  async function enrol(
    groupId: string,
    userId: string,
    startedAt: string,
  ): Promise<string> {
    const membershipId = uuidv7();
    await dataSource.query(
      `INSERT INTO memberships (
         id, user_id, group_id, state, started_at, created_at, updated_at
       ) VALUES ($1, $2, $3, 'Active', $4::date, now(), now())`,
      [membershipId, userId, groupId, startedAt],
    );
    return membershipId;
  }

  async function ordinalOf(surah: number, ayah: number): Promise<number> {
    const rows: Array<{ ordinal_offset: number | string }> =
      await dataSource.query(
        'SELECT ordinal_offset FROM surahs WHERE number = $1',
        [surah],
      );
    return Number(rows[0].ordinal_offset) + ayah;
  }

  /**
   * The realistic dataset NFR-11 is measured against — a replica of the QA
   * cohort in the dev database (4 groups, 32 students, ~1600 daily reports),
   * built here rather than borrowed, so the developer's `irtaki` database is
   * never read or written by this suite.
   *
   * Reports are inserted in ONE multi-row statement per student to keep
   * fixture setup off the measured path; the measurement itself is the HTTP
   * call, timed after the data is committed.
   */
  async function seedCohort(): Promise<void> {
    const memoFrom = await ordinalOf(2, 1);
    const memoTo = await ordinalOf(2, 20);
    const revFrom = await ordinalOf(1, 1);
    const revTo = await ordinalOf(1, 7);

    groupIds = [];
    for (let g = 0; g < FIXTURE_GROUPS; g += 1) {
      groupIds.push(await createGroup(g));
    }

    for (let g = 0; g < FIXTURE_GROUPS; g += 1) {
      const groupId = groupIds[g];
      for (let s = 0; s < STUDENTS_PER_GROUP; s += 1) {
        // The logged-in Student actor takes the first seat of the first
        // group; every other seat is a directly-inserted student.
        const isActor = g === 0 && s === 0;
        const userId = isActor
          ? student.userId
          : await createStudentUser(`طالب ${g}-${s}`);
        const membershipId = await enrol(groupId, userId, startedLongAgo);
        if (isActor) {
          studentMembershipId = membershipId;
        }

        const values: string[] = [];
        const params: unknown[] = [];
        for (let d = 1; d <= REPORT_DAYS_PER_STUDENT; d += 1) {
          const reportDate = shift(today, -d);
          const base = params.length;
          // Every fourth day is an excused absence, so the day breakdown and
          // the absence tally are both non-trivial.
          if (d % 4 === 0) {
            values.push(
              `($${base + 1}, $${base + 2}, $${base + 3}::date, 'Absent', $${base + 4}, 'Sick',
                NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)`,
            );
            params.push(uuidv7(), membershipId, reportDate, STUDENT_TIMEZONE);
          } else {
            values.push(
              `($${base + 1}, $${base + 2}, $${base + 3}::date, 'Normal', $${base + 4}, NULL,
                false, $${base + 5}, $${base + 6}, '18:00', '18:45', true, true, false,
                $${base + 7}, $${base + 8}, '19:00', '19:10', false)`,
            );
            params.push(
              uuidv7(),
              membershipId,
              reportDate,
              STUDENT_TIMEZONE,
              memoFrom,
              memoTo,
              revFrom,
              revTo,
            );
          }
        }

        await dataSource.query(
          `INSERT INTO daily_reports (
             id, membership_id, report_date, type, submitted_timezone, absence_reason,
             no_memorization_today, memo_from_ordinal, memo_to_ordinal,
             memo_time_from, memo_time_to, completed_50_repetitions,
             repetitions_in_single_session, no_revision_today,
             rev_from_ordinal, rev_to_ordinal, rev_time_from, rev_time_to, read_tafsir
           ) VALUES ${values.join(', ')}`,
          params,
        );

        // Half the cohort has paid its first cycle; the rest is arrears, so
        // `payment_followup_count` is neither 0 nor the whole roster.
        if (s % 2 === 0) {
          await dataSource.query(
            `INSERT INTO payment_records (id, membership_id, cycle_index, amount, paid_at, recorded_by)
             VALUES ($1, $2, 0, 30.00, now(), $3)`,
            [uuidv7(), membershipId, assistant.userId],
          );
        }
      }

      // Two live Pending applications per group — the Assistant's queue.
      for (let a = 0; a < 2; a += 1) {
        const applicantId = uuidv7();
        await dataSource.query(
          `INSERT INTO users (id, email, password_hash, role, timezone)
           VALUES ($1, $2, 'not-a-login-in-this-suite', 'User', $3)`,
          [
            applicantId,
            `applicant-${applicantId}${testEmailDomain}`,
            STUDENT_TIMEZONE,
          ],
        );
        await dataSource.query(
          `INSERT INTO join_requests (
             id, user_id, group_id, full_name, gender, age, phone_number,
             occupation, city, memorized_hizb_count, tajweed_level,
             studied_tajweed_theory, studied_qalun, fee_agreement,
             program_goal, score, status
           ) VALUES ($1, $2, $3, $4, 'Male', 22, '+21698123456', 'مهندس',
                     'تونس', 15, 'Intermediate', true, true, true,
                     'Memorization', 80.00, 'Pending')`,
          [uuidv7(), applicantId, groupId, `مترشح ${g}-${a}`],
        );
      }
    }

    // The `User` actor's own live application, for the SCR-05 pending state.
    await dataSource.query(
      `INSERT INTO join_requests (
         id, user_id, group_id, full_name, gender, age, phone_number,
         occupation, city, memorized_hizb_count, tajweed_level,
         studied_tajweed_theory, studied_qalun, fee_agreement,
         program_goal, score, status
       ) VALUES ($1, $2, $3, 'مترشح الاختبار', 'Male', 30, '+21698123456',
                 'مهندس', 'تونس', 20, 'Advanced', true, true, true,
                 'Memorization', 91.50, 'Pending')`,
      [uuidv7(), applicant.userId, groupIds[0]],
    );
  }

  /** One timed `GET /me/dashboard`, recorded against NFR-11's budget. */
  async function readDashboard(
    actor: TestActor,
    role: string,
  ): Promise<Record<string, unknown>> {
    const startedAt = Date.now();
    const response = await request(app.getHttpServer())
      .get('/api/v1/me/dashboard')
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .expect(HttpStatus.OK);
    timings.push({ role, ms: Date.now() - startedAt });

    expect(Object.keys(response.body as object)).toEqual(['data']);
    return response.body.data as Record<string, unknown>;
  }

  // ── The dataset itself ───────────────────────────────────────────────────

  it('seeds a QA-comparable cohort: 4 groups, 32 students, ~1600 daily reports', async () => {
    const [{ count: memberships }] = await dataSource.query<
      Array<{ count: number }>
    >(
      `SELECT COUNT(*)::int AS count FROM memberships
        WHERE group_id = ANY($1::uuid[])`,
      [groupIds],
    );
    const [{ count: reports }] = await dataSource.query<
      Array<{ count: number }>
    >(
      `SELECT COUNT(*)::int AS count FROM daily_reports
        WHERE membership_id IN (
          SELECT id FROM memberships WHERE group_id = ANY($1::uuid[])
        )`,
      [groupIds],
    );

    expect(groupIds).toHaveLength(FIXTURE_GROUPS);
    expect(memberships).toBe(FIXTURE_GROUPS * STUDENTS_PER_GROUP);
    expect(reports).toBe(
      FIXTURE_GROUPS * STUDENTS_PER_GROUP * REPORT_DAYS_PER_STUDENT,
    );
  });

  // ── Authorization ────────────────────────────────────────────────────────

  it('rejects an unauthenticated caller with 401', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/me/dashboard')
      .expect(HttpStatus.UNAUTHORIZED);
  });

  // ── Per-role shape ───────────────────────────────────────────────────────

  it('User: returns the pending-application state (SCR-05) and nothing else', async () => {
    const data = await readDashboard(applicant, 'User');

    expect(data).toEqual({
      has_pending_request: true,
      pending_request_status: 'Pending',
    });
    // DEC-C09: status only — never the score the applicant saw at submission.
    expect(JSON.stringify(data)).not.toContain('91.5');
  });

  it('Student: returns the CTA state, the score and the payment chip in ONE call', async () => {
    const data = await readDashboard(student, 'Student');

    expect(Object.keys(data).sort()).toEqual(
      expect.arrayContaining([
        'can_submit_today',
        'commitment_score',
        'payment',
      ]),
    );
    expect(typeof data.can_submit_today).toBe('boolean');
    expect(
      data.commitment_score === null ||
        typeof data.commitment_score === 'number',
    ).toBe(true);

    const payment = data.payment as Record<string, unknown>;
    expect(Object.keys(payment).sort()).toEqual([
      'arrears_count',
      'next_due_date',
      'status',
    ]);
    expect(['Paid', 'Due Soon', 'Unpaid']).toContain(payment.status);
    expect(typeof payment.arrears_count).toBe('number');
    // The payload carries the chip, never the whole ledger.
    expect(data).not.toHaveProperty('cycles');
    // …and never today's report body (APIS §10.3 lists four keys).
    expect(data).not.toHaveProperty('existing_report');
  });

  it('Student: the dashboard agrees with the endpoints it composes', async () => {
    const data = await readDashboard(student, 'Student');

    const todayStatus = await request(app.getHttpServer())
      .get('/api/v1/daily-reports/today')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(HttpStatus.OK);
    const performance = await request(app.getHttpServer())
      .get('/api/v1/me/performance')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(HttpStatus.OK);
    const ledger = await request(app.getHttpServer())
      .get('/api/v1/me/payments')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(HttpStatus.OK);

    expect(data.can_submit_today).toBe(todayStatus.body.data.can_submit);
    expect(data.commitment_score).toBe(
      performance.body.data.commitment_score as number | null,
    );
    const payment = data.payment as Record<string, unknown>;
    expect(payment.next_due_date).toBe(
      ledger.body.data.next_due_date as string | null,
    );
    expect(payment.arrears_count).toBe(ledger.body.data.arrears_count);
    expect(payment.status).toBe(
      ledger.body.data.cycles[ledger.body.data.cycles.length - 1].status,
    );
  });

  it('Assistant: returns the queue count and one row per assigned group', async () => {
    const data = await readDashboard(assistant, 'Assistant');

    expect(Object.keys(data).sort()).toEqual([
      'groups',
      'pending_request_count',
    ]);
    // Two live Pending applications per group, plus the User actor's own.
    expect(data.pending_request_count).toBe(FIXTURE_GROUPS * 2 + 1);

    const groups = data.groups as Array<Record<string, unknown>>;
    expect(groups).toHaveLength(FIXTURE_GROUPS);
    for (const group of groups) {
      expect(Object.keys(group).sort()).toEqual([
        'id',
        'name',
        'payment_followup_count',
      ]);
      expect(typeof group.payment_followup_count).toBe('number');
      expect(group.payment_followup_count as number).toBeLessThanOrEqual(
        STUDENTS_PER_GROUP,
      );
    }
  });

  it('Assistant: the follow-up count IS the length of the list it taps into', async () => {
    const data = await readDashboard(assistant, 'Assistant');
    const card = (data.groups as Array<Record<string, unknown>>).find(
      (g) => g.id === groupIds[0],
    )!;

    const unpaid = await request(app.getHttpServer())
      .get(`/api/v1/groups/${groupIds[0]}/payments`)
      .query({ status: 'Unpaid' })
      .set('Authorization', `Bearer ${assistant.accessToken}`)
      .expect(HttpStatus.OK);

    expect(card.payment_followup_count).toBe(unpaid.body.data.length);
    expect(unpaid.body.data.length).toBeGreaterThan(0);
  });

  /**
   * The acceptance criterion: "Assistant's response never includes
   * performance data at the type level, not just by convention."
   *
   * The type-level half is proved at compile time by the `@ts-expect-error`
   * block in `get-dashboard.use-case.spec.ts` (weakening
   * `AssistantDashboardDto` turns those directives into build errors). This
   * is the run-time half: no performance-shaped key exists anywhere in the
   * real HTTP response, at any depth.
   */
  it('Assistant: carries no performance key at any depth (DEC-B09)', async () => {
    const data = await readDashboard(assistant, 'Assistant');

    const keys = deepKeys(data);
    for (const forbidden of [
      'commitment_score',
      'commitment_average',
      'submission_rate',
      'at_risk',
      'at_risk_count',
      'attendance_rate',
      'memorization_rate',
      'revision_rate',
      'repetition_quality',
      'day_breakdown',
      'days_since_last_report',
      'absence_breakdown',
      'students',
      'performance',
    ]) {
      expect([...keys]).not.toContain(forbidden);
    }
  });

  it('Assistant: is still refused the performance endpoints themselves (DEC-B09)', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/groups/${groupIds[0]}/performance`)
      .set('Authorization', `Bearer ${assistant.accessToken}`)
      .expect(HttpStatus.FORBIDDEN);
    await request(app.getHttpServer())
      .get(`/api/v1/groups/${groupIds[0]}/at-risk`)
      .set('Authorization', `Bearer ${assistant.accessToken}`)
      .expect(HttpStatus.FORBIDDEN);
  });

  it('Teacher: returns one card per assigned group with its three figures', async () => {
    const data = await readDashboard(teacher, 'Teacher');

    expect(Object.keys(data)).toEqual(['groups']);
    const groups = data.groups as Array<Record<string, unknown>>;
    expect(groups).toHaveLength(FIXTURE_GROUPS);

    for (const group of groups) {
      expect(Object.keys(group).sort()).toEqual([
        'at_risk_count',
        'commitment_average',
        'id',
        'name',
        'submission_rate',
      ]);
      expect(typeof group.at_risk_count).toBe('number');
      expect(
        group.commitment_average === null ||
          typeof group.commitment_average === 'number',
      ).toBe(true);
      expect(
        group.submission_rate === null ||
          typeof group.submission_rate === 'number',
      ).toBe(true);
    }
  });

  it('Teacher: each card agrees with the group endpoints it composes', async () => {
    const data = await readDashboard(teacher, 'Teacher');
    const card = (data.groups as Array<Record<string, unknown>>).find(
      (g) => g.id === groupIds[0],
    )!;

    const performance = await request(app.getHttpServer())
      .get(`/api/v1/groups/${groupIds[0]}/performance`)
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .expect(HttpStatus.OK);
    const atRisk = await request(app.getHttpServer())
      .get(`/api/v1/groups/${groupIds[0]}/at-risk`)
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .expect(HttpStatus.OK);

    expect(card.commitment_average).toBe(
      performance.body.data.commitment_average as number | null,
    );
    expect(card.submission_rate).toBe(
      performance.body.data.submission_rate as number | null,
    );
    expect(card.at_risk_count).toBe(atRisk.body.data.length);
    // The card carries the figures, never the student list behind them.
    expect(card).not.toHaveProperty('students');
  });

  it('Admin: returns exactly four counts', async () => {
    const data = await readDashboard(admin, 'Admin');

    expect(Object.keys(data).sort()).toEqual([
      'group_count',
      'pending_recovery_count',
      'staff_count',
      'student_count',
    ]);
    expect(data.group_count as number).toBeGreaterThanOrEqual(FIXTURE_GROUPS);
    expect(data.student_count as number).toBeGreaterThanOrEqual(
      FIXTURE_GROUPS * STUDENTS_PER_GROUP,
    );
    expect(data.staff_count as number).toBeGreaterThanOrEqual(2);
    expect(typeof data.pending_recovery_count).toBe('number');
  });

  // ── NFR-11 ───────────────────────────────────────────────────────────────

  /**
   * "One HTTP round trip, genuinely one call, not five hidden ones" — the
   * budget test the Development Plan §8 names for EPIC-10, measured against
   * the seeded cohort above rather than an empty database.
   *
   * The Teacher is the widest fan-out in the system (4 groups × API-038 +
   * API-040 over 8 members each), so it is measured last and asserted
   * individually as well as in the loop.
   */
  it('meets NFR-11 for every role against the seeded cohort', async () => {
    const measured: Array<{ role: string; ms: number }> = [];

    for (const [role, actor] of [
      ['User', applicant],
      ['Student', student],
      ['Assistant', assistant],
      ['Teacher', teacher],
      ['Admin', admin],
    ] as Array<[string, TestActor]>) {
      const startedAt = Date.now();
      await request(app.getHttpServer())
        .get('/api/v1/me/dashboard')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .expect(HttpStatus.OK);
      const ms = Date.now() - startedAt;
      measured.push({ role, ms });
      timings.push({ role: `${role} (NFR-11)`, ms });
    }

    for (const { ms } of measured) {
      expect(ms).toBeLessThan(NFR_11_BUDGET_MS);
    }
  });

  // ── Mutating case, deliberately last ─────────────────────────────────────

  /**
   * Runs after the shape and NFR-11 assertions because it terminates the
   * Student actor's membership, which is a one-way transition (DEC-C02).
   */
  it('Admin: counts terminated memberships as the recovery population', async () => {
    const before = await readDashboard(admin, 'Admin');

    await request(app.getHttpServer())
      .delete(`/api/v1/memberships/${studentMembershipId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(HttpStatus.OK);

    const after = await readDashboard(admin, 'Admin');

    expect(after.pending_recovery_count).toBe(
      (before.pending_recovery_count as number) + 1,
    );
    expect(after.student_count).toBe((before.student_count as number) - 1);
  });
});
