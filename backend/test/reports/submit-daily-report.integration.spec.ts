/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
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

interface DailyReportRow {
  id: string;
  membership_id: string;
  report_date: string;
  type: string;
  submitted_timezone: string;
  no_memorization_today: boolean | null;
  memo_from_ordinal: number | null;
  memo_to_ordinal: number | null;
  memo_time_from: string | null;
  memo_time_to: string | null;
  completed_50_repetitions: boolean | null;
  repetitions_in_single_session: boolean | null;
  no_revision_today: boolean | null;
  rev_from_ordinal: number | null;
  rev_to_ordinal: number | null;
  rev_time_from: string | null;
  rev_time_to: string | null;
  read_tafsir: boolean | null;
  absence_reason: string | null;
  deleted_at: string | null;
}

interface HizbRow {
  hizb_number: number;
  start_ordinal: number;
  end_ordinal: number;
  start_surah: number;
  start_ayah: number;
  end_surah: number;
  end_ayah: number;
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

function shiftDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** ISO day-of-week (1 = Monday … 7 = Sunday) of a YYYY-MM-DD date. */
function isoDay(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

const NORMAL_BODY = {
  type: 'Normal',
  memo_range: { from: { surah: 2, ayah: 1 }, to: { surah: 2, ayah: 20 } },
  memo_time: { from: '18:00', to: '18:45' },
  completed_50_repetitions: true,
  repetitions_in_single_session: true,
  rev_range: { from: { surah: 1, ayah: 1 }, to: { surah: 1, ayah: 7 } },
  rev_time: { from: '19:00', to: '19:10' },
  read_tafsir: false,
};

describe('POST /daily-reports (F-DR-02 / API-030 Integration)', () => {
  jest.setTimeout(90000);

  let app: INestApplication<App>;
  let dataSource: DataSource;

  const testEmailDomain = '@test-submit-daily-report.com';
  const testGroupPrefix = 'F-DR-02 test group';
  const mockMailer: IMailer = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  };

  const today = todayIn(STUDENT_TIMEZONE);
  const todayIsoDay = isoDay(today);
  /** Any weekday that is NOT today, so the recitation-day rule stays out of the way. */
  const otherDay = (todayIsoDay % 7) + 1;

  let hizb1: HizbRow;

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

    const rows: HizbRow[] = await dataSource.query(
      'SELECT hizb_number, start_ordinal, end_ordinal, start_surah, start_ayah, end_surah, end_ayah FROM hizb_boundaries WHERE hizb_number = 1',
    );
    hizb1 = {
      hizb_number: Number(rows[0].hizb_number),
      start_ordinal: Number(rows[0].start_ordinal),
      end_ordinal: Number(rows[0].end_ordinal),
      start_surah: Number(rows[0].start_surah),
      start_ayah: Number(rows[0].start_ayah),
      end_surah: Number(rows[0].end_surah),
      end_ayah: Number(rows[0].end_ayah),
    };
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await cleanDatabase();
    }
    await app.close();
  });

  async function cleanDatabase(): Promise<void> {
    await dataSource.query(
      `DELETE FROM coverage_intervals
       WHERE coverage_id IN (
         SELECT c.id FROM memorization_coverage c
         JOIN memberships m ON m.id = c.membership_id
         WHERE m.user_id IN (SELECT id FROM users WHERE email LIKE $1)
       )`,
      [`%${testEmailDomain}`],
    );
    await dataSource.query(
      `DELETE FROM memorization_coverage
       WHERE membership_id IN (
         SELECT id FROM memberships
         WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)
       )`,
      [`%${testEmailDomain}`],
    );
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
    ahzabCompleted?: number;
    intervals?: Array<{ start: number; end: number }>;
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
    // INV-17: a live membership always has a coverage row.
    const coverageId = uuidv7();
    await dataSource.query(
      `INSERT INTO memorization_coverage (
         id, membership_id, ahzab_completed, last_memorized_ordinal,
         created_at, updated_at, deleted_at
       ) VALUES ($1, $2, $3, NULL, now(), now(), NULL)`,
      [coverageId, id, options.ahzabCompleted ?? 0],
    );
    for (const interval of options.intervals ?? []) {
      await dataSource.query(
        `INSERT INTO coverage_intervals (id, coverage_id, start_ordinal, end_ordinal)
         VALUES ($1, $2, $3, $4)`,
        [uuidv7(), coverageId, interval.start, interval.end],
      );
    }
    return id;
  }

  /** A Student with an Active membership in an Active group on a memorisation day. */
  async function eligibleStudent(options?: {
    ahzabCompleted?: number;
    intervals?: Array<{ start: number; end: number }>;
  }): Promise<TestActor & { membershipId: string }> {
    const student = await registerAndLogin(UserRole.Student);
    const groupId = await createGroup({ recitationDay: otherDay });
    const membershipId = await createMembership({
      userId: student.userId,
      groupId,
      state: 'Active',
      ...options,
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

  async function reportsOf(membershipId: string): Promise<DailyReportRow[]> {
    const rows: DailyReportRow[] = await dataSource.query(
      `SELECT id, membership_id, report_date::text AS report_date, type,
              submitted_timezone, no_memorization_today,
              memo_from_ordinal, memo_to_ordinal,
              memo_time_from::text AS memo_time_from, memo_time_to::text AS memo_time_to,
              completed_50_repetitions, repetitions_in_single_session,
              no_revision_today, rev_from_ordinal, rev_to_ordinal,
              rev_time_from::text AS rev_time_from, rev_time_to::text AS rev_time_to,
              read_tafsir, absence_reason, deleted_at::text AS deleted_at
         FROM daily_reports WHERE membership_id = $1 ORDER BY report_date`,
      [membershipId],
    );
    return rows.map((r) => ({
      ...r,
      memo_from_ordinal:
        r.memo_from_ordinal == null ? null : Number(r.memo_from_ordinal),
      memo_to_ordinal:
        r.memo_to_ordinal == null ? null : Number(r.memo_to_ordinal),
      rev_from_ordinal:
        r.rev_from_ordinal == null ? null : Number(r.rev_from_ordinal),
      rev_to_ordinal:
        r.rev_to_ordinal == null ? null : Number(r.rev_to_ordinal),
    }));
  }

  function submit(actor: TestActor, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/api/v1/daily-reports')
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .send(body);
  }

  function assertCleanEnvelope(body: Record<string, unknown>): void {
    expect(body.correlationId).toBeDefined();
    expect(body).not.toHaveProperty('data');
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/duplicate key/i);
    expect(serialized).not.toMatch(/violates/i);
    expect(serialized).not.toMatch(/DB-UQ-04/);
    expect(serialized).not.toMatch(/ordinal/);
    expect(serialized).not.toMatch(/at .+:[0-9]+:[0-9]+/);
  }

  describe('201 — all three types', () => {
    it('Normal: persists ranges as ordinals, merges the memo range synchronously and returns the post-merge ahzab_completed', async () => {
      const student = await eligibleStudent({ ahzabCompleted: 0 });
      const body = {
        ...NORMAL_BODY,
        memo_range: {
          from: { surah: hizb1.start_surah, ayah: hizb1.start_ayah },
          to: { surah: hizb1.end_surah, ayah: hizb1.end_ayah },
        },
        report_date: today,
      };

      const response = await submit(student, body).expect(HttpStatus.CREATED);

      expect(response.body).toEqual({
        data: {
          id: expect.any(String),
          report_date: today,
          type: 'Normal',
          ahzab_completed: 1,
          coverage_updated: true,
        },
      });
      expect(JSON.stringify(response.body)).not.toContain('ordinal');

      const [row] = await reportsOf(student.membershipId);
      expect(row).toMatchObject({
        id: response.body.data.id,
        report_date: today,
        type: 'Normal',
        submitted_timezone: STUDENT_TIMEZONE,
        no_memorization_today: false,
        memo_from_ordinal: hizb1.start_ordinal,
        memo_to_ordinal: hizb1.end_ordinal,
        memo_time_from: '18:00:00',
        memo_time_to: '18:45:00',
        completed_50_repetitions: true,
        repetitions_in_single_session: true,
        no_revision_today: false,
        rev_from_ordinal: await ordinalOf(1, 1),
        rev_to_ordinal: await ordinalOf(1, 7),
        rev_time_from: '19:00:00',
        rev_time_to: '19:10:00',
        read_tafsir: false,
        absence_reason: null,
        deleted_at: null,
      });

      // DS-05 ran: coverage row updated, interval persisted (DBT-09/10).
      const coverage: Array<{
        ahzab_completed: number | string;
        last_memorized_ordinal: number | string;
      }> = await dataSource.query(
        'SELECT ahzab_completed, last_memorized_ordinal FROM memorization_coverage WHERE membership_id = $1',
        [student.membershipId],
      );
      expect(Number(coverage[0].ahzab_completed)).toBe(1);
      expect(Number(coverage[0].last_memorized_ordinal)).toBe(
        hizb1.end_ordinal,
      );
      const intervals: Array<{
        start_ordinal: number | string;
        end_ordinal: number | string;
      }> = await dataSource.query(
        `SELECT i.start_ordinal, i.end_ordinal FROM coverage_intervals i
          JOIN memorization_coverage c ON c.id = i.coverage_id
         WHERE c.membership_id = $1`,
        [student.membershipId],
      );
      expect(
        intervals.map((i) => [Number(i.start_ordinal), Number(i.end_ordinal)]),
      ).toEqual([[hizb1.start_ordinal, hizb1.end_ordinal]]);

      // API-029 now reports it as today's report (AC-07).
      const status = await request(app.getHttpServer())
        .get('/api/v1/daily-reports/today')
        .set('Authorization', `Bearer ${student.accessToken}`)
        .expect(HttpStatus.OK);
      expect(status.body.data.block_reason).toBe('already_submitted');
      expect(status.body.data.existing_report.id).toBe(response.body.data.id);
    });

    it('Normal with neither range is accepted (BR-48): both no_* flags true, coverage untouched, stored ahzab returned', async () => {
      const student = await eligibleStudent({
        ahzabCompleted: 3,
        intervals: [{ start: 1, end: 7 }],
      });

      const response = await submit(student, { type: 'Normal' }).expect(
        HttpStatus.CREATED,
      );

      expect(response.body.data).toMatchObject({
        type: 'Normal',
        ahzab_completed: 3,
        coverage_updated: false,
      });
      const [row] = await reportsOf(student.membershipId);
      expect(row).toMatchObject({
        no_memorization_today: true,
        memo_from_ordinal: null,
        memo_time_from: null,
        completed_50_repetitions: null,
        repetitions_in_single_session: null,
        no_revision_today: true,
        rev_from_ordinal: null,
        read_tafsir: null,
        absence_reason: null,
      });
      const intervals: unknown[] = await dataSource.query(
        `SELECT i.id FROM coverage_intervals i
          JOIN memorization_coverage c ON c.id = i.coverage_id
         WHERE c.membership_id = $1`,
        [student.membershipId],
      );
      expect(intervals).toHaveLength(1);
    });

    it('Absent: persists the reason only', async () => {
      const student = await eligibleStudent({ ahzabCompleted: 2 });

      const response = await submit(student, {
        type: 'Absent',
        absence_reason: 'Sick',
      }).expect(HttpStatus.CREATED);

      expect(response.body.data).toEqual({
        id: expect.any(String),
        report_date: today,
        type: 'Absent',
        ahzab_completed: 2,
        coverage_updated: false,
      });
      const [row] = await reportsOf(student.membershipId);
      expect(row).toMatchObject({
        type: 'Absent',
        absence_reason: 'Sick',
        no_memorization_today: null,
        no_revision_today: null,
        memo_from_ordinal: null,
        rev_from_ordinal: null,
        read_tafsir: null,
      });
    });

    it('Revision: persists the revision range and time, nothing else', async () => {
      const student = await eligibleStudent({ ahzabCompleted: 7 });

      const response = await submit(student, {
        type: 'Revision',
        rev_range: { from: { surah: 1, ayah: 1 }, to: { surah: 2, ayah: 5 } },
        rev_time: { from: '20:00', to: '20:30' },
      }).expect(HttpStatus.CREATED);

      expect(response.body.data).toMatchObject({
        type: 'Revision',
        ahzab_completed: 7,
        coverage_updated: false,
      });
      const [row] = await reportsOf(student.membershipId);
      expect(row).toMatchObject({
        type: 'Revision',
        no_memorization_today: null,
        memo_from_ordinal: null,
        completed_50_repetitions: null,
        no_revision_today: false,
        rev_from_ordinal: await ordinalOf(1, 1),
        rev_to_ordinal: await ordinalOf(2, 5),
        rev_time_from: '20:00:00',
        rev_time_to: '20:30:00',
        read_tafsir: null,
        absence_reason: null,
      });
    });
  });

  describe('409 DUPLICATE_REPORT (BR-19, DB-UQ-04, APIQ-09)', () => {
    it('returns the full existing report in the error body — identical to API-029 existing_report', async () => {
      const student = await eligibleStudent({ ahzabCompleted: 0 });
      const first = await submit(student, NORMAL_BODY).expect(
        HttpStatus.CREATED,
      );

      const duplicate = await submit(student, {
        type: 'Absent',
        absence_reason: 'Other',
      }).expect(HttpStatus.CONFLICT);

      expect(duplicate.body.statusCode).toBe(409);
      expect(duplicate.body.error).toBe('DUPLICATE_REPORT');
      expect(duplicate.body.message).toBe('لقد قمت بإرسال تقرير اليوم مسبقاً');
      expect(duplicate.body.details).toBeUndefined();
      assertCleanEnvelope(duplicate.body);
      expect(duplicate.body.existing_report).toEqual({
        id: first.body.data.id,
        report_date: today,
        type: 'Normal',
        submitted_at: expect.any(String),
        submitted_timezone: STUDENT_TIMEZONE,
        no_memorization_today: false,
        memo_range: NORMAL_BODY.memo_range,
        memo_time: NORMAL_BODY.memo_time,
        completed_50_repetitions: true,
        repetitions_in_single_session: true,
        no_revision_today: false,
        rev_range: NORMAL_BODY.rev_range,
        rev_time: NORMAL_BODY.rev_time,
        read_tafsir: false,
        absence_reason: null,
      });

      const status = await request(app.getHttpServer())
        .get('/api/v1/daily-reports/today')
        .set('Authorization', `Bearer ${student.accessToken}`)
        .expect(HttpStatus.OK);
      expect(duplicate.body.existing_report).toEqual(
        status.body.data.existing_report,
      );

      expect(await reportsOf(student.membershipId)).toHaveLength(1);
    });

    it('two near-simultaneous submissions: exactly one 201 and one 409 (TS §20 concurrency hazard)', async () => {
      const student = await eligibleStudent({ ahzabCompleted: 0 });

      const [a, b] = await Promise.all([
        submit(student, { type: 'Absent', absence_reason: 'Sick' }),
        submit(student, { type: 'Absent', absence_reason: 'Studying' }),
      ]);

      expect([a.status, b.status].sort()).toEqual([201, 409]);
      const conflict = a.status === 409 ? a : b;
      expect(conflict.body.error).toBe('DUPLICATE_REPORT');
      expect(conflict.body.existing_report.type).toBe('Absent');
      assertCleanEnvelope(conflict.body);
      expect(await reportsOf(student.membershipId)).toHaveLength(1);
    });
  });

  describe('422 business rules', () => {
    it('BACKDATED when report_date is not today in the student timezone (VR-10, no grace period)', async () => {
      const student = await eligibleStudent();

      for (const reportDate of [shiftDate(today, -1), shiftDate(today, 1)]) {
        const response = await submit(student, {
          type: 'Absent',
          absence_reason: 'Sick',
          report_date: reportDate,
        }).expect(HttpStatus.UNPROCESSABLE_ENTITY);
        expect(response.body.error).toBe('BACKDATED');
        expect(response.body.details).toBeUndefined();
        assertCleanEnvelope(response.body);
      }
      expect(await reportsOf(student.membershipId)).toHaveLength(0);
    });

    it('RECITATION_DAY when today is the group recitation day (VR-12)', async () => {
      const student = await registerAndLogin(UserRole.Student);
      const groupId = await createGroup({ recitationDay: todayIsoDay });
      const membershipId = await createMembership({
        userId: student.userId,
        groupId,
        state: 'Active',
      });

      const response = await submit(student, NORMAL_BODY).expect(
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
      expect(response.body.error).toBe('RECITATION_DAY');
      expect(response.body.details).toBeUndefined();
      assertCleanEnvelope(response.body);
      expect(await reportsOf(membershipId)).toHaveLength(0);
    });
  });

  describe('403 — archived group / inactive membership (VR-35)', () => {
    it('rejects a Student whose group is Archived', async () => {
      const student = await registerAndLogin(UserRole.Student);
      const groupId = await createGroup({
        recitationDay: otherDay,
        lifecycleState: 'Archived',
      });
      const membershipId = await createMembership({
        userId: student.userId,
        groupId,
        state: 'Active',
      });

      const response = await submit(student, NORMAL_BODY).expect(
        HttpStatus.FORBIDDEN,
      );
      expect(response.body.error).toBe('SCOPE_DENIED');
      assertCleanEnvelope(response.body);
      expect(await reportsOf(membershipId)).toHaveLength(0);
    });

    it('rejects a Student whose only membership is Terminated', async () => {
      const student = await registerAndLogin(UserRole.Student);
      const groupId = await createGroup({ recitationDay: otherDay });
      const membershipId = await createMembership({
        userId: student.userId,
        groupId,
        state: 'Terminated',
      });

      const response = await submit(student, NORMAL_BODY).expect(
        HttpStatus.FORBIDDEN,
      );
      expect(response.body.error).toBe('SCOPE_DENIED');
      expect(await reportsOf(membershipId)).toHaveLength(0);
    });

    it('rejects a Student with no membership at all', async () => {
      const student = await registerAndLogin(UserRole.Student);
      const response = await submit(student, NORMAL_BODY).expect(
        HttpStatus.FORBIDDEN,
      );
      expect(response.body.error).toBe('SCOPE_DENIED');
    });
  });

  describe('422 field-level failures (APIS §10.7 table) — nothing is stored (UC-05 E1)', () => {
    const cases: Array<[string, Record<string, unknown>, string]> = [
      [
        'Absent without absence_reason (VR-19)',
        { type: 'Absent' },
        'absence_reason',
      ],
      [
        'Absent with an unknown reason (VR-19)',
        { type: 'Absent', absence_reason: 'Holiday' },
        'absence_reason',
      ],
      [
        'absence_reason on a Normal report',
        { type: 'Normal', absence_reason: 'Sick' },
        'absence_reason',
      ],
      [
        'memo_range without memo_time (VR-16)',
        {
          type: 'Normal',
          memo_range: NORMAL_BODY.memo_range,
          completed_50_repetitions: false,
        },
        'memo_time',
      ],
      [
        'memo_time without memo_range (VR-16)',
        { type: 'Normal', memo_time: NORMAL_BODY.memo_time },
        'memo_time',
      ],
      [
        'memo_range without completed_50_repetitions',
        {
          type: 'Normal',
          memo_range: NORMAL_BODY.memo_range,
          memo_time: NORMAL_BODY.memo_time,
        },
        'completed_50_repetitions',
      ],
      [
        'repetitions_in_single_session=true without the 50 repetitions (VR-18)',
        {
          ...NORMAL_BODY,
          completed_50_repetitions: false,
          repetitions_in_single_session: true,
        },
        'repetitions_in_single_session',
      ],
      [
        'memo_time not later than memo_time.from (VR-15)',
        { ...NORMAL_BODY, memo_time: { from: '18:45', to: '18:45' } },
        'memo_time',
      ],
      [
        'rev_time not in HH:MM (VR-15)',
        { ...NORMAL_BODY, rev_time: { from: '7pm', to: '19:10' } },
        'rev_time',
      ],
      [
        'Revision without rev_range (VR-20)',
        { type: 'Revision', rev_time: NORMAL_BODY.rev_time },
        'rev_range',
      ],
      [
        'rev_range without rev_time (VR-17)',
        { type: 'Revision', rev_range: NORMAL_BODY.rev_range },
        'rev_time',
      ],
      [
        'rev_time without rev_range on a Normal report (VR-17)',
        { type: 'Normal', rev_time: NORMAL_BODY.rev_time },
        'rev_time',
      ],
      [
        'memo fields on a Revision report (UF §15)',
        {
          type: 'Revision',
          rev_range: NORMAL_BODY.rev_range,
          rev_time: NORMAL_BODY.rev_time,
          memo_range: NORMAL_BODY.memo_range,
          memo_time: NORMAL_BODY.memo_time,
          completed_50_repetitions: true,
          repetitions_in_single_session: true,
        },
        'memo_range',
      ],
      [
        'read_tafsir on a Revision report (ISS-12: Normal only)',
        {
          type: 'Revision',
          rev_range: NORMAL_BODY.rev_range,
          rev_time: NORMAL_BODY.rev_time,
          read_tafsir: true,
        },
        'read_tafsir',
      ],
      [
        'reverse-order range within the report (VR-14a / BR-52)',
        {
          ...NORMAL_BODY,
          memo_range: {
            from: { surah: 2, ayah: 20 },
            to: { surah: 2, ayah: 1 },
          },
        },
        'memo_range',
      ],
      [
        'ayah beyond the surah ayah_count (VR-13 / FR-PROG-05)',
        {
          ...NORMAL_BODY,
          rev_range: { from: { surah: 1, ayah: 1 }, to: { surah: 1, ayah: 8 } },
        },
        'rev_range',
      ],
      [
        'surah outside 1..114 (VR-13)',
        {
          ...NORMAL_BODY,
          memo_range: {
            from: { surah: 115, ayah: 1 },
            to: { surah: 115, ayah: 1 },
          },
        },
        'memo_range',
      ],
      ['unknown type', { type: 'Weekly' }, 'type'],
      [
        'malformed report_date',
        { type: 'Absent', absence_reason: 'Sick', report_date: '02/09/2026' },
        'report_date',
      ],
      [
        'server-derived flag sent by the client (whitelist)',
        { type: 'Absent', absence_reason: 'Sick', no_memorization_today: true },
        'no_memorization_today',
      ],
      [
        'mass assignment of membership_id (TS §36)',
        { type: 'Absent', absence_reason: 'Sick', membership_id: uuidv7() },
        'membership_id',
      ],
    ];

    it.each(cases)(
      '%s → 422 VALIDATION_ERROR on %s',
      async (_name, body, field) => {
        const student = await eligibleStudent();

        const response = await submit(student, body).expect(
          HttpStatus.UNPROCESSABLE_ENTITY,
        );

        expect(response.body.statusCode).toBe(422);
        expect(response.body.error).toBe('VALIDATION_ERROR');
        expect(Array.isArray(response.body.details)).toBe(true);
        expect(
          (response.body.details as Array<{ field: string }>).map(
            (d) => d.field,
          ),
        ).toContain(field);
        for (const detail of response.body.details as Array<{
          message: string;
        }>) {
          expect(detail.message).toMatch(/[؀-ۿ]/);
        }
        assertCleanEnvelope(response.body);
        expect(await reportsOf(student.membershipId)).toHaveLength(0);
      },
    );
  });

  describe('DB-CHK-07 immutability trigger (BR-22, ADR-010)', () => {
    it('rejects any UPDATE of a report column, including by the submitting student path (raw SQL), while deleted_at stays writable', async () => {
      const student = await eligibleStudent({ ahzabCompleted: 0 });
      const created = await submit(student, NORMAL_BODY).expect(
        HttpStatus.CREATED,
      );
      const id = created.body.data.id as string;

      await expect(
        dataSource.query(
          `UPDATE daily_reports SET type = 'Absent' WHERE id = $1`,
          [id],
        ),
      ).rejects.toThrow(/immutable/);
      await expect(
        dataSource.query(
          `UPDATE daily_reports SET completed_50_repetitions = false WHERE id = $1`,
          [id],
        ),
      ).rejects.toThrow(/immutable/);
      await expect(
        dataSource.query(
          `UPDATE daily_reports SET report_date = $2::date WHERE id = $1`,
          [id, shiftDate(today, -1)],
        ),
      ).rejects.toThrow(/immutable/);
      await expect(
        dataSource.query(
          `UPDATE daily_reports SET memo_to_ordinal = memo_to_ordinal + 1 WHERE id = $1`,
          [id],
        ),
      ).rejects.toThrow(/immutable/);

      // Soft delete (cascade of membership termination) is the one permitted write.
      await dataSource.query(
        `UPDATE daily_reports SET deleted_at = now() WHERE id = $1`,
        [id],
      );
      const [row] = await reportsOf(student.membershipId);
      expect(row.type).toBe('Normal');
      expect(row.deleted_at).not.toBeNull();
    });
  });

  describe('authorization (APIS §6.1, TS §36)', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/daily-reports')
        .send(NORMAL_BODY)
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

        const response = await submit(actor, NORMAL_BODY).expect(
          HttpStatus.FORBIDDEN,
        );

        expect(response.body.statusCode).toBe(HttpStatus.FORBIDDEN);
        expect(response.body.error).toBe('SCOPE_DENIED');
        assertCleanEnvelope(response.body);
      },
    );
  });
});
