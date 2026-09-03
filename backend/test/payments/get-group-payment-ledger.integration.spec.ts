/* eslint-disable @typescript-eslint/no-unsafe-member-access */
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
  purgeNotificationLog,
  stopScheduledJobs,
} from '../shared/scheduled-jobs';

interface TestActor {
  accessToken: string;
  userId: string;
}

interface LedgerCycleBody {
  index: number;
  start_date: string;
  end_date: string;
  status: string;
  paid_at?: string;
}

interface GroupStudentLedgerBody {
  membership_id: string;
  full_name: string | null;
  cycles: LedgerCycleBody[];
  next_due_date: string | null;
  arrears_count: number;
}

/** The `{ data }` envelope, typed — supertest hands the body back as `any`. */
function ledgersOf(body: unknown): GroupStudentLedgerBody[] {
  return (body as { data: GroupStudentLedgerBody[] }).data;
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

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Test-side calendar arithmetic, written independently of the domain helper
 * so the expectations are not the implementation restated. Clamps to the
 * last day of the target month (ISS-14).
 */
function plusMonths(iso: string, months: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const absolute = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(absolute / 12);
  const targetMonth = absolute - targetYear * 12 + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return `${targetYear}-${pad(targetMonth)}-${pad(Math.min(day, lastDay))}`;
}

function plusDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(
    shifted.getUTCDate(),
  )}`;
}

describe('GET /groups/{id}/payments (F-PAY-02 / API-046 Integration)', () => {
  jest.setTimeout(120000);

  let app: INestApplication<App>;
  let dataSource: DataSource;

  const testEmailDomain = '@test-group-payment-ledger.com';
  const testGroupPrefix = 'F-PAY-02 test group';
  const mockMailer: IMailer = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  };

  const today = todayIn(STUDENT_TIMEZONE);

  /**
   * A month back: cycle 0 is the only cycle, runs ~2 more months, and is
   * therefore far outside the 10-day `Due Soon` window (BR-33).
   */
  const unpaidCurrentStart = plusDays(today, -30);
  /**
   * 85 days back: three calendar months are 89–92 days, so cycle 0 ends
   * 3–6 days from today — inside the `Due Soon` window on every run date.
   */
  const dueSoonStart = plusDays(today, -85);
  /**
   * 200 days back: cycles 0 and 1 are fully past (arrears), cycle 2 is
   * current and ends ~10 weeks out, so it reads `Unpaid`, never `Due Soon`.
   */
  const arrearsStart = plusDays(today, -200);

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
    await purgeNotificationLog(dataSource);
    await dataSource.query(
      `DELETE FROM payment_records
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

  async function registerAndLogin(
    role: UserRole,
    fullName?: string,
  ): Promise<TestActor> {
    const password = 'Password123!';

    // DB-UQ-08: a single Admin exists system-wide.
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
      [role, fullName ?? `${role} test user`, 'Male', userId],
    );

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(HttpStatus.OK);

    return { accessToken: login.body.access_token as string, userId };
  }

  async function createGroup(options: {
    assistantId: string;
    teacherId: string;
    archivedAt?: string | null;
  }): Promise<string> {
    const id = uuidv7();
    await dataSource.query(
      `INSERT INTO groups (
         id, name, gender, recitation_day, enrollment_status,
         lifecycle_state, archived_at, teacher_id, assistant_id, created_by,
         created_at, updated_at
       ) VALUES ($1, $2, 'Male', 4, 'Closed', $3, $4, $5, $6, $5, now(), now())`,
      [
        id,
        `${testGroupPrefix} ${uuidv7()}`,
        options.archivedAt ? 'Archived' : 'Active',
        options.archivedAt ?? null,
        options.teacherId,
        options.assistantId,
      ],
    );
    return id;
  }

  async function enrollStudent(options: {
    groupId: string;
    startedAt: string;
    fullName?: string;
    state?: 'Active' | 'Terminated';
    endedAt?: string | null;
  }): Promise<{ membershipId: string; userId: string }> {
    const student = await registerAndLogin(UserRole.Student, options.fullName);
    const membershipId = uuidv7();
    await dataSource.query(
      `INSERT INTO memberships (
         id, user_id, group_id, state, started_at, ended_at,
         created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, now(), now())`,
      [
        membershipId,
        student.userId,
        options.groupId,
        options.state ?? 'Active',
        options.startedAt,
        options.endedAt ?? null,
      ],
    );
    return { membershipId, userId: student.userId };
  }

  async function recordPayment(options: {
    membershipId: string;
    cycleIndex: number;
    paidAt: string;
    recordedBy: string;
  }): Promise<void> {
    await dataSource.query(
      `INSERT INTO payment_records (
         id, membership_id, cycle_index, amount, paid_at, recorded_by
       ) VALUES ($1, $2, $3, 30.00, $4, $5)`,
      [
        uuidv7(),
        options.membershipId,
        options.cycleIndex,
        options.paidAt,
        options.recordedBy,
      ],
    );
  }

  /** One Assistant, one Teacher and an empty group they both staff. */
  async function seedGroup(archivedAt: string | null = null): Promise<{
    assistant: TestActor;
    teacher: TestActor;
    groupId: string;
  }> {
    const assistant = await registerAndLogin(UserRole.Assistant);
    const teacher = await registerAndLogin(UserRole.Teacher);
    const groupId = await createGroup({
      assistantId: assistant.userId,
      teacherId: teacher.userId,
      archivedAt,
    });
    return { assistant, teacher, groupId };
  }

  function ledgerRequest(
    groupId: string,
    actor: TestActor,
    status?: string,
  ): request.Test {
    const req = request(app.getHttpServer())
      .get(`/api/v1/groups/${groupId}/payments`)
      .set('Authorization', `Bearer ${actor.accessToken}`);
    return status === undefined ? req : req.query({ status });
  }

  describe('the ledger itself (FR-PAY-06, UC-09, APIS §10.11)', () => {
    it('returns one fully derived per-student ledger for every Active member, in full_name order', async () => {
      const { assistant, groupId } = await seedGroup();
      const first = await enrollStudent({
        groupId,
        startedAt: unpaidCurrentStart,
        fullName: 'AA Student',
      });
      const second = await enrollStudent({
        groupId,
        startedAt: unpaidCurrentStart,
        fullName: 'BB Student',
      });

      const response = await ledgerRequest(groupId, assistant).expect(
        HttpStatus.OK,
      );

      const ledgers = ledgersOf(response.body);
      expect(ledgers.map((entry) => entry.membership_id)).toEqual([
        first.membershipId,
        second.membershipId,
      ]);
      expect(ledgers[0]).toEqual({
        membership_id: first.membershipId,
        full_name: 'AA Student',
        cycles: [
          {
            index: 0,
            start_date: unpaidCurrentStart,
            end_date: plusDays(plusMonths(unpaidCurrentStart, 3), -1),
            status: 'Unpaid',
          },
        ],
        next_due_date: plusDays(plusMonths(unpaidCurrentStart, 3), -1),
        arrears_count: 0,
      });
      // APIS §9.2 does not list API-046: bounded collection, no pagination.
      expect(response.body).not.toHaveProperty('pagination');
      // ADR-006: nothing about a cycle was stored by reading the ledger.
      const stored: Array<{ count: string }> = await dataSource.query(
        'SELECT count(*) AS count FROM payment_records WHERE membership_id = $1',
        [first.membershipId],
      );
      expect(Number(stored[0].count)).toBe(0);
    });

    it('marks a recorded cycle Paid with its paid_at and accumulates arrears (FR-PAY-09/10, DEC-B06)', async () => {
      const { assistant, groupId } = await seedGroup();
      const student = await enrollStudent({
        groupId,
        startedAt: arrearsStart,
      });
      const paidAt = '2025-01-05T09:00:00.000Z';
      await recordPayment({
        membershipId: student.membershipId,
        cycleIndex: 0,
        paidAt,
        recordedBy: assistant.userId,
      });

      const response = await ledgerRequest(groupId, assistant).expect(
        HttpStatus.OK,
      );

      const ledger = ledgersOf(response.body)[0];
      expect(ledger.cycles).toHaveLength(3);
      expect(ledger.cycles[0].status).toBe('Paid');
      expect(ledger.cycles[0].paid_at).toBe(new Date(paidAt).toISOString());
      expect(ledger.cycles[1]).not.toHaveProperty('paid_at');
      // Cycle 0 paid, cycle 1 past and unpaid, cycle 2 current.
      expect(ledger.arrears_count).toBe(1);
      expect(ledger.next_due_date).toBe(ledger.cycles[1].end_date);
    });

    it('excludes Terminated memberships from the group ledger, as the roster does', async () => {
      const { assistant, groupId } = await seedGroup();
      const active = await enrollStudent({
        groupId,
        startedAt: unpaidCurrentStart,
      });
      await enrollStudent({
        groupId,
        startedAt: unpaidCurrentStart,
        state: 'Terminated',
        endedAt: plusDays(today, -1),
      });

      const response = await ledgerRequest(groupId, assistant).expect(
        HttpStatus.OK,
      );

      expect(ledgersOf(response.body).map((e) => e.membership_id)).toEqual([
        active.membershipId,
      ]);
    });

    it('stops cycle generation at group archival while the arrears stay visible (FR-PAY-12, EC-57)', async () => {
      const { assistant, groupId } = await seedGroup(
        '2026-03-01T12:00:00.000Z',
      );
      await enrollStudent({ groupId, startedAt: '2025-11-30' });

      const response = await ledgerRequest(groupId, assistant).expect(
        HttpStatus.OK,
      );

      const ledger = ledgersOf(response.body)[0];
      expect(ledger.cycles).toEqual([
        // ISS-14: 30 Nov + 3 months clamps to 28 Feb 2026 (a common year),
        // so cycle 0 ends the day before — never 1 or 2 March.
        {
          index: 0,
          start_date: '2025-11-30',
          end_date: '2026-02-27',
          status: 'Unpaid',
        },
        {
          index: 1,
          start_date: '2026-02-28',
          end_date: '2026-05-29',
          status: 'Unpaid',
        },
      ]);
      expect(ledger.arrears_count).toBe(2);
    });

    it('returns an empty collection for a group with no Active members (UF §18)', async () => {
      const { assistant, groupId } = await seedGroup();

      const response = await ledgerRequest(groupId, assistant).expect(
        HttpStatus.OK,
      );

      expect(response.body).toEqual({ data: [] });
    });

    it('never leaks a student of another group', async () => {
      const mine = await seedGroup();
      const theirs = await seedGroup();
      const ours = await enrollStudent({
        groupId: mine.groupId,
        startedAt: unpaidCurrentStart,
      });
      await enrollStudent({
        groupId: theirs.groupId,
        startedAt: unpaidCurrentStart,
      });

      const response = await ledgerRequest(mine.groupId, mine.assistant).expect(
        HttpStatus.OK,
      );

      expect(ledgersOf(response.body).map((e) => e.membership_id)).toEqual([
        ours.membershipId,
      ]);
    });
  });

  describe('the ?status= filter (FR-PAY-06, APIS §9.3)', () => {
    let assistant: TestActor;
    let groupId: string;
    let paid: string;
    let dueSoon: string;
    let unpaid: string;

    beforeAll(async () => {
      const seeded = await seedGroup();
      assistant = seeded.assistant;
      groupId = seeded.groupId;

      const paidStudent = await enrollStudent({
        groupId,
        startedAt: unpaidCurrentStart,
        fullName: 'AA Paid',
      });
      await recordPayment({
        membershipId: paidStudent.membershipId,
        cycleIndex: 0,
        paidAt: '2025-06-01T09:00:00.000Z',
        recordedBy: assistant.userId,
      });
      paid = paidStudent.membershipId;

      dueSoon = (
        await enrollStudent({
          groupId,
          startedAt: dueSoonStart,
          fullName: 'BB DueSoon',
        })
      ).membershipId;
      unpaid = (
        await enrollStudent({
          groupId,
          startedAt: arrearsStart,
          fullName: 'CC Unpaid',
        })
      ).membershipId;
    });

    it('returns every student when no status is given (the "All" chip)', async () => {
      const response = await ledgerRequest(groupId, assistant).expect(
        HttpStatus.OK,
      );

      expect(ledgersOf(response.body).map((e) => e.membership_id)).toEqual([
        paid,
        dueSoon,
        unpaid,
      ]);
    });

    it.each([
      ['Paid', () => paid],
      ['Due Soon', () => dueSoon],
      ['Unpaid', () => unpaid],
    ])(
      'filters to the students whose current cycle is %s',
      async (status, expected) => {
        const response = await ledgerRequest(groupId, assistant, status).expect(
          HttpStatus.OK,
        );

        const ledgers = ledgersOf(response.body);
        expect(ledgers.map((e) => e.membership_id)).toEqual([expected()]);
        expect(ledgers[0].cycles[ledgers[0].cycles.length - 1].status).toBe(
          status,
        );
      },
    );

    it('returns a matched student ledger whole — the filter selects students, not cycles', async () => {
      const response = await ledgerRequest(groupId, assistant, 'Unpaid').expect(
        HttpStatus.OK,
      );

      const ledger = ledgersOf(response.body)[0];
      expect(ledger.cycles.map((cycle) => cycle.index)).toEqual([0, 1, 2]);
      expect(ledger.arrears_count).toBe(2);
    });

    it('returns the filtered-empty collection when nobody carries the status', async () => {
      const empty = await seedGroup();
      await enrollStudent({
        groupId: empty.groupId,
        startedAt: unpaidCurrentStart,
      });

      const response = await ledgerRequest(
        empty.groupId,
        empty.assistant,
        'Paid',
      ).expect(HttpStatus.OK);

      expect(response.body).toEqual({ data: [] });
    });

    it('rejects a status outside the SRS enum with 422 VALIDATION_ERROR (BR-55: no fourth value)', async () => {
      const response = await ledgerRequest(
        groupId,
        assistant,
        'Overdue',
      ).expect(HttpStatus.UNPROCESSABLE_ENTITY);

      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body).not.toHaveProperty('data');
    });
  });

  describe('authorization (SRS §10, SA §14, APIS §9.6)', () => {
    it('returns 401 without a token', async () => {
      const { groupId } = await seedGroup();

      await request(app.getHttpServer())
        .get(`/api/v1/groups/${groupId}/payments`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('returns 403 for the Teacher OF THIS VERY GROUP — SRS §10 excludes the Teacher from Payments unconditionally, the inverse of DEC-B09', async () => {
      const { teacher, groupId } = await seedGroup();
      await enrollStudent({ groupId, startedAt: unpaidCurrentStart });

      const response = await ledgerRequest(groupId, teacher).expect(
        HttpStatus.FORBIDDEN,
      );

      expect(response.body.statusCode).toBe(HttpStatus.FORBIDDEN);
      expect(response.body.error).toBe('SCOPE_DENIED');
      expect(response.body).not.toHaveProperty('data');
    });

    it.each([UserRole.Student, UserRole.User])(
      'returns 403 SCOPE_DENIED for the %s role',
      async (role) => {
        const { groupId } = await seedGroup();
        const actor = await registerAndLogin(role);

        const response = await ledgerRequest(groupId, actor).expect(
          HttpStatus.FORBIDDEN,
        );

        expect(response.body.error).toBe('SCOPE_DENIED');
      },
    );

    it('returns 403 SCOPE_DENIED for an Assistant of a different group', async () => {
      const mine = await seedGroup();
      const theirs = await seedGroup();
      await enrollStudent({
        groupId: theirs.groupId,
        startedAt: unpaidCurrentStart,
      });

      const response = await ledgerRequest(
        theirs.groupId,
        mine.assistant,
      ).expect(HttpStatus.FORBIDDEN);

      expect(response.body.error).toBe('SCOPE_DENIED');
    });

    it('returns the SAME 403 SCOPE_DENIED to an Assistant for a group that does not exist (NFR-20)', async () => {
      const { assistant } = await seedGroup();

      const response = await ledgerRequest(uuidv7(), assistant).expect(
        HttpStatus.FORBIDDEN,
      );

      expect(response.body.error).toBe('SCOPE_DENIED');
    });

    it('returns 404 NOT_FOUND on a malformed group id, before any lookup (APIS §9.6)', async () => {
      const { assistant } = await seedGroup();

      const response = await request(app.getHttpServer())
        .get('/api/v1/groups/not-a-uuid/payments')
        .set('Authorization', `Bearer ${assistant.accessToken}`)
        .expect(HttpStatus.NOT_FOUND);

      expect(response.body.error).toBe('NOT_FOUND');
    });

    it('lets the Admin read any group without being its staff (DEC-C07)', async () => {
      const { groupId } = await seedGroup();
      const student = await enrollStudent({
        groupId,
        startedAt: unpaidCurrentStart,
      });
      const admin = await registerAndLogin(UserRole.Admin);

      const response = await ledgerRequest(groupId, admin).expect(
        HttpStatus.OK,
      );

      expect(ledgersOf(response.body).map((e) => e.membership_id)).toEqual([
        student.membershipId,
      ]);
    });

    it('answers 404 NOT_FOUND to the Admin for a group that genuinely does not exist — the Admin has no scope to mask', async () => {
      const admin = await registerAndLogin(UserRole.Admin);

      const response = await ledgerRequest(uuidv7(), admin).expect(
        HttpStatus.NOT_FOUND,
      );

      expect(response.body.error).toBe('NOT_FOUND');
    });
  });
});
