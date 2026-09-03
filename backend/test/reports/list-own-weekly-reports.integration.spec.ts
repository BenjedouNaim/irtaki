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
  decodeCursor,
  encodeCursor,
} from '../../src/shared/pagination/cursor.util';
import { stopScheduledJobs } from '../shared/scheduled-jobs';

interface TestActor {
  accessToken: string;
  userId: string;
}

interface ListBody {
  data: Array<{ id: string; week_start: string }>;
  pagination: { next_cursor: string | null; has_more: boolean };
}

function weekStartsOf(body: unknown): string[] {
  return (body as ListBody).data.map((r) => r.week_start);
}

function idsOf(body: unknown): string[] {
  return (body as ListBody).data.map((r) => r.id);
}

/** Independent UTC date arithmetic on a YYYY-MM-DD value. */
function shift(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const STUDENT_TIMEZONE = 'Africa/Tunis';

describe('GET /weekly-reports (F-WR-03 / API-035 Integration)', () => {
  jest.setTimeout(60000);

  let app: INestApplication<App>;
  let dataSource: DataSource;

  const testEmailDomain = '@test-list-own-weekly-reports.com';
  const testGroupPrefix = 'F-WR-03 test group';
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
    app.setGlobalPrefix('api/v1');
    await app.init();

    // ADR-024's crons are live inside a booted AppModule; every suite
    // drives the jobs it cares about with its own clock instead.
    stopScheduledJobs(app);

    // Deterministic fixtures: the 15-minute tick must not finalise the
    // Open row this suite asserts is excluded from the history.
    await app
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

    // Reuse the single Admin row via the password-reset trick (house pattern,
    // DB-UQ-08: exactly one Admin system-wide).
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

  async function createGroup(): Promise<string> {
    const teacher = await registerAndLogin(UserRole.Teacher);
    const assistant = await registerAndLogin(UserRole.Assistant);
    const id = uuidv7();
    await dataSource.query(
      `INSERT INTO groups (
         id, name, gender, recitation_day, enrollment_status,
         lifecycle_state, archived_at, teacher_id, assistant_id, created_by,
         created_at, updated_at
       ) VALUES ($1, $2, 'Male', 5, 'Closed', 'Active', NULL, $3, $4, $3, now(), now())`,
      [id, `${testGroupPrefix} ${uuidv7()}`, teacher.userId, assistant.userId],
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
       ) VALUES ($1, $2, $3, $4, '2026-01-01', $5, now(), now())`,
      [
        id,
        options.userId,
        options.groupId,
        options.state,
        options.state === 'Terminated' ? '2026-07-15' : null,
      ],
    );
    return id;
  }

  /**
   * A raw E-06 row (DBT-07) with a fixed, recognisable metric snapshot.
   * `weekStart` is the DB-UQ-05 key; `week_end` is six days later.
   */
  async function insertWeeklyRow(options: {
    membershipId: string;
    weekStart: string;
    state?: 'Open' | 'Finalised';
    attended?: boolean;
    finalisedBy?: string | null;
    deleted?: boolean;
  }): Promise<string> {
    const id = uuidv7();
    const state = options.state ?? 'Finalised';
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
        options.weekStart,
        shift(options.weekStart, 6),
        options.attended ?? false,
        state,
        state === 'Finalised'
          ? `${shift(options.weekStart, 6)}T09:00:00Z`
          : null,
        options.finalisedBy ?? null,
        options.deleted ? new Date() : null,
      ],
    );
    return id;
  }

  async function studentWithWeeks(weekStarts: string[]): Promise<{
    student: TestActor;
    membershipId: string;
    groupId: string;
    idsByWeek: Record<string, string>;
  }> {
    const student = await registerAndLogin(UserRole.Student);
    const groupId = await createGroup();
    const membershipId = await createMembership({
      userId: student.userId,
      groupId,
      state: 'Active',
    });
    const idsByWeek: Record<string, string> = {};
    for (const weekStart of weekStarts) {
      idsByWeek[weekStart] = await insertWeeklyRow({
        membershipId,
        weekStart,
      });
    }
    return { student, membershipId, groupId, idsByWeek };
  }

  function list(actor: TestActor, query: Record<string, string> = {}) {
    return request(app.getHttpServer())
      .get('/api/v1/weekly-reports')
      .query(query)
      .set('Authorization', `Bearer ${actor.accessToken}`);
  }

  describe('shape (APIS §9.1 collection envelope, TS §13 WeeklyReportDto)', () => {
    it('returns { data: WeeklyReportDto[], pagination: { next_cursor, has_more } } with no totals, no membership_id, no can_confirm', async () => {
      const { student, membershipId } = await studentWithWeeks([]);
      const byStudent = await insertWeeklyRow({
        membershipId,
        weekStart: '2026-08-15',
        attended: true,
        finalisedBy: student.userId,
      });
      const byScheduler = await insertWeeklyRow({
        membershipId,
        weekStart: '2026-08-08',
      });

      const response = await list(student).expect(HttpStatus.OK);

      expect(response.body).toEqual({
        data: [
          {
            id: byStudent,
            week_start: '2026-08-15',
            week_end: '2026-08-21',
            expected_days: 6,
            missed_daily_reports: 1,
            missed_daily_memorization: 2,
            missed_daily_revision: 3,
            missed_50_repetitions: 4,
            missed_single_session: 5,
            attended_recitation_call: true,
            state: 'Finalised',
            finalised_at: '2026-08-21T09:00:00.000Z',
            finalised_by: 'Student',
          },
          {
            id: byScheduler,
            week_start: '2026-08-08',
            week_end: '2026-08-14',
            expected_days: 6,
            missed_daily_reports: 1,
            missed_daily_memorization: 2,
            missed_daily_revision: 3,
            missed_50_repetitions: 4,
            missed_single_session: 5,
            attended_recitation_call: false,
            state: 'Finalised',
            finalised_at: '2026-08-14T09:00:00.000Z',
            finalised_by: 'Scheduler',
          },
        ],
        pagination: { next_cursor: null, has_more: false },
      });
      expect(response.body).not.toHaveProperty('total');
      expect(JSON.stringify(response.body)).not.toContain('membership_id');
      expect(JSON.stringify(response.body)).not.toContain('can_confirm');
      // finalised_by is the SAS E-06 enum, never the confirming user's id.
      expect(JSON.stringify(response.body)).not.toContain(student.userId);
    });

    it('returns an empty page for a Student with no finalised weeks and for one with no Active membership', async () => {
      const { student } = await studentWithWeeks([]);
      const empty = await list(student).expect(HttpStatus.OK);
      expect(empty.body).toEqual({
        data: [],
        pagination: { next_cursor: null, has_more: false },
      });

      const unenrolled = await registerAndLogin(UserRole.Student);
      const none = await list(unenrolled).expect(HttpStatus.OK);
      expect(none.body).toEqual({
        data: [],
        pagination: { next_cursor: null, has_more: false },
      });
    });
  });

  describe('ordering and cursor pagination (APIS §9.2, §9.4 week_start DESC)', () => {
    const weeks = [
      '2026-07-18',
      '2026-07-04',
      '2026-08-01',
      '2026-07-11',
      '2026-07-25',
    ];
    const expectedOrder = [
      '2026-08-01',
      '2026-07-25',
      '2026-07-18',
      '2026-07-11',
      '2026-07-04',
    ];

    it('sorts week_start DESC regardless of insertion order', async () => {
      const { student } = await studentWithWeeks(weeks);

      const response = await list(student).expect(HttpStatus.OK);

      expect(weekStartsOf(response.body)).toEqual(expectedOrder);
    });

    it('walks every page through next_cursor with no duplicates or gaps, ending with has_more=false and next_cursor=null', async () => {
      const { student, idsByWeek } = await studentWithWeeks(weeks);

      const page1 = await list(student, { limit: '2' }).expect(HttpStatus.OK);
      expect(weekStartsOf(page1.body)).toEqual(['2026-08-01', '2026-07-25']);
      expect(page1.body.pagination.has_more).toBe(true);
      expect(decodeCursor(page1.body.pagination.next_cursor as string)).toEqual(
        {
          id: idsByWeek['2026-07-25'],
          sortKey: { weekStart: '2026-07-25' },
        },
      );

      const page2 = await list(student, {
        limit: '2',
        cursor: page1.body.pagination.next_cursor,
      }).expect(HttpStatus.OK);
      expect(weekStartsOf(page2.body)).toEqual(['2026-07-18', '2026-07-11']);
      expect(page2.body.pagination.has_more).toBe(true);

      const page3 = await list(student, {
        limit: '2',
        cursor: page2.body.pagination.next_cursor,
      }).expect(HttpStatus.OK);
      expect(weekStartsOf(page3.body)).toEqual(['2026-07-04']);
      expect(page3.body.pagination).toEqual({
        next_cursor: null,
        has_more: false,
      });

      const seen = [
        ...idsOf(page1.body),
        ...idsOf(page2.body),
        ...idsOf(page3.body),
      ];
      expect(new Set(seen).size).toBe(5);
    });

    it('has_more is false and next_cursor null when the page is exactly full', async () => {
      const { student } = await studentWithWeeks(['2026-07-04', '2026-07-11']);

      const response = await list(student, { limit: '2' }).expect(
        HttpStatus.OK,
      );

      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination).toEqual({
        next_cursor: null,
        has_more: false,
      });
    });

    it('clamps limit into [1, 100] and falls back to the first page on a malformed or daily-shaped cursor', async () => {
      const { student, idsByWeek } = await studentWithWeeks(weeks);

      const clamped = await list(student, { limit: '0' }).expect(HttpStatus.OK);
      expect(clamped.body.data).toHaveLength(1);
      expect(clamped.body.pagination.has_more).toBe(true);

      const garbage = await list(student, { cursor: 'not-a-cursor' }).expect(
        HttpStatus.OK,
      );
      expect(weekStartsOf(garbage.body)).toEqual(expectedOrder);

      const dailyShaped = await list(student, {
        cursor: encodeCursor({
          id: idsByWeek['2026-07-25'],
          sortKey: { reportDate: '2026-07-25' },
        }),
      }).expect(HttpStatus.OK);
      expect(weekStartsOf(dailyShaped.body)).toEqual(expectedOrder);
    });
  });

  describe('from / to filter on week_start (APIS §9.3)', () => {
    it('bounds week_start inclusively on both ends and keeps the filter across pages', async () => {
      const { student } = await studentWithWeeks([
        '2026-07-04',
        '2026-07-11',
        '2026-07-18',
        '2026-07-25',
        '2026-08-01',
      ]);

      const both = await list(student, {
        from: '2026-07-11',
        to: '2026-07-25',
      }).expect(HttpStatus.OK);
      expect(weekStartsOf(both.body)).toEqual([
        '2026-07-25',
        '2026-07-18',
        '2026-07-11',
      ]);

      const page1 = await list(student, {
        from: '2026-07-11',
        to: '2026-07-25',
        limit: '2',
      }).expect(HttpStatus.OK);
      const page2 = await list(student, {
        from: '2026-07-11',
        to: '2026-07-25',
        limit: '2',
        cursor: page1.body.pagination.next_cursor,
      }).expect(HttpStatus.OK);
      expect(weekStartsOf(page2.body)).toEqual(['2026-07-11']);
      expect(page2.body.pagination.has_more).toBe(false);
    });

    it('rejects a malformed date with 422 VALIDATION_ERROR (Arabic, no internals)', async () => {
      const { student } = await studentWithWeeks([]);

      const response = await list(student, { from: '2026/07/01' }).expect(
        HttpStatus.UNPROCESSABLE_ENTITY,
      );

      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.message).toMatch(/[؀-ۿ]/);
      expect(response.body.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'from' })]),
      );
      expect(JSON.stringify(response.body)).not.toMatch(
        /relation "|syntax error|invalid input/i,
      );
    });
  });

  describe('scope — own Active membership, finalised rows only (TS §15.2, BR-40, UF §16/§34)', () => {
    it('never returns another student rows, even in the same group', async () => {
      const { student, groupId, idsByWeek } = await studentWithWeeks([
        '2026-08-01',
      ]);
      const other = await registerAndLogin(UserRole.Student);
      const otherMembershipId = await createMembership({
        userId: other.userId,
        groupId,
        state: 'Active',
      });
      await insertWeeklyRow({
        membershipId: otherMembershipId,
        weekStart: '2026-08-08',
      });

      const response = await list(student).expect(HttpStatus.OK);

      expect(idsOf(response.body)).toEqual([idsByWeek['2026-08-01']]);
    });

    it('excludes rows of the caller own Terminated membership (a rejoin starts with zero history)', async () => {
      const student = await registerAndLogin(UserRole.Student);
      const oldGroupId = await createGroup();
      const terminatedMembershipId = await createMembership({
        userId: student.userId,
        groupId: oldGroupId,
        state: 'Terminated',
      });
      await insertWeeklyRow({
        membershipId: terminatedMembershipId,
        weekStart: '2026-06-06',
      });
      const newGroupId = await createGroup();
      const activeMembershipId = await createMembership({
        userId: student.userId,
        groupId: newGroupId,
        state: 'Active',
      });
      const currentId = await insertWeeklyRow({
        membershipId: activeMembershipId,
        weekStart: '2026-08-01',
      });

      const response = await list(student).expect(HttpStatus.OK);

      expect(idsOf(response.body)).toEqual([currentId]);
    });

    it('excludes soft-deleted rows and the Open (not yet finalised) recitation-day row', async () => {
      const { student, membershipId, idsByWeek } = await studentWithWeeks([
        '2026-08-01',
      ]);
      await insertWeeklyRow({
        membershipId,
        weekStart: '2026-07-25',
        deleted: true,
      });
      await insertWeeklyRow({
        membershipId,
        weekStart: '2026-08-08',
        state: 'Open',
      });

      const response = await list(student).expect(HttpStatus.OK);

      expect(idsOf(response.body)).toEqual([idsByWeek['2026-08-01']]);
    });
  });

  describe('authorization (APIS §6.1, TS §36)', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/weekly-reports')
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

        const response = await list(actor).expect(HttpStatus.FORBIDDEN);

        expect(response.body).toMatchObject({
          statusCode: HttpStatus.FORBIDDEN,
          error: 'SCOPE_DENIED',
        });
        expect(response.body).not.toHaveProperty('data');
        expect(response.body.correlationId).toBeDefined();
      },
    );

    it('does not let the current-week route shadow the history route (GET /weekly-reports/current still answers API-033)', async () => {
      const { student } = await studentWithWeeks(['2026-08-01']);

      const current = await request(app.getHttpServer())
        .get('/api/v1/weekly-reports/current')
        .set('Authorization', `Bearer ${student.accessToken}`)
        .expect(HttpStatus.OK);

      expect(current.body.data).toHaveProperty('can_confirm');
      expect(current.body).not.toHaveProperty('pagination');
    });
  });
});
