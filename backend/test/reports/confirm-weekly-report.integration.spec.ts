/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { HttpStatus, INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
import { WeeklyReportFinalisedEvent } from '../../src/modules/reports/domain/events/weekly-report-finalised.event';
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

describe('POST /weekly-reports/{id}/confirm (F-WR-02 / API-034 Integration)', () => {
  jest.setTimeout(60000);

  let app: INestApplication<App>;
  let dataSource: DataSource;
  let eventEmitter: EventEmitter2;

  const testEmailDomain = '@test-confirm-weekly-report.com';
  const testGroupPrefix = 'F-WR-02 test group';
  const mockMailer: IMailer = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  };

  const today = todayIn(STUDENT_TIMEZONE);
  const todayIsoDay = isoDay(today);
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

    // Deterministic clock for this suite: the 15-minute tick must not
    // finalise the overdue Open fixtures behind the assertions.
    await app
      .get(SchedulerRegistry)
      .getCronJob(WEEKLY_REPORT_FINALIZATION_CRON)
      .stop();

    dataSource = app.get(DataSource);
    eventEmitter = app.get(EventEmitter2);
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

  async function createGroup(recitationDay: number): Promise<string> {
    const teacher = await registerAndLogin(UserRole.Teacher);
    const assistant = await registerAndLogin(UserRole.Assistant);
    const id = uuidv7();
    await dataSource.query(
      `INSERT INTO groups (
         id, name, gender, recitation_day, enrollment_status,
         lifecycle_state, archived_at, teacher_id, assistant_id, created_by,
         created_at, updated_at
       ) VALUES ($1, $2, 'Male', $3, 'Closed', 'Active', NULL, $4, $5, $4, now(), now())`,
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

  async function createMembership(
    userId: string,
    groupId: string,
    state: 'Active' | 'Terminated' = 'Active',
  ): Promise<string> {
    const id = uuidv7();
    await dataSource.query(
      `INSERT INTO memberships (
         id, user_id, group_id, state, started_at, ended_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5::date, $6, now(), now())`,
      [
        id,
        userId,
        groupId,
        state,
        startedLongAgo,
        state === 'Terminated' ? shift(today, -1) : null,
      ],
    );
    return id;
  }

  async function enrolStudent(
    recitationDay: number = todayIsoDay,
    timezone: string = STUDENT_TIMEZONE,
  ): Promise<TestActor & { membershipId: string }> {
    const student = await registerAndLogin(UserRole.Student, timezone);
    const groupId = await createGroup(recitationDay);
    const membershipId = await createMembership(student.userId, groupId);
    return { ...student, membershipId };
  }

  /** A raw E-06 row with a fixed, recognisable metric snapshot. */
  async function insertWeeklyRow(options: {
    membershipId: string;
    weekEnd: string;
    state?: 'Open' | 'Finalised';
    attended?: boolean;
    finalisedBy?: string | null;
    deleted?: boolean;
  }): Promise<string> {
    const id = uuidv7();
    const state = options.state ?? 'Open';
    await dataSource.query(
      `INSERT INTO weekly_reports (
         id, membership_id, week_start, week_end, expected_days,
         missed_daily_reports, missed_daily_memorization, missed_daily_revision,
         missed_50_repetitions, missed_single_session, attended_recitation_call,
         state, finalised_at, finalised_by, deleted_at
       ) VALUES ($1, $2, $3::date, $4::date, 6, 1, 2, 3, 4, 5, $5, $6, $7, $8, $9)`,
      [
        id,
        options.membershipId,
        shift(options.weekEnd, -6),
        options.weekEnd,
        options.attended ?? false,
        state,
        state === 'Finalised' ? new Date() : null,
        options.finalisedBy ?? null,
        options.deleted ? new Date() : null,
      ],
    );
    return id;
  }

  async function rowById(id: string): Promise<WeeklyReportRow> {
    const rows: WeeklyReportRow[] = await dataSource.query(
      `SELECT id, week_start::text AS week_start, week_end::text AS week_end,
              expected_days, missed_daily_reports, missed_daily_memorization,
              missed_daily_revision, missed_50_repetitions, missed_single_session,
              attended_recitation_call, state, finalised_at, finalised_by
         FROM weekly_reports WHERE id = $1`,
      [id],
    );
    return rows[0];
  }

  function confirm(
    actor: TestActor,
    id: string,
    body: Record<string, unknown> = { attended_recitation_call: true },
  ) {
    return request(app.getHttpServer())
      .post(`/api/v1/weekly-reports/${id}/confirm`)
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .send(body);
  }

  describe('valid confirm (UC-06 main scenario)', () => {
    it('finalises the row lazily created by API-033 on the recitation day, snapshotting exactly what it holds', async () => {
      const student = await enrolStudent();
      const current = await request(app.getHttpServer())
        .get('/api/v1/weekly-reports/current')
        .set('Authorization', `Bearer ${student.accessToken}`)
        .expect(HttpStatus.OK);
      const id = current.body.data.id as string;
      expect(current.body.data.can_confirm).toBe(true);

      const received: WeeklyReportFinalisedEvent[] = [];
      const listener = (event: WeeklyReportFinalisedEvent) => {
        received.push(event);
      };
      eventEmitter.on(WeeklyReportFinalisedEvent.EVENT_NAME, listener);

      const response = await confirm(student, id).expect(HttpStatus.OK);

      eventEmitter.off(WeeklyReportFinalisedEvent.EVENT_NAME, listener);

      expect(response.body).toEqual({
        data: {
          id,
          week_start: shift(today, -6),
          week_end: today,
          expected_days: current.body.data.expected_days,
          missed_daily_reports: current.body.data.missed_daily_reports,
          missed_daily_memorization:
            current.body.data.missed_daily_memorization,
          missed_daily_revision: current.body.data.missed_daily_revision,
          missed_50_repetitions: current.body.data.missed_50_repetitions,
          missed_single_session: current.body.data.missed_single_session,
          attended_recitation_call: true,
          state: 'Finalised',
          finalised_at: expect.any(String),
          finalised_by: 'Student',
        },
      });

      const row = await rowById(id);
      expect(row).toMatchObject({
        attended_recitation_call: true,
        state: 'Finalised',
        finalised_by: student.userId,
      });
      expect(row.finalised_at).not.toBeNull();

      // DE-07 post-commit with finalised_by = the student.
      expect(received).toHaveLength(1);
      expect(received[0]).toEqual(
        expect.objectContaining({
          membershipId: student.membershipId,
          week: { weekStart: shift(today, -6), weekEnd: today },
          attended: true,
          finalisedBy: student.userId,
        }),
      );

      // API-033 now serves the finalised row, never confirmable again.
      const after = await request(app.getHttpServer())
        .get('/api/v1/weekly-reports/current')
        .set('Authorization', `Bearer ${student.accessToken}`)
        .expect(HttpStatus.OK);
      expect(after.body.data).toMatchObject({
        id,
        state: 'Finalised',
        attended_recitation_call: true,
        can_confirm: false,
      });
    });

    it('records attended = false when the student answers No, leaving the six metrics untouched', async () => {
      const student = await enrolStudent();
      const id = await insertWeeklyRow({
        membershipId: student.membershipId,
        weekEnd: today,
      });

      const response = await confirm(student, id, {
        attended_recitation_call: false,
      }).expect(HttpStatus.OK);

      expect(response.body.data).toMatchObject({
        id,
        expected_days: 6,
        missed_daily_reports: 1,
        missed_daily_memorization: 2,
        missed_daily_revision: 3,
        missed_50_repetitions: 4,
        missed_single_session: 5,
        attended_recitation_call: false,
        state: 'Finalised',
        finalised_by: 'Student',
      });
      expect(await rowById(id)).toMatchObject({
        expected_days: 6,
        missed_daily_reports: 1,
        missed_single_session: 5,
        attended_recitation_call: false,
        state: 'Finalised',
        finalised_by: student.userId,
      });
    });

    it('rejects a non-boolean or extra field with 422 VALIDATION_ERROR details (TS §21 transport layer)', async () => {
      const student = await enrolStudent();
      const id = await insertWeeklyRow({
        membershipId: student.membershipId,
        weekEnd: today,
      });

      const missing = await confirm(student, id, {}).expect(
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
      expect(missing.body.error).toBe('VALIDATION_ERROR');
      expect(missing.body.details).toEqual([
        expect.objectContaining({ field: 'attended_recitation_call' }),
      ]);

      const extra = await confirm(student, id, {
        attended_recitation_call: true,
        state: 'Open',
      }).expect(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(extra.body.error).toBe('VALIDATION_ERROR');

      expect((await rowById(id)).state).toBe('Open');
    });
  });

  describe('wrong day (VR-21, EC-41, EC-24)', () => {
    it('answers 422 NOT_RECITATION_DAY before the recitation day and writes nothing', async () => {
      const student = await enrolStudent(isoDay(shift(today, 2)));
      const id = await insertWeeklyRow({
        membershipId: student.membershipId,
        weekEnd: shift(today, 2),
      });

      const response = await confirm(student, id).expect(
        HttpStatus.UNPROCESSABLE_ENTITY,
      );

      expect(response.body).toMatchObject({
        statusCode: 422,
        error: 'NOT_RECITATION_DAY',
      });
      expect(typeof response.body.message).toBe('string');
      expect(response.body.correlationId).toBeDefined();
      expect(await rowById(id)).toMatchObject({
        state: 'Open',
        attended_recitation_call: false,
        finalised_at: null,
      });
    });

    it('never allows retroactive confirmation of an Open row whose day has passed (EC-24, BR-30)', async () => {
      const student = await enrolStudent(isoDay(shift(today, -1)));
      const id = await insertWeeklyRow({
        membershipId: student.membershipId,
        weekEnd: shift(today, -1),
      });

      const response = await confirm(student, id).expect(
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
      expect(response.body.error).toBe('NOT_RECITATION_DAY');
      expect((await rowById(id)).state).toBe('Open');
    });
  });

  describe('already finalised (VR-36, EC-40)', () => {
    it('answers 409 ALREADY_FINALISED on a second confirm and rewrites nothing', async () => {
      const student = await enrolStudent();
      const id = await insertWeeklyRow({
        membershipId: student.membershipId,
        weekEnd: today,
      });
      await confirm(student, id, { attended_recitation_call: true }).expect(
        HttpStatus.OK,
      );
      const first = await rowById(id);

      const response = await confirm(student, id, {
        attended_recitation_call: false,
      }).expect(HttpStatus.CONFLICT);

      expect(response.body).toMatchObject({
        statusCode: 409,
        error: 'ALREADY_FINALISED',
      });
      expect(response.body).not.toHaveProperty('details');
      expect(await rowById(id)).toEqual(first);
    });

    it('answers 409 ALREADY_FINALISED after the scheduler defaulted the week (UF §16 "scheduler beat the student")', async () => {
      const student = await enrolStudent(isoDay(shift(today, -1)));
      const id = await insertWeeklyRow({
        membershipId: student.membershipId,
        weekEnd: shift(today, -1),
        state: 'Finalised',
        finalisedBy: null,
      });

      const response = await confirm(student, id).expect(HttpStatus.CONFLICT);

      expect(response.body.error).toBe('ALREADY_FINALISED');
      expect(await rowById(id)).toMatchObject({
        state: 'Finalised',
        attended_recitation_call: false,
        finalised_by: null,
      });
    });

    it('lets exactly one of two near-simultaneous confirms win (TS §20, DB-CHK-08 backstop)', async () => {
      const student = await enrolStudent();
      const id = await insertWeeklyRow({
        membershipId: student.membershipId,
        weekEnd: today,
      });

      const [a, b] = await Promise.all([
        confirm(student, id, { attended_recitation_call: true }),
        confirm(student, id, { attended_recitation_call: false }),
      ]);

      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([200, 409]);
      const winner = a.status === 200 ? a : b;
      expect((await rowById(id)).attended_recitation_call).toBe(
        winner.body.data.attended_recitation_call,
      );
    });
  });

  describe('scope (own reports only, SA §14 / NFR-20)', () => {
    it("answers the uniform 403 SCOPE_DENIED for another student's report and leaves it Open", async () => {
      const owner = await enrolStudent();
      const other = await enrolStudent();
      const id = await insertWeeklyRow({
        membershipId: owner.membershipId,
        weekEnd: today,
      });

      const response = await confirm(other, id).expect(HttpStatus.FORBIDDEN);

      expect(response.body).toMatchObject({
        statusCode: 403,
        error: 'SCOPE_DENIED',
      });
      expect(response.body).not.toHaveProperty('data');
      expect((await rowById(id)).state).toBe('Open');
    });

    it('answers the same 403 SCOPE_DENIED for a well-formed id that does not exist', async () => {
      const student = await enrolStudent();

      const response = await confirm(student, uuidv7()).expect(
        HttpStatus.FORBIDDEN,
      );
      expect(response.body.error).toBe('SCOPE_DENIED');
    });

    it('answers the same 403 SCOPE_DENIED for an own row soft-deleted by termination', async () => {
      const student = await registerAndLogin(UserRole.Student);
      const groupId = await createGroup(todayIsoDay);
      const membershipId = await createMembership(
        student.userId,
        groupId,
        'Terminated',
      );
      const id = await insertWeeklyRow({
        membershipId,
        weekEnd: today,
        deleted: true,
      });

      const response = await confirm(student, id).expect(HttpStatus.FORBIDDEN);
      expect(response.body.error).toBe('SCOPE_DENIED');
    });

    it('answers 404 NOT_FOUND for a malformed id (APIS §9.6)', async () => {
      const student = await enrolStudent();

      const response = await confirm(student, 'not-a-uuid').expect(
        HttpStatus.NOT_FOUND,
      );
      expect(response.body.error).toBe('NOT_FOUND');
    });
  });

  describe('authorization (APIS §6.1, TS §36)', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/weekly-reports/${uuidv7()}/confirm`)
        .send({ attended_recitation_call: true })
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it.each([
      UserRole.User,
      UserRole.Teacher,
      UserRole.Assistant,
      UserRole.Admin,
    ])(
      'returns 403 SCOPE_DENIED for the %s role on an existing Open row (Assistant blocked by RolesGuard alone, DEC-B09)',
      async (role) => {
        const owner = await enrolStudent();
        const id = await insertWeeklyRow({
          membershipId: owner.membershipId,
          weekEnd: today,
        });
        const actor = await registerAndLogin(role);

        const response = await confirm(actor, id).expect(HttpStatus.FORBIDDEN);

        expect(response.body.statusCode).toBe(HttpStatus.FORBIDDEN);
        expect(response.body.error).toBe('SCOPE_DENIED');
        expect(response.body).not.toHaveProperty('data');
        expect(response.body.correlationId).toBeDefined();
        expect((await rowById(id)).state).toBe('Open');
      },
    );
  });
});
