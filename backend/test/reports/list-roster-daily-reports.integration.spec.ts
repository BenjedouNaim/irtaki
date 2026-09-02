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
import { decodeCursor } from '../../src/shared/pagination/cursor.util';

interface TestActor {
  accessToken: string;
  userId: string;
}

interface ListBody {
  data: Array<{ id: string; report_date: string }>;
  pagination: { next_cursor: string | null; has_more: boolean };
}

interface Fixture {
  teacher: TestActor;
  assistant: TestActor;
  student: TestActor;
  groupId: string;
  membershipId: string;
}

function datesOf(body: unknown): string[] {
  return (body as ListBody).data.map((r) => r.report_date);
}

function idsOf(body: unknown): string[] {
  return (body as ListBody).data.map((r) => r.id);
}

const STUDENT_TIMEZONE = 'Africa/Tunis';

describe('GET /memberships/{id}/daily-reports (F-DR-06 / API-032 Integration)', () => {
  jest.setTimeout(60000);

  let app: INestApplication<App>;
  let dataSource: DataSource;

  const testEmailDomain = '@test-list-roster-daily-reports.com';
  const testGroupPrefix = 'F-DR-06 test group';
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

  /**
   * One group with its own Teacher/Assistant and one enrolled Student whose
   * membership is Active (default) or Terminated, plus `dates` (any order)
   * reported as Absent.
   */
  async function seedFixture(options?: {
    state?: 'Active' | 'Terminated';
    dates?: string[];
  }): Promise<Fixture & { idsByDate: Record<string, string> }> {
    const teacher = await registerAndLogin(UserRole.Teacher);
    const assistant = await registerAndLogin(UserRole.Assistant);
    const student = await registerAndLogin(UserRole.Student);

    const groupId = uuidv7();
    await dataSource.query(
      `INSERT INTO groups (
         id, name, gender, recitation_day, enrollment_status,
         lifecycle_state, teacher_id, assistant_id, created_by,
         created_at, updated_at
       ) VALUES ($1, $2, 'Male', 5, 'Closed', 'Active', $3, $4, $3, now(), now())`,
      [
        groupId,
        `${testGroupPrefix} ${uuidv7()}`,
        teacher.userId,
        assistant.userId,
      ],
    );

    const state = options?.state ?? 'Active';
    const membershipId = uuidv7();
    await dataSource.query(
      `INSERT INTO memberships (
         id, user_id, group_id, state, started_at, ended_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, '2026-06-01', $5, now(), now())`,
      [
        membershipId,
        student.userId,
        groupId,
        state,
        state === 'Terminated' ? '2026-07-15' : null,
      ],
    );

    const idsByDate: Record<string, string> = {};
    for (const reportDate of options?.dates ?? []) {
      idsByDate[reportDate] = await createAbsentReport({
        membershipId,
        reportDate,
      });
    }

    return { teacher, assistant, student, groupId, membershipId, idsByDate };
  }

  function list(
    actor: TestActor,
    membershipId: string,
    query: Record<string, string> = {},
  ) {
    return request(app.getHttpServer())
      .get(`/api/v1/memberships/${membershipId}/daily-reports`)
      .query(query)
      .set('Authorization', `Bearer ${actor.accessToken}`);
  }

  describe('in-scope access (APIS §6.1: Admin all, Teacher (g))', () => {
    it('returns the API-031 page shape to the Teacher of the membership group — no totals, no ordinals, no membership_id', async () => {
      const fx = await seedFixture();
      const reportId = await createNormalReport({
        membershipId: fx.membershipId,
        reportDate: '2026-08-10',
      });

      const response = await list(fx.teacher, fx.membershipId).expect(
        HttpStatus.OK,
      );

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

    it('returns the same page to the Admin for any group', async () => {
      const fx = await seedFixture({ dates: ['2026-08-01', '2026-08-02'] });
      const admin = await registerAndLogin(UserRole.Admin);

      const response = await list(admin, fx.membershipId).expect(HttpStatus.OK);

      expect(datesOf(response.body)).toEqual(['2026-08-02', '2026-08-01']);
    });

    it('returns an empty page (not an error) for a scoped membership with no reports', async () => {
      const fx = await seedFixture();

      const response = await list(fx.teacher, fx.membershipId).expect(
        HttpStatus.OK,
      );

      expect(response.body).toEqual({
        data: [],
        pagination: { next_cursor: null, has_more: false },
      });
    });

    it('lists only that membership — never a groupmate, never a soft-deleted row', async () => {
      const fx = await seedFixture({ dates: ['2026-08-01'] });
      await createNormalReport({
        membershipId: fx.membershipId,
        reportDate: '2026-08-02',
        deleted: true,
      });
      const mate = await registerAndLogin(UserRole.Student);
      const mateMembershipId = uuidv7();
      await dataSource.query(
        `INSERT INTO memberships (
           id, user_id, group_id, state, started_at, ended_at, created_at, updated_at
         ) VALUES ($1, $2, $3, 'Active', '2026-06-01', NULL, now(), now())`,
        [mateMembershipId, mate.userId, fx.groupId],
      );
      await createAbsentReport({
        membershipId: mateMembershipId,
        reportDate: '2026-08-03',
      });

      const response = await list(fx.teacher, fx.membershipId).expect(
        HttpStatus.OK,
      );

      expect(idsOf(response.body)).toEqual([fx.idsByDate['2026-08-01']]);
    });
  });

  describe('ordering, cursor pagination and from/to (APIS §9.2, §9.3, §9.4)', () => {
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

    it('sorts report_date DESC and walks every page through next_cursor with no duplicates or gaps', async () => {
      const fx = await seedFixture({ dates });

      const page1 = await list(fx.teacher, fx.membershipId, {
        limit: '2',
      }).expect(HttpStatus.OK);
      expect(datesOf(page1.body)).toEqual(['2026-08-05', '2026-08-04']);
      expect(page1.body.pagination.has_more).toBe(true);
      expect(decodeCursor(page1.body.pagination.next_cursor as string)).toEqual(
        {
          id: fx.idsByDate['2026-08-04'],
          sortKey: { reportDate: '2026-08-04' },
        },
      );

      const page2 = await list(fx.teacher, fx.membershipId, {
        limit: '2',
        cursor: page1.body.pagination.next_cursor,
      }).expect(HttpStatus.OK);
      const page3 = await list(fx.teacher, fx.membershipId, {
        limit: '2',
        cursor: page2.body.pagination.next_cursor,
      }).expect(HttpStatus.OK);
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

    it('bounds report_date inclusively on both ends and clamps limit instead of rejecting it', async () => {
      const fx = await seedFixture({ dates });

      const both = await list(fx.teacher, fx.membershipId, {
        from: '2026-08-02',
        to: '2026-08-04',
      }).expect(HttpStatus.OK);
      expect(datesOf(both.body)).toEqual([
        '2026-08-04',
        '2026-08-03',
        '2026-08-02',
      ]);

      const clamped = await list(fx.teacher, fx.membershipId, {
        limit: '0',
      }).expect(HttpStatus.OK);
      expect(clamped.body.data).toHaveLength(1);
      expect(clamped.body.pagination.has_more).toBe(true);
    });

    it('rejects a malformed date with 422 VALIDATION_ERROR (Arabic, no internals), after the scope check', async () => {
      const fx = await seedFixture();

      const response = await list(fx.teacher, fx.membershipId, {
        from: '2026/08/01',
      }).expect(HttpStatus.UNPROCESSABLE_ENTITY);

      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'from' })]),
      );
      expect(JSON.stringify(response.body)).not.toMatch(
        /relation "|syntax error|invalid input/i,
      );
    });

    it('runs the scope check before query validation: out of scope + malformed date is a 403, not a 422', async () => {
      const target = await seedFixture();
      const other = await seedFixture();

      const denied = await list(other.teacher, target.membershipId, {
        from: '2026/08/01',
      }).expect(HttpStatus.FORBIDDEN);

      expect(denied.body.error).toBe('SCOPE_DENIED');
    });
  });

  describe('scope denial before the handler (TS §15.2, SA §14 uniform 403)', () => {
    it('returns 403 SCOPE_DENIED to the Teacher of a DIFFERENT group', async () => {
      const target = await seedFixture({ dates: ['2026-08-01'] });
      const other = await seedFixture();

      const response = await list(other.teacher, target.membershipId).expect(
        HttpStatus.FORBIDDEN,
      );

      expect(response.body).toMatchObject({
        statusCode: HttpStatus.FORBIDDEN,
        error: 'SCOPE_DENIED',
      });
      expect(response.body.message).toMatch(/[\u0600-\u06FF]/);
      expect(response.body).not.toHaveProperty('data');
      expect(response.body.correlationId).toBeDefined();
    });

    it('returns the identical 403 to a Teacher for a non-existent membership (no enumeration)', async () => {
      const fx = await seedFixture();

      const response = await list(fx.teacher, uuidv7()).expect(
        HttpStatus.FORBIDDEN,
      );

      expect(response.body.error).toBe('SCOPE_DENIED');
    });

    it('returns the identical 403 to the Teacher of a TERMINATED membership of their own group', async () => {
      const fx = await seedFixture({
        state: 'Terminated',
        dates: ['2026-07-01'],
      });

      const response = await list(fx.teacher, fx.membershipId).expect(
        HttpStatus.FORBIDDEN,
      );

      expect(response.body.error).toBe('SCOPE_DENIED');
    });

    it('returns 404 NOT_FOUND on a malformed id (APIS §9.6), for Teacher and Admin alike', async () => {
      const fx = await seedFixture();
      const admin = await registerAndLogin(UserRole.Admin);

      for (const actor of [fx.teacher, admin]) {
        const response = await list(actor, 'not-a-uuid').expect(
          HttpStatus.NOT_FOUND,
        );
        expect(response.body.error).toBe('NOT_FOUND');
      }
    });
  });

  describe('role denial (RolesGuard alone, DEC-B09)', () => {
    it('returns 403 SCOPE_DENIED to the Assistant of the VERY SAME group — unconditionally, scope membership is irrelevant', async () => {
      const fx = await seedFixture({ dates: ['2026-08-01'] });

      const response = await list(fx.assistant, fx.membershipId).expect(
        HttpStatus.FORBIDDEN,
      );

      expect(response.body.error).toBe('SCOPE_DENIED');
      expect(response.body).not.toHaveProperty('data');
    });

    it('returns 403 to the Student for their OWN membership (API-032 is staff-only; own history is API-031)', async () => {
      const fx = await seedFixture({ dates: ['2026-08-01'] });

      const response = await list(fx.student, fx.membershipId).expect(
        HttpStatus.FORBIDDEN,
      );

      expect(response.body.error).toBe('SCOPE_DENIED');
    });

    it('returns 403 to a plain User', async () => {
      const fx = await seedFixture();
      const user = await registerAndLogin(UserRole.User);

      const response = await list(user, fx.membershipId).expect(
        HttpStatus.FORBIDDEN,
      );

      expect(response.body.error).toBe('SCOPE_DENIED');
    });

    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/memberships/${uuidv7()}/daily-reports`)
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });
});
