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

interface LedgerBody {
  data: {
    cycles: LedgerCycleBody[];
    next_due_date: string | null;
    arrears_count: number;
  };
}

/** The `{ data }` envelope, typed — supertest hands the body back as `any`. */
function ledgerOf(body: unknown): LedgerBody['data'] {
  return (body as LedgerBody).data;
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
  return `${shifted.getUTCFullYear()}-${pad(
    shifted.getUTCMonth() + 1,
  )}-${pad(shifted.getUTCDate())}`;
}

describe('GET /me/payments (F-PAY-01 / API-045 Integration)', () => {
  jest.setTimeout(60000);

  let app: INestApplication<App>;
  let dataSource: DataSource;

  const testEmailDomain = '@test-own-payment-ledger.com';
  const testGroupPrefix = 'F-PAY-01 test group';
  const mockMailer: IMailer = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  };

  const today = todayIn(STUDENT_TIMEZONE);
  /**
   * A start date seven months back on the 10th — a day every month has, so
   * no clamping is involved — yielding exactly three cycles (0, 1 past;
   * 2 current) whatever day of the month the suite runs on.
   */
  const onTimeStart = `${plusMonths(today, -7).slice(0, 8)}10`;

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

  async function registerAndLogin(role: UserRole): Promise<TestActor> {
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
      [role, `${role} test user`, 'Male', userId],
    );

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(HttpStatus.OK);

    return { accessToken: login.body.access_token as string, userId };
  }

  async function createGroup(
    archivedAt: string | null = null,
  ): Promise<string> {
    const teacher = await registerAndLogin(UserRole.Teacher);
    const assistant = await registerAndLogin(UserRole.Assistant);
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
        archivedAt ? 'Archived' : 'Active',
        archivedAt,
        teacher.userId,
        assistant.userId,
      ],
    );
    return id;
  }

  async function createMembership(options: {
    userId: string;
    groupId: string;
    startedAt: string;
  }): Promise<string> {
    const id = uuidv7();
    await dataSource.query(
      `INSERT INTO memberships (
         id, user_id, group_id, state, started_at, created_at, updated_at
       ) VALUES ($1, $2, $3, 'Active', $4, now(), now())`,
      [id, options.userId, options.groupId, options.startedAt],
    );
    return id;
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

  async function seedStudent(options: {
    startedAt: string;
    archivedAt?: string | null;
  }): Promise<{ student: TestActor; membershipId: string }> {
    const student = await registerAndLogin(UserRole.Student);
    const groupId = await createGroup(options.archivedAt ?? null);
    const membershipId = await createMembership({
      userId: student.userId,
      groupId,
      startedAt: options.startedAt,
    });
    return { student, membershipId };
  }

  it('derives the full ledger of an on-time start with no clamping (FR-PAY-01/02/09)', async () => {
    const { student } = await seedStudent({ startedAt: onTimeStart });

    const response = await request(app.getHttpServer())
      .get('/api/v1/me/payments')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(HttpStatus.OK);

    expect(response.body).toEqual({
      data: {
        cycles: [
          {
            index: 0,
            start_date: onTimeStart,
            end_date: plusDays(plusMonths(onTimeStart, 3), -1),
            status: 'Unpaid',
          },
          {
            index: 1,
            start_date: plusMonths(onTimeStart, 3),
            end_date: plusDays(plusMonths(onTimeStart, 6), -1),
            status: 'Unpaid',
          },
          {
            index: 2,
            start_date: plusMonths(onTimeStart, 6),
            end_date: plusDays(plusMonths(onTimeStart, 9), -1),
            status: 'Unpaid',
          },
        ],
        // DEC-B06: the OLDEST unpaid cycle, not the current one.
        next_due_date: plusDays(plusMonths(onTimeStart, 3), -1),
        // FR-PAY-10: cycles 0 and 1 are past; cycle 2 contains today.
        arrears_count: 2,
      },
    });
    // ADR-006: no cycle is stored — only the payments actually made.
    const stored: Array<{ count: string }> = await dataSource.query(
      'SELECT count(*) AS count FROM payment_records',
    );
    expect(Number(stored[0].count)).toBe(0);
  });

  it('marks a recorded cycle Paid with its paid_at and drops it from arrears', async () => {
    const { student, membershipId } = await seedStudent({
      startedAt: onTimeStart,
    });
    const assistant = await registerAndLogin(UserRole.Assistant);
    const paidAt = `${plusMonths(onTimeStart, 1)}T09:30:00.000Z`;
    await recordPayment({
      membershipId,
      cycleIndex: 0,
      paidAt,
      recordedBy: assistant.userId,
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/me/payments')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(HttpStatus.OK);

    const ledger = ledgerOf(response.body);
    expect(ledger.cycles[0]).toEqual({
      index: 0,
      start_date: onTimeStart,
      end_date: plusDays(plusMonths(onTimeStart, 3), -1),
      status: 'Paid',
      paid_at: new Date(paidAt).toISOString(),
    });
    // `paid_at?` is absent, not null, on every cycle without a record.
    expect(ledger.cycles[1]).not.toHaveProperty('paid_at');
    expect(ledger.arrears_count).toBe(1);
    expect(ledger.next_due_date).toBe(plusDays(plusMonths(onTimeStart, 6), -1));
  });

  it('honours an out-of-order payment (BR-56) without moving next_due_date past the arrears', async () => {
    const { student, membershipId } = await seedStudent({
      startedAt: onTimeStart,
    });
    const assistant = await registerAndLogin(UserRole.Assistant);
    await recordPayment({
      membershipId,
      cycleIndex: 1,
      paidAt: `${plusMonths(onTimeStart, 4)}T09:30:00.000Z`,
      recordedBy: assistant.userId,
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/me/payments')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(HttpStatus.OK);

    const ledger = ledgerOf(response.body);
    expect(ledger.cycles.map((c) => c.status)).toEqual([
      'Unpaid',
      'Paid',
      'Unpaid',
    ]);
    expect(ledger.next_due_date).toBe(plusDays(plusMonths(onTimeStart, 3), -1));
    expect(ledger.arrears_count).toBe(1);
  });

  it('accumulates arrears across every past unpaid cycle (FR-PAY-09/10)', async () => {
    // Thirteen months back on the 1st — four past cycles plus the current one.
    const start = `${plusMonths(today, -13).slice(0, 8)}01`;
    const { student } = await seedStudent({ startedAt: start });

    const response = await request(app.getHttpServer())
      .get('/api/v1/me/payments')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(HttpStatus.OK);

    const ledger = ledgerOf(response.body);
    expect(ledger.cycles).toHaveLength(5);
    expect(ledger.arrears_count).toBe(4);
    expect(ledger.next_due_date).toBe(plusDays(plusMonths(start, 3), -1));
  });

  it('clamps a 30 November start to the end of February and stops at archival (ISS-14, FR-PAY-12)', async () => {
    // Fixed dates: the group was archived on 2026-03-01, which freezes cycle
    // generation there whatever today is — the ledger is fully deterministic.
    const { student } = await seedStudent({
      startedAt: '2025-11-30',
      archivedAt: '2026-03-01T12:00:00.000Z',
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/me/payments')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(HttpStatus.OK);

    expect(response.body).toEqual({
      data: {
        cycles: [
          {
            index: 0,
            start_date: '2025-11-30',
            // 30 Nov + 3 months clamps to 28 Feb 2026 (a common year), so the
            // cycle ends the day before — never 1 or 2 March.
            end_date: '2026-02-27',
            status: 'Unpaid',
          },
          {
            index: 1,
            start_date: '2026-02-28',
            end_date: '2026-05-29',
            status: 'Unpaid',
          },
        ],
        next_due_date: '2026-02-27',
        // EC-57: archival stops generation but existing arrears stay visible.
        arrears_count: 2,
      },
    });
  });

  it('returns 404 NOT_FOUND for a Student with no Active membership', async () => {
    const student = await registerAndLogin(UserRole.Student);

    const response = await request(app.getHttpServer())
      .get('/api/v1/me/payments')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(HttpStatus.NOT_FOUND);

    expect(response.body.error).toBe('NOT_FOUND');
    expect(response.body).not.toHaveProperty('data');
  });

  it('never leaks another student ledger', async () => {
    const { student: mine } = await seedStudent({ startedAt: onTimeStart });
    const { membershipId: theirs } = await seedStudent({
      startedAt: '2025-11-30',
    });
    const assistant = await registerAndLogin(UserRole.Assistant);
    await recordPayment({
      membershipId: theirs,
      cycleIndex: 0,
      paidAt: '2026-01-05T09:00:00.000Z',
      recordedBy: assistant.userId,
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/me/payments')
      .set('Authorization', `Bearer ${mine.accessToken}`)
      .expect(HttpStatus.OK);

    const ledger = ledgerOf(response.body);
    expect(ledger.cycles.every((c) => c.status !== 'Paid')).toBe(true);
    expect(ledger.cycles[0].start_date).toBe(onTimeStart);
  });

  it('returns 401 without a token', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/me/payments')
      .expect(HttpStatus.UNAUTHORIZED);
  });

  it.each([
    UserRole.User,
    // SRS §10: Teacher is excluded from Payments unconditionally.
    UserRole.Teacher,
    UserRole.Assistant,
    UserRole.Admin,
  ])('returns 403 SCOPE_DENIED for the %s role', async (role) => {
    const actor = await registerAndLogin(role);

    const response = await request(app.getHttpServer())
      .get('/api/v1/me/payments')
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .expect(HttpStatus.FORBIDDEN);

    expect(response.body.statusCode).toBe(HttpStatus.FORBIDDEN);
    expect(response.body.error).toBe('SCOPE_DENIED');
  });
});
