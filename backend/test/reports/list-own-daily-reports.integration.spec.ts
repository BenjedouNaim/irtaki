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
  data: Array<{ id: string; report_date: string }>;
  pagination: { next_cursor: string | null; has_more: boolean };
}

function datesOf(body: unknown): string[] {
  return (body as ListBody).data.map((r) => r.report_date);
}

function idsOf(body: unknown): string[] {
  return (body as ListBody).data.map((r) => r.id);
}

const STUDENT_TIMEZONE = 'Africa/Tunis';

describe('GET /daily-reports (F-DR-05 / API-031 Integration)', () => {
  jest.setTimeout(60000);

  let app: INestApplication<App>;
  let dataSource: DataSource;

  const testEmailDomain = '@test-list-own-daily-reports.com';
  const testGroupPrefix = 'F-DR-05 test group';
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
       ) VALUES ($1, $2, $3, $4, '2026-06-01', $5, now(), now())`,
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
         $1, $2, $3::date, 'Normal', ($3::date || 'T08:30:00Z')::timestamptz, $4,
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

  /** A Student with an Active membership and `dates` (any order) reported as Absent. */
  async function studentWithReports(dates: string[]): Promise<{
    student: TestActor;
    membershipId: string;
    idsByDate: Record<string, string>;
  }> {
    const student = await registerAndLogin(UserRole.Student);
    const groupId = await createGroup();
    const membershipId = await createMembership({
      userId: student.userId,
      groupId,
      state: 'Active',
    });
    const idsByDate: Record<string, string> = {};
    for (const reportDate of dates) {
      idsByDate[reportDate] = await createAbsentReport({
        membershipId,
        reportDate,
      });
    }
    return { student, membershipId, idsByDate };
  }

  function list(actor: TestActor, query: Record<string, string> = {}) {
    return request(app.getHttpServer())
      .get('/api/v1/daily-reports')
      .query(query)
      .set('Authorization', `Bearer ${actor.accessToken}`);
  }

  describe('shape (APIS §9.1 collection envelope, §11 DTO)', () => {
    it('returns { data: DailyReportDto[], pagination: { next_cursor, has_more } } with no totals', async () => {
      const { student, membershipId } = await studentWithReports([]);
      const reportId = await createNormalReport({
        membershipId,
        reportDate: '2026-08-10',
      });

      const response = await list(student).expect(HttpStatus.OK);

      expect(response.body).toEqual({
        data: [
          {
            id: reportId,
            report_date: '2026-08-10',
            type: 'Normal',
            submitted_at: '2026-08-10T08:30:00.000Z',
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
        ],
        pagination: { next_cursor: null, has_more: false },
      });
      expect(response.body).not.toHaveProperty('total');
      expect(JSON.stringify(response.body)).not.toContain('ordinal');
      expect(JSON.stringify(response.body)).not.toContain('membership_id');
    });

    it('returns an empty page for a Student with no reports and for one with no Active membership', async () => {
      const { student } = await studentWithReports([]);
      expect((await list(student).expect(HttpStatus.OK)).body).toEqual({
        data: [],
        pagination: { next_cursor: null, has_more: false },
      });

      const unenrolled = await registerAndLogin(UserRole.Student);
      expect((await list(unenrolled).expect(HttpStatus.OK)).body).toEqual({
        data: [],
        pagination: { next_cursor: null, has_more: false },
      });
    });
  });

  describe('ordering and cursor pagination (APIS §9.2, §9.4)', () => {
    const dates = [
      '2026-08-03',
      '2026-08-01',
      '2026-08-05',
      '2026-08-02',
      '2026-08-04',
    ];
    const expectedOrder = [
      '2026-08-05',
      '2026-08-04',
      '2026-08-03',
      '2026-08-02',
      '2026-08-01',
    ];

    it('sorts report_date DESC regardless of insertion order', async () => {
      const { student } = await studentWithReports(dates);

      const response = await list(student).expect(HttpStatus.OK);

      expect(datesOf(response.body)).toEqual(expectedOrder);
    });

    it('walks every page through next_cursor with no duplicates or gaps, ending with has_more=false and next_cursor=null', async () => {
      const { student, idsByDate } = await studentWithReports(dates);

      const page1 = await list(student, { limit: '2' }).expect(HttpStatus.OK);
      expect(page1.body.data).toHaveLength(2);
      expect(page1.body.pagination.has_more).toBe(true);
      expect(page1.body.pagination.next_cursor).toEqual(expect.any(String));
      // APIS §9.2: base64 of {id, sort_key} of the last item on the page.
      expect(decodeCursor(page1.body.pagination.next_cursor as string)).toEqual(
        {
          id: idsByDate['2026-08-04'],
          sortKey: { reportDate: '2026-08-04' },
        },
      );

      const page2 = await list(student, {
        limit: '2',
        cursor: page1.body.pagination.next_cursor,
      }).expect(HttpStatus.OK);
      expect(page2.body.data).toHaveLength(2);
      expect(page2.body.pagination.has_more).toBe(true);

      const page3 = await list(student, {
        limit: '2',
        cursor: page2.body.pagination.next_cursor,
      }).expect(HttpStatus.OK);
      expect(page3.body.data).toHaveLength(1);
      expect(page3.body.pagination).toEqual({
        next_cursor: null,
        has_more: false,
      });

      const seen = {
        data: [
          ...(page1.body as ListBody).data,
          ...(page2.body as ListBody).data,
          ...(page3.body as ListBody).data,
        ],
      };
      expect(datesOf(seen)).toEqual(expectedOrder);
      expect(new Set(idsOf(seen)).size).toBe(5);
    });

    it('has_more is false and next_cursor null when the page is exactly full', async () => {
      const { student } = await studentWithReports([
        '2026-08-01',
        '2026-08-02',
      ]);

      const response = await list(student, { limit: '2' }).expect(
        HttpStatus.OK,
      );

      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination).toEqual({
        next_cursor: null,
        has_more: false,
      });
    });

    it('clamps limit into [1, 100] instead of rejecting it', async () => {
      const { student } = await studentWithReports([
        '2026-08-01',
        '2026-08-02',
      ]);

      const tooSmall = await list(student, { limit: '0' }).expect(
        HttpStatus.OK,
      );
      expect(tooSmall.body.data).toHaveLength(1);
      expect(tooSmall.body.pagination.has_more).toBe(true);

      const tooLarge = await list(student, { limit: '1000' }).expect(
        HttpStatus.OK,
      );
      expect(tooLarge.body.data).toHaveLength(2);

      const junk = await list(student, { limit: 'abc' }).expect(HttpStatus.OK);
      expect(junk.body.data).toHaveLength(2);
    });

    it.each([
      ['garbage', 'not-a-cursor'],
      [
        'non-uuid id',
        encodeCursor({ id: 'x', sortKey: { reportDate: '2026-08-02' } }),
      ],
      ['wrong sort key', encodeCursor({ id: uuidv7(), sortKey: { score: 1 } })],
    ])(
      'falls back to the first page on a malformed cursor (%s)',
      async (_label, cursor) => {
        const { student } = await studentWithReports([
          '2026-08-01',
          '2026-08-02',
        ]);

        const response = await list(student, { cursor }).expect(HttpStatus.OK);

        expect(datesOf(response.body)).toEqual(['2026-08-02', '2026-08-01']);
      },
    );
  });

  describe('from / to filter (APIS §9.3)', () => {
    it('bounds report_date inclusively on both ends', async () => {
      const { student } = await studentWithReports([
        '2026-08-01',
        '2026-08-02',
        '2026-08-03',
        '2026-08-04',
      ]);

      const both = await list(student, {
        from: '2026-08-02',
        to: '2026-08-03',
      }).expect(HttpStatus.OK);
      expect(datesOf(both.body)).toEqual(['2026-08-03', '2026-08-02']);

      const fromOnly = await list(student, { from: '2026-08-03' }).expect(
        HttpStatus.OK,
      );
      expect(datesOf(fromOnly.body)).toEqual(['2026-08-04', '2026-08-03']);

      const toOnly = await list(student, { to: '2026-08-02' }).expect(
        HttpStatus.OK,
      );
      expect(datesOf(toOnly.body)).toEqual(['2026-08-02', '2026-08-01']);
    });

    it('keeps the filter across pages', async () => {
      const { student } = await studentWithReports([
        '2026-08-01',
        '2026-08-02',
        '2026-08-03',
        '2026-08-04',
      ]);

      const page1 = await list(student, {
        from: '2026-08-02',
        to: '2026-08-04',
        limit: '2',
      }).expect(HttpStatus.OK);
      expect(datesOf(page1.body)).toEqual(['2026-08-04', '2026-08-03']);
      expect(page1.body.pagination.has_more).toBe(true);

      const page2 = await list(student, {
        from: '2026-08-02',
        to: '2026-08-04',
        limit: '2',
        cursor: page1.body.pagination.next_cursor,
      }).expect(HttpStatus.OK);
      expect(datesOf(page2.body)).toEqual(['2026-08-02']);
      expect(page2.body.pagination).toEqual({
        next_cursor: null,
        has_more: false,
      });
    });

    it.each(['2026/08/01', '01-08-2026', '2026-02-30', 'yesterday'])(
      'rejects a malformed date (%s) with 422 VALIDATION_ERROR and an Arabic message',
      async (bad) => {
        const { student } = await studentWithReports([]);

        const response = await list(student, { from: bad }).expect(
          HttpStatus.UNPROCESSABLE_ENTITY,
        );

        expect(response.body.error).toBe('VALIDATION_ERROR');
        expect(response.body.details).toEqual(
          expect.arrayContaining([expect.objectContaining({ field: 'from' })]),
        );
        expect(JSON.stringify(response.body)).not.toMatch(
          /relation "|syntax error|invalid input/i,
        );
      },
    );
  });

  describe('scope — own Active membership only (TS §15.2, BR-40)', () => {
    it('never returns another student reports, even in the same group', async () => {
      const groupId = await createGroup();
      const other = await registerAndLogin(UserRole.Student);
      const otherMembershipId = await createMembership({
        userId: other.userId,
        groupId,
        state: 'Active',
      });
      await createAbsentReport({
        membershipId: otherMembershipId,
        reportDate: '2026-08-01',
      });
      const student = await registerAndLogin(UserRole.Student);
      const membershipId = await createMembership({
        userId: student.userId,
        groupId,
        state: 'Active',
      });
      const ownId = await createAbsentReport({
        membershipId,
        reportDate: '2026-08-02',
      });

      const response = await list(student).expect(HttpStatus.OK);

      expect(idsOf(response.body)).toEqual([ownId]);
    });

    it('excludes reports of the caller own Terminated membership (a rejoin starts with zero history)', async () => {
      const student = await registerAndLogin(UserRole.Student);
      const oldGroupId = await createGroup();
      const terminatedMembershipId = await createMembership({
        userId: student.userId,
        groupId: oldGroupId,
        state: 'Terminated',
      });
      await createAbsentReport({
        membershipId: terminatedMembershipId,
        reportDate: '2026-07-01',
      });
      const newGroupId = await createGroup();
      const activeMembershipId = await createMembership({
        userId: student.userId,
        groupId: newGroupId,
        state: 'Active',
      });
      const currentId = await createAbsentReport({
        membershipId: activeMembershipId,
        reportDate: '2026-08-01',
      });

      const response = await list(student).expect(HttpStatus.OK);

      expect(idsOf(response.body)).toEqual([currentId]);
    });

    it('excludes soft-deleted reports', async () => {
      const { student, membershipId } = await studentWithReports([
        '2026-08-01',
      ]);
      await createNormalReport({
        membershipId,
        reportDate: '2026-08-02',
        deleted: true,
      });

      const response = await list(student).expect(HttpStatus.OK);

      expect(datesOf(response.body)).toEqual(['2026-08-01']);
    });
  });

  describe('authorization (APIS §6.1, TS §36)', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/daily-reports')
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

        expect(response.body.statusCode).toBe(HttpStatus.FORBIDDEN);
        expect(response.body.error).toBe('SCOPE_DENIED');
        expect(response.body).not.toHaveProperty('data');
        expect(response.body.correlationId).toBeDefined();
      },
    );
  });
});
