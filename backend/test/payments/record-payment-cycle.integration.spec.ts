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
import { stopScheduledJobs } from '../shared/scheduled-jobs';

interface TestActor {
  accessToken: string;
  userId: string;
}

interface PaymentRecordBody {
  id: string;
  cycle_index: number;
  amount: number;
  paid_at: string;
  recorded_by: string;
}

/** The `{ data }` envelope, typed — supertest hands the body back as `any`. */
function recordOf(body: unknown): PaymentRecordBody {
  return (body as { data: PaymentRecordBody }).data;
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

function plusDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(
    shifted.getUTCDate(),
  )}`;
}

describe('POST /memberships/{id}/payments (F-PAY-03 / API-047 Integration)', () => {
  jest.setTimeout(120000);

  let app: INestApplication<App>;
  let dataSource: DataSource;

  const testEmailDomain = '@test-record-payment-cycle.com';
  const testGroupPrefix = 'F-PAY-03 test group';
  const mockMailer: IMailer = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  };

  const today = todayIn(STUDENT_TIMEZONE);

  /** A month back: cycle 0 is the only cycle that has started. */
  const singleCycleStart = plusDays(today, -30);
  /**
   * 200 days back: three calendar months are 89–92 days, so cycles 0 and 1
   * are fully past and cycle 2 is the current one on every run date.
   */
  const threeCycleStart = plusDays(today, -200);

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
    state?: 'Active' | 'Terminated';
    endedAt?: string | null;
  }): Promise<{ membershipId: string; userId: string }> {
    const student = await registerAndLogin(UserRole.Student);
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

  /** An Assistant with one Active student who has three started cycles. */
  async function seedPayableStudent(startedAt = threeCycleStart): Promise<{
    assistant: TestActor;
    teacher: TestActor;
    groupId: string;
    membershipId: string;
  }> {
    const group = await seedGroup();
    const student = await enrollStudent({
      groupId: group.groupId,
      startedAt,
    });
    return { ...group, membershipId: student.membershipId };
  }

  function recordRequest(
    membershipId: string,
    actor: TestActor,
    body: Record<string, unknown> = { cycle_index: 0 },
  ): request.Test {
    return request(app.getHttpServer())
      .post(`/api/v1/memberships/${membershipId}/payments`)
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .send(body);
  }

  async function storedRows(
    membershipId: string,
  ): Promise<Array<Record<string, unknown>>> {
    return dataSource.query(
      `SELECT id, cycle_index, amount, paid_at, recorded_by, deleted_at
         FROM payment_records
        WHERE membership_id = $1
        ORDER BY cycle_index ASC`,
      [membershipId],
    );
  }

  describe('recording a cycle (UC-09 steps 6–7, APIS §10.11)', () => {
    it('returns 201 with { id, cycle_index, amount, paid_at, recorded_by } and persists the row', async () => {
      const { assistant, membershipId } = await seedPayableStudent();

      const response = await recordRequest(membershipId, assistant, {
        cycle_index: 1,
      }).expect(HttpStatus.CREATED);

      const record = recordOf(response.body);
      expect(Object.keys(record).sort()).toEqual([
        'amount',
        'cycle_index',
        'id',
        'paid_at',
        'recorded_by',
      ]);
      expect(record.cycle_index).toBe(1);
      expect(record.amount).toBe(30);
      expect(record.recorded_by).toBe(assistant.userId);
      expect(new Date(record.paid_at).toISOString()).toBe(record.paid_at);

      const rows = await storedRows(membershipId);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(record.id);
      expect(Number(rows[0].cycle_index)).toBe(1);
      // DB-CHK-17 stores the fixed fee as NUMERIC(10,2).
      expect(Number(rows[0].amount)).toBe(30);
      expect(rows[0].recorded_by).toBe(assistant.userId);
      expect(rows[0].deleted_at).toBeNull();
    });

    it('never lets the client choose the amount — BR-31 fixes it at 30 TND', async () => {
      const { assistant, membershipId } = await seedPayableStudent();

      // `forbidNonWhitelisted` rejects the extra field outright, so no
      // request can even express a different fee.
      const rejected = await recordRequest(membershipId, assistant, {
        cycle_index: 0,
        amount: 1,
      }).expect(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(rejected.body.error).toBe('VALIDATION_ERROR');
      expect(await storedRows(membershipId)).toHaveLength(0);

      const accepted = await recordRequest(membershipId, assistant, {
        cycle_index: 0,
      }).expect(HttpStatus.CREATED);
      expect(recordOf(accepted.body).amount).toBe(30);
    });

    it('lets cycles be paid out of order (BR-56 / FR-PAY-11 / EC-52)', async () => {
      const { assistant, membershipId } = await seedPayableStudent();

      await recordRequest(membershipId, assistant, { cycle_index: 2 }).expect(
        HttpStatus.CREATED,
      );
      await recordRequest(membershipId, assistant, { cycle_index: 0 }).expect(
        HttpStatus.CREATED,
      );

      const rows = await storedRows(membershipId);
      expect(rows.map((row) => Number(row.cycle_index))).toEqual([0, 2]);
    });

    it('flips the cycle to Paid in the group ledger the Assistant reads back (API-046)', async () => {
      const { assistant, groupId, membershipId } = await seedPayableStudent();

      const created = await recordRequest(membershipId, assistant, {
        cycle_index: 0,
      }).expect(HttpStatus.CREATED);

      const ledger = await request(app.getHttpServer())
        .get(`/api/v1/groups/${groupId}/payments`)
        .set('Authorization', `Bearer ${assistant.accessToken}`)
        .expect(HttpStatus.OK);

      const cycles = ledger.body.data[0].cycles as Array<{
        index: number;
        status: string;
        paid_at?: string;
      }>;
      expect(cycles[0].status).toBe('Paid');
      expect(cycles[0].paid_at).toBe(recordOf(created.body).paid_at);
      expect(ledger.body.data[0].arrears_count).toBe(1);
    });

    it('records a cycle for a student whose group was archived — FR-PAY-12 stops generation, EC-57 keeps the arrears payable', async () => {
      const archivedGroup = await seedGroup(
        new Date(`${plusDays(today, -10)}T12:00:00.000Z`).toISOString(),
      );
      const student = await enrollStudent({
        groupId: archivedGroup.groupId,
        startedAt: threeCycleStart,
      });

      await recordRequest(student.membershipId, archivedGroup.assistant, {
        cycle_index: 0,
      }).expect(HttpStatus.CREATED);
    });
  });

  describe('VR-26 — a cycle may be marked paid only once (409 CYCLE_ALREADY_PAID)', () => {
    it('answers 409 CYCLE_ALREADY_PAID on the second recording of the same cycle', async () => {
      const { assistant, membershipId } = await seedPayableStudent();
      await recordRequest(membershipId, assistant, { cycle_index: 1 }).expect(
        HttpStatus.CREATED,
      );

      const response = await recordRequest(membershipId, assistant, {
        cycle_index: 1,
      }).expect(HttpStatus.CONFLICT);

      expect(response.body.statusCode).toBe(HttpStatus.CONFLICT);
      expect(response.body.error).toBe('CYCLE_ALREADY_PAID');
      expect(response.body.message).toMatch(/[؀-ۿ]/);
      expect(response.body).not.toHaveProperty('data');
      // SA §24: no Postgres text, no constraint name, no stack trace.
      expect(JSON.stringify(response.body)).not.toMatch(
        /duplicate key|DB-UQ-06|23505/,
      );
      expect(response.body.correlationId).toEqual(expect.any(String));
    });

    it('leaves exactly one row behind — DB-UQ-06 is the guarantee, not a pre-check', async () => {
      const { assistant, membershipId } = await seedPayableStudent();

      const outcomes = await Promise.all([
        recordRequest(membershipId, assistant, { cycle_index: 0 }),
        recordRequest(membershipId, assistant, { cycle_index: 0 }),
      ]);

      expect(outcomes.map((res) => res.status).sort()).toEqual([
        HttpStatus.CREATED,
        HttpStatus.CONFLICT,
      ]);
      expect(await storedRows(membershipId)).toHaveLength(1);
    });

    it('answers 409 to a second Assistant recording the same cycle after a staff reassignment', async () => {
      const { assistant, groupId, membershipId } = await seedPayableStudent();
      await recordRequest(membershipId, assistant, { cycle_index: 0 }).expect(
        HttpStatus.CREATED,
      );

      const other = await registerAndLogin(UserRole.Assistant);
      await dataSource.query(
        'UPDATE groups SET assistant_id = $1 WHERE id = $2',
        [other.userId, groupId],
      );

      const response = await recordRequest(membershipId, other, {
        cycle_index: 0,
      }).expect(HttpStatus.CONFLICT);
      expect(response.body.error).toBe('CYCLE_ALREADY_PAID');
    });
  });

  describe('VR-37 — a future cycle cannot be prepaid (422 FUTURE_CYCLE)', () => {
    it('answers 422 FUTURE_CYCLE for the cycle after the current one', async () => {
      const { assistant, membershipId } =
        await seedPayableStudent(singleCycleStart);

      const response = await recordRequest(membershipId, assistant, {
        cycle_index: 1,
      }).expect(HttpStatus.UNPROCESSABLE_ENTITY);

      expect(response.body.error).toBe('FUTURE_CYCLE');
      expect(response.body.details).toEqual([
        expect.objectContaining({ field: 'cycle_index', rule: 'VR-37' }),
      ]);
      expect(await storedRows(membershipId)).toHaveLength(0);
    });

    it('accepts the current cycle itself — VR-37’s bound is inclusive', async () => {
      const { assistant, membershipId } =
        await seedPayableStudent(singleCycleStart);

      await recordRequest(membershipId, assistant, { cycle_index: 0 }).expect(
        HttpStatus.CREATED,
      );
    });

    it('answers 422 FUTURE_CYCLE for a far-future index rather than overflowing the column', async () => {
      const { assistant, membershipId } = await seedPayableStudent();

      const response = await recordRequest(membershipId, assistant, {
        cycle_index: 32767,
      }).expect(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(response.body.error).toBe('FUTURE_CYCLE');
    });

    it('answers 422 VALIDATION_ERROR for a negative cycle_index (DB-CHK-18, transport layer)', async () => {
      const { assistant, membershipId } = await seedPayableStudent();

      const response = await recordRequest(membershipId, assistant, {
        cycle_index: -1,
      }).expect(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['a missing cycle_index', {}],
      ['a non-integer cycle_index', { cycle_index: 1.5 }],
      ['a string cycle_index', { cycle_index: 'one' }],
    ])('answers 422 VALIDATION_ERROR for %s', async (_label, body) => {
      const { assistant, membershipId } = await seedPayableStudent();

      const response = await recordRequest(
        membershipId,
        assistant,
        body,
      ).expect(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('authorization (BR-34, VR-27, SRS §10, SA §14, APIS §9.6)', () => {
    it('returns 401 without a token', async () => {
      const { membershipId } = await seedPayableStudent();

      await request(app.getHttpServer())
        .post(`/api/v1/memberships/${membershipId}/payments`)
        .send({ cycle_index: 0 })
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('returns 403 SCOPE_DENIED for an Assistant of a different group (VR-27, E1)', async () => {
      const theirs = await seedPayableStudent();
      const mine = await seedGroup();

      const response = await recordRequest(
        theirs.membershipId,
        mine.assistant,
        { cycle_index: 0 },
      ).expect(HttpStatus.FORBIDDEN);

      expect(response.body.error).toBe('SCOPE_DENIED');
      expect(response.body).not.toHaveProperty('data');
      expect(await storedRows(theirs.membershipId)).toHaveLength(0);
    });

    it('returns 403 for the Teacher OF THIS VERY GROUP — SRS §10 excludes the Teacher from Payments unconditionally, the inverse of DEC-B09', async () => {
      const { teacher, membershipId } = await seedPayableStudent();

      const response = await recordRequest(membershipId, teacher, {
        cycle_index: 0,
      }).expect(HttpStatus.FORBIDDEN);

      expect(response.body.error).toBe('SCOPE_DENIED');
      expect(await storedRows(membershipId)).toHaveLength(0);
    });

    it('returns 403 for the Admin — BR-34 makes the Assistant the only actor on this write, so DEC-C07 grants no bypass here', async () => {
      const { membershipId } = await seedPayableStudent();
      const admin = await registerAndLogin(UserRole.Admin);

      const response = await recordRequest(membershipId, admin, {
        cycle_index: 0,
      }).expect(HttpStatus.FORBIDDEN);

      expect(response.body.error).toBe('SCOPE_DENIED');
      expect(await storedRows(membershipId)).toHaveLength(0);
    });

    it.each([UserRole.Student, UserRole.User])(
      'returns 403 SCOPE_DENIED for the %s role',
      async (role) => {
        const { membershipId } = await seedPayableStudent();
        const actor = await registerAndLogin(role);

        const response = await recordRequest(membershipId, actor, {
          cycle_index: 0,
        }).expect(HttpStatus.FORBIDDEN);

        expect(response.body.error).toBe('SCOPE_DENIED');
      },
    );

    it('returns the SAME 403 SCOPE_DENIED for a membership that does not exist (NFR-20)', async () => {
      const { assistant } = await seedPayableStudent();

      const response = await recordRequest(uuidv7(), assistant, {
        cycle_index: 0,
      }).expect(HttpStatus.FORBIDDEN);

      expect(response.body.error).toBe('SCOPE_DENIED');
    });

    it('returns the SAME 403 SCOPE_DENIED for a Terminated membership of the Assistant’s own group', async () => {
      const group = await seedGroup();
      const terminated = await enrollStudent({
        groupId: group.groupId,
        startedAt: threeCycleStart,
        state: 'Terminated',
        endedAt: plusDays(today, -1),
      });

      const response = await recordRequest(
        terminated.membershipId,
        group.assistant,
        { cycle_index: 0 },
      ).expect(HttpStatus.FORBIDDEN);

      expect(response.body.error).toBe('SCOPE_DENIED');
      expect(await storedRows(terminated.membershipId)).toHaveLength(0);
    });

    it('returns 404 NOT_FOUND on a malformed membership id, before any lookup (APIS §9.6)', async () => {
      const { assistant } = await seedPayableStudent();

      const response = await request(app.getHttpServer())
        .post('/api/v1/memberships/not-a-uuid/payments')
        .set('Authorization', `Bearer ${assistant.accessToken}`)
        .send({ cycle_index: 0 })
        .expect(HttpStatus.NOT_FOUND);

      expect(response.body.error).toBe('NOT_FOUND');
    });
  });

  describe('no correction or reversal path exists (ISS-02 / APIQ-02 / DBQ-02)', () => {
    it('exposes no route to undo a recorded payment', async () => {
      const { assistant, membershipId } = await seedPayableStudent();
      const created = await recordRequest(membershipId, assistant, {
        cycle_index: 0,
      }).expect(HttpStatus.CREATED);
      const paymentId = recordOf(created.body).id;

      const server = app.getHttpServer();
      const auth = `Bearer ${assistant.accessToken}`;
      await request(server)
        .delete(`/api/v1/payments/${paymentId}`)
        .set('Authorization', auth)
        .expect(HttpStatus.NOT_FOUND);
      await request(server)
        .delete(`/api/v1/memberships/${membershipId}/payments/0`)
        .set('Authorization', auth)
        .expect(HttpStatus.NOT_FOUND);
      await request(server)
        .patch(`/api/v1/payments/${paymentId}`)
        .set('Authorization', auth)
        .send({ cycle_index: 1 })
        .expect(HttpStatus.NOT_FOUND);
      await request(server)
        .post(`/api/v1/payments/${paymentId}/reverse`)
        .set('Authorization', auth)
        .expect(HttpStatus.NOT_FOUND);

      // The row is still there, untouched.
      const rows = await storedRows(membershipId);
      expect(rows).toHaveLength(1);
      expect(rows[0].deleted_at).toBeNull();
    });

    it('keeps the row immutable below the application too (DB-CHK-11)', async () => {
      const { assistant, membershipId } = await seedPayableStudent();
      await recordRequest(membershipId, assistant, { cycle_index: 0 }).expect(
        HttpStatus.CREATED,
      );

      await expect(
        dataSource.query(
          'UPDATE payment_records SET cycle_index = 1 WHERE membership_id = $1',
          [membershipId],
        ),
      ).rejects.toThrow(/immutable/);
    });
  });

  describe('auditability (APIS §9.9, RISK-08)', () => {
    it('writes no audit entry — payment recording is deliberately unaudited', async () => {
      const { assistant, membershipId } = await seedPayableStudent();

      await recordRequest(membershipId, assistant, { cycle_index: 0 }).expect(
        HttpStatus.CREATED,
      );

      const entries: Array<{ count: string }> = await dataSource.query(
        `SELECT count(*) AS count
           FROM audit_entries
          WHERE actor_id = $1
            AND action <> 'LOGIN'`,
        [assistant.userId],
      );
      expect(Number(entries[0].count)).toBe(0);
    });
  });
});
