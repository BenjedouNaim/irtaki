/**
 * F-TEST-03 — mass assignment (TS §16, TS §36, issue #124).
 *
 * "For every POST/PATCH endpoint, submit a payload with an extra,
 * unexpected field and assert it's silently stripped, never applied."
 *
 * Driven from {@link MUTATION_ENDPOINTS}, a table that enumerates EVERY
 * mutating route in the system, so coverage is visibly complete instead of
 * a handful of spot checks. `endpoint-table-coverage.integration.spec.ts`
 * cross-checks the table against the controllers, so a new `@Post`/`@Patch`
 * added later fails the suite until it is listed here.
 *
 * Two shapes exist, and each gets the strongest available assertion:
 *
 *  - **Allow-listed** (the route binds a `@Body()` DTO). TS §16 configures
 *    the global `ValidationPipe` with `whitelist: true` AND
 *    `forbidNonWhitelisted: true`, so an unknown property is not merely
 *    dropped — the whole request is refused `422 VALIDATION_ERROR` before
 *    any handler runs. The injected field therefore cannot be applied by
 *    construction. We assert the `details[]` array contains exactly one
 *    `whitelistValidation` entry per injected field and nothing else,
 *    which simultaneously proves (a) the extra field was rejected and
 *    (b) the base payload was otherwise valid, so the `422` is caused by
 *    the injection rather than by an unrelated defect in the fixture.
 *
 *  - **Body-less** (`POST /join-requests/{id}/accept` and `…/reject` bind
 *    no `@Body()`, so no DTO exists to allow-list against). The request
 *    must succeed exactly as if the extra field were absent. Here the
 *    injected value is one that would visibly change the outcome if it
 *    were honoured, and the probe reads the resulting rows back.
 *
 * Every case additionally runs `assertNotApplied`, a direct read of the
 * persisted state, so the suite never rests on a status code alone.
 */
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
import { ErrorEnvelope } from '../../src/shared/filters/http-exception.filter';
import { MUTATION_ROUTES } from './mutation-endpoints';
import { stopScheduledJobs } from '../shared/scheduled-jobs';

const TEST_EMAIL_DOMAIN = '@test-mass-assignment.com';
const TEST_GROUP_PREFIX = 'F-TEST-03 mass assignment group';
const PASSWORD = 'Password123!';
const TIMEZONE = 'Africa/Tunis';

interface TestActor {
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
}

interface PreparedCase {
  /** Fully-qualified request path, prefix included. */
  path: string;
  /** The otherwise-valid payload the injected field rides on. */
  body: Record<string, unknown>;
  /** Bearer token, or `undefined` on a `@Public()` route. */
  token?: string;
  /** Ids and values `assertNotApplied` needs to read the state back. */
  context: Record<string, string>;
}

type CaseOutcome = 'rejected-by-allow-list' | 'ignored-no-body-dto';

interface MutationEndpointCase {
  /** APIS id + route, used as the test name. */
  id: string;
  method: 'post' | 'patch';
  /** The route as declared on the controller, for the coverage cross-check. */
  route: string;
  outcome: CaseOutcome;
  /** The privileged/unexpected field(s) smuggled into the payload. */
  injected: Record<string, unknown>;
  prepare: () => Promise<PreparedCase>;
  /** Reads persisted state and fails if the injected value took effect. */
  assertNotApplied: (prepared: PreparedCase) => Promise<void>;
  /** Success status for `ignored-no-body-dto` cases. */
  successStatus?: number;
}

describe('Mass assignment across every mutation endpoint (F-TEST-03, TS §16/§36)', () => {
  jest.setTimeout(300000);

  let app: INestApplication<App>;
  let dataSource: DataSource;
  let passwordHasher: IPasswordHasher;

  const mockMailer: IMailer = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  };

  /** Long-lived fixtures shared by every case that does not mutate them. */
  let admin: TestActor;
  let teacher: TestActor;
  let assistant: TestActor;
  let otherTeacher: TestActor;
  let otherAssistant: TestActor;
  let student: TestActor;
  let studentMembershipId: string;
  let otherStudent: TestActor;
  let otherStudentMembershipId: string;
  let bystanderA: TestActor;
  let bystanderB: TestActor;
  let groupId: string;
  let otherGroupId: string;
  /**
   * DB-UQ-08 forces every spec to reuse the one seeded Admin, and logging
   * in as them writes a `LOGIN` audit entry (APIS §9.9) that an
   * email-domain cleanup cannot match. Remember when this spec started so
   * `afterAll` can remove exactly the rows it caused.
   */
  const specStartedAt = new Date().toISOString();

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
    // TS §31's five crons are live inside a real AppModule boot: their
    // evaluators would sweep this suite's fixtures on the next tick and
    // write notification_log rows against users it is about to delete.
    stopScheduledJobs(app);

    dataSource = app.get(DataSource);
    passwordHasher = app.get<IPasswordHasher>(PASSWORD_HASHER);
    await cleanDatabase();

    admin = await adminActor();
    teacher = await registerActor(UserRole.Teacher);
    assistant = await registerActor(UserRole.Assistant);
    otherTeacher = await registerActor(UserRole.Teacher);
    otherAssistant = await registerActor(UserRole.Assistant);
    bystanderA = await registerActor(UserRole.User);
    bystanderB = await registerActor(UserRole.User);

    groupId = await createGroup(teacher.userId, assistant.userId, admin.userId);
    otherGroupId = await createGroup(
      otherTeacher.userId,
      otherAssistant.userId,
      admin.userId,
    );

    student = await registerActor(UserRole.Student);
    studentMembershipId = await createMembership(student.userId, groupId);
    otherStudent = await registerActor(UserRole.Student);
    otherStudentMembershipId = await createMembership(
      otherStudent.userId,
      otherGroupId,
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await cleanDatabase();
    }
    await app.close();
  });

  // ── fixtures ──────────────────────────────────────────────────────────

  async function cleanDatabase(): Promise<void> {
    const email = `%${TEST_EMAIL_DOMAIN}`;
    const group = `${TEST_GROUP_PREFIX}%`;
    const membershipsOfTest = `(
      SELECT id FROM memberships
       WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)
          OR group_id IN (SELECT id FROM groups WHERE name LIKE $2)
    )`;
    await dataSource.query(
      `DELETE FROM payment_records WHERE membership_id IN ${membershipsOfTest}`,
      [email, group],
    );
    await dataSource.query(
      `DELETE FROM daily_reports WHERE membership_id IN ${membershipsOfTest}`,
      [email, group],
    );
    await dataSource.query(
      `DELETE FROM weekly_reports WHERE membership_id IN ${membershipsOfTest}`,
      [email, group],
    );
    await dataSource.query(
      `DELETE FROM coverage_intervals WHERE coverage_id IN (
         SELECT id FROM memorization_coverage WHERE membership_id IN ${membershipsOfTest}
       )`,
      [email, group],
    );
    await dataSource.query(
      `DELETE FROM memorization_coverage WHERE membership_id IN ${membershipsOfTest}`,
      [email, group],
    );
    await dataSource.query(
      `DELETE FROM memberships
        WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)
           OR group_id IN (SELECT id FROM groups WHERE name LIKE $2)`,
      [email, group],
    );
    await dataSource.query(
      `DELETE FROM join_request_ahzab WHERE join_request_id IN (
         SELECT id FROM join_requests
          WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)
             OR group_id IN (SELECT id FROM groups WHERE name LIKE $2)
       )`,
      [email, group],
    );
    await dataSource.query(
      `DELETE FROM join_requests
        WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)
           OR group_id IN (SELECT id FROM groups WHERE name LIKE $2)`,
      [email, group],
    );
    await dataSource.query(
      `DELETE FROM groups
        WHERE name LIKE $2
           OR teacher_id IN (SELECT id FROM users WHERE email LIKE $1)
           OR assistant_id IN (SELECT id FROM users WHERE email LIKE $1)`,
      [email, group],
    );
    await dataSource.query(
      `DELETE FROM notification_log WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`,
      [email],
    );
    await dataSource.query(
      `DELETE FROM notification_preferences WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`,
      [email],
    );
    await dataSource.query(
      `DELETE FROM device_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`,
      [email],
    );
    await dataSource.query(
      `DELETE FROM audit_entries WHERE actor_id IN (SELECT id FROM users WHERE email LIKE $1)`,
      [email],
    );
    // The seeded Admin's own LOGIN rows, which the domain filter misses.
    await dataSource.query(
      `DELETE FROM audit_entries
        WHERE occurred_at >= $1::timestamptz
          AND actor_id IN (SELECT id FROM users WHERE role = 'Admin')`,
      [specStartedAt],
    );
    await dataSource.query(
      `DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`,
      [email],
    );
    await dataSource.query('DELETE FROM users WHERE email LIKE $1', [email]);
  }

  async function login(email: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(HttpStatus.OK);
    const body = response.body as {
      access_token: string;
      refresh_token: string;
    };
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
    };
  }

  async function registerActor(role: UserRole): Promise<TestActor> {
    const email = `${role.toLowerCase()}-${uuidv7()}${TEST_EMAIL_DOMAIN}`;
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD, timezone: TIMEZONE })
      .expect(HttpStatus.CREATED);
    const userId = (registration.body as { id: string }).id;

    if (role !== UserRole.User) {
      await dataSource.query(
        'UPDATE users SET role = $1, full_name = $2, gender = $3 WHERE id = $4',
        [role, `${role} ${userId.slice(0, 8)}`, 'Male', userId],
      );
    }

    const tokens = await login(email);
    return { userId, email, ...tokens };
  }

  /** DB-UQ-08: exactly one Admin exists system-wide, so reuse the seeded one. */
  async function adminActor(): Promise<TestActor> {
    const rows: Array<{ id: string; email: string }> = await dataSource.query(
      "SELECT id, email FROM users WHERE role = 'Admin' LIMIT 1",
    );
    if (rows.length === 0) {
      throw new Error('No Admin in the test database — run the seed first.');
    }
    const hash = await passwordHasher.hash(PASSWORD);
    await dataSource.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [hash, rows[0].id],
    );
    const tokens = await login(rows[0].email);
    return { userId: rows[0].id, email: rows[0].email, ...tokens };
  }

  async function createGroup(
    teacherId: string,
    assistantId: string,
    createdBy: string,
  ): Promise<string> {
    const id = uuidv7();
    await dataSource.query(
      `INSERT INTO groups (
         id, name, gender, recitation_day, enrollment_status, lifecycle_state,
         teacher_id, assistant_id, created_by, created_at, updated_at
       ) VALUES ($1, $2, 'Male', 4, 'Open', 'Active', $3, $4, $5, now(), now())`,
      [
        id,
        `${TEST_GROUP_PREFIX} ${uuidv7()}`,
        teacherId,
        assistantId,
        createdBy,
      ],
    );
    return id;
  }

  async function createMembership(
    userId: string,
    group: string,
  ): Promise<string> {
    const id = uuidv7();
    await dataSource.query(
      `INSERT INTO memberships (id, user_id, group_id, state, started_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'Active', (now() - interval '200 days')::date, now(), now())`,
      [id, userId, group],
    );
    return id;
  }

  async function createPendingJoinRequest(
    applicantId: string,
    group: string,
  ): Promise<string> {
    const id = uuidv7();
    await dataSource.query(
      `INSERT INTO join_requests (
         id, user_id, group_id, full_name, gender, age, phone_number,
         occupation, city, memorized_hizb_count, tajweed_level,
         studied_tajweed_theory, studied_qalun, fee_agreement,
         program_goal, score, status
       ) VALUES ($1, $2, $3, $4, 'Male', 25, '+21698123456', 'مهندس', 'تونس',
                 6, 'Intermediate', true, true, true, 'Memorization', 87.5, 'Pending')`,
      [id, applicantId, group, `طالب ${id.slice(0, 8)}`],
    );
    for (const hizb of [1, 2, 3, 4, 5, 6]) {
      await dataSource.query(
        'INSERT INTO join_request_ahzab (join_request_id, hizb_number) VALUES ($1, $2)',
        [id, hizb],
      );
    }
    return id;
  }

  async function createOpenWeeklyReport(membershipId: string): Promise<string> {
    const id = uuidv7();
    await dataSource.query(
      `INSERT INTO weekly_reports (
         id, membership_id, week_start, week_end, expected_days,
         missed_daily_reports, missed_daily_memorization, missed_daily_revision,
         missed_50_repetitions, missed_single_session, attended_recitation_call,
         state
       ) VALUES ($1, $2, (now() - interval '6 days')::date, now()::date,
                 6, 1, 2, 3, 4, 5, false, 'Open')`,
      [id, membershipId],
    );
    return id;
  }

  async function scalar<T>(sql: string, params: unknown[]): Promise<T | null> {
    const rows: Array<Record<string, T>> = await dataSource.query(sql, params);
    if (rows.length === 0) {
      return null;
    }
    return Object.values(rows[0])[0];
  }

  async function countRows(sql: string, params: unknown[]): Promise<number> {
    const value = await scalar<string>(sql, params);
    return Number(value ?? 0);
  }

  async function roleOf(userId: string): Promise<string | null> {
    return scalar<string>('SELECT role FROM users WHERE id = $1', [userId]);
  }

  async function passwordStillWorks(email: string): Promise<boolean> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD });
    return response.status === Number(HttpStatus.OK);
  }

  // ── the endpoint table ────────────────────────────────────────────────

  const MUTATION_ENDPOINTS: MutationEndpointCase[] = [
    {
      id: 'API-001 POST /auth/register',
      method: 'post',
      route: 'POST /auth/register',
      outcome: 'rejected-by-allow-list',
      injected: { role: 'Admin' },
      prepare: () =>
        Promise.resolve({
          path: '/api/v1/auth/register',
          body: {
            email: `escalate-${uuidv7()}${TEST_EMAIL_DOMAIN}`,
            password: PASSWORD,
            timezone: TIMEZONE,
          },
          context: {},
        }),
      assertNotApplied: async (prepared) => {
        const created = await countRows(
          'SELECT count(*) FROM users WHERE email = $1',
          [prepared.body.email],
        );
        expect(created).toBe(0);
      },
    },
    {
      id: 'API-002 POST /auth/login',
      method: 'post',
      route: 'POST /auth/login',
      outcome: 'rejected-by-allow-list',
      injected: { role: 'Admin' },
      prepare: () =>
        Promise.resolve({
          path: '/api/v1/auth/login',
          body: { email: bystanderA.email, password: PASSWORD },
          context: { userId: bystanderA.userId },
        }),
      assertNotApplied: async (prepared) => {
        expect(await roleOf(prepared.context.userId)).toBe('User');
      },
    },
    {
      id: 'API-003 POST /auth/refresh',
      method: 'post',
      route: 'POST /auth/refresh',
      outcome: 'rejected-by-allow-list',
      injected: { user_id: 'IMPERSONATE' },
      prepare: async () => {
        const target = await registerActor(UserRole.User);
        const baseline = await countRows(
          'SELECT count(*) FROM auth_tokens WHERE user_id = $1',
          [target.userId],
        );
        return {
          path: '/api/v1/auth/refresh',
          body: { refresh_token: bystanderA.refreshToken },
          context: { targetId: target.userId, baseline: String(baseline) },
        };
      },
      assertNotApplied: async (prepared) => {
        const issued = await countRows(
          'SELECT count(*) FROM auth_tokens WHERE user_id = $1',
          [prepared.context.targetId],
        );
        // The injected `user_id` must not have minted a session for anyone
        // other than the refresh token's own owner.
        expect(issued).toBe(Number(prepared.context.baseline));
      },
    },
    {
      id: 'API-004 POST /auth/logout',
      method: 'post',
      route: 'POST /auth/logout',
      outcome: 'rejected-by-allow-list',
      injected: { user_id: 'IMPERSONATE' },
      prepare: async () => {
        const victim = await registerActor(UserRole.User);
        return {
          path: '/api/v1/auth/logout',
          body: { refresh_token: bystanderB.refreshToken },
          token: bystanderB.accessToken,
          context: { victimId: victim.userId },
        };
      },
      assertNotApplied: async (prepared) => {
        const revoked = await countRows(
          'SELECT count(*) FROM auth_tokens WHERE user_id = $1 AND revoked_at IS NOT NULL',
          [prepared.context.victimId],
        );
        expect(revoked).toBe(0);
      },
    },
    {
      id: 'API-005 POST /auth/password-reset/request',
      method: 'post',
      route: 'POST /auth/password-reset/request',
      outcome: 'rejected-by-allow-list',
      injected: { new_password: 'AttackerChosen1!' },
      prepare: async () => {
        const victim = await registerActor(UserRole.User);
        return {
          path: '/api/v1/auth/password-reset/request',
          body: { email: victim.email },
          context: { victimEmail: victim.email },
        };
      },
      assertNotApplied: async (prepared) => {
        expect(await passwordStillWorks(prepared.context.victimEmail)).toBe(
          true,
        );
      },
    },
    {
      id: 'API-006 POST /auth/password-reset/confirm',
      method: 'post',
      route: 'POST /auth/password-reset/confirm',
      outcome: 'rejected-by-allow-list',
      injected: { email: 'RETARGET' },
      prepare: async () => {
        const victim = await registerActor(UserRole.User);
        return {
          path: '/api/v1/auth/password-reset/confirm',
          body: { token: uuidv7(), new_password: 'AttackerChosen1!' },
          context: { victimEmail: victim.email },
        };
      },
      assertNotApplied: async (prepared) => {
        expect(await passwordStillWorks(prepared.context.victimEmail)).toBe(
          true,
        );
      },
    },
    {
      id: 'API-007 PATCH /me',
      method: 'patch',
      route: 'PATCH /me',
      outcome: 'rejected-by-allow-list',
      injected: { role: 'Admin' },
      prepare: async () => {
        const caller = await registerActor(UserRole.Student);
        return {
          path: '/api/v1/me',
          body: { timezone: 'Europe/Paris' },
          token: caller.accessToken,
          context: { callerId: caller.userId },
        };
      },
      assertNotApplied: async (prepared) => {
        expect(await roleOf(prepared.context.callerId)).toBe('Student');
      },
    },
    {
      id: 'API-008 PATCH /users/{id}/role',
      method: 'patch',
      route: 'PATCH /users/:id/role',
      outcome: 'rejected-by-allow-list',
      injected: { user_id: 'RETARGET' },
      prepare: async () => {
        const target = await registerActor(UserRole.User);
        const retarget = await registerActor(UserRole.User);
        return {
          path: `/api/v1/users/${target.userId}/role`,
          body: { role: 'Teacher' },
          token: admin.accessToken,
          context: { targetId: target.userId, retargetId: retarget.userId },
        };
      },
      assertNotApplied: async (prepared) => {
        expect(await roleOf(prepared.context.targetId)).toBe('User');
        expect(await roleOf(prepared.context.retargetId)).toBe('User');
      },
    },
    {
      id: 'API-021 POST /join-requests',
      method: 'post',
      route: 'POST /join-requests',
      outcome: 'rejected-by-allow-list',
      injected: { status: 'Accepted', score: 100 },
      prepare: async () => {
        const applicant = await registerActor(UserRole.User);
        return {
          path: '/api/v1/join-requests',
          body: {
            group_id: groupId,
            full_name: 'طالب اختبار الإسناد',
            gender: 'Male',
            age: 24,
            phone_number: '+21698123456',
            occupation: 'مهندس',
            city: 'تونس',
            memorized_ahzab: [1, 2, 3, 4, 5],
            tajweed_level: 'Intermediate',
            studied_tajweed_theory: true,
            studied_qalun: true,
            fee_agreement: true,
            program_goal: 'Memorization',
          },
          token: applicant.accessToken,
          context: { applicantId: applicant.userId },
        };
      },
      assertNotApplied: async (prepared) => {
        const rows = await countRows(
          'SELECT count(*) FROM join_requests WHERE user_id = $1',
          [prepared.context.applicantId],
        );
        expect(rows).toBe(0);
      },
    },
    {
      id: 'API-023 POST /join-requests/{id}/accept',
      method: 'post',
      route: 'POST /join-requests/:id/accept',
      outcome: 'ignored-no-body-dto',
      successStatus: HttpStatus.OK,
      // Honouring either field would move the applicant into a group the
      // Assistant does not staff, or flip the decision.
      injected: { group_id: 'REDIRECT', status: 'Rejected' },
      prepare: async () => {
        const applicant = await registerActor(UserRole.User);
        const joinRequestId = await createPendingJoinRequest(
          applicant.userId,
          groupId,
        );
        return {
          path: `/api/v1/join-requests/${joinRequestId}/accept`,
          body: {},
          token: assistant.accessToken,
          context: { applicantId: applicant.userId, joinRequestId },
        };
      },
      assertNotApplied: async (prepared) => {
        const status = await scalar<string>(
          'SELECT status FROM join_requests WHERE id = $1',
          [prepared.context.joinRequestId],
        );
        expect(status).toBe('Accepted');
        const landedGroup = await scalar<string>(
          "SELECT group_id FROM memberships WHERE user_id = $1 AND state = 'Active'",
          [prepared.context.applicantId],
        );
        expect(landedGroup).toBe(groupId);
        expect(landedGroup).not.toBe(otherGroupId);
      },
    },
    {
      id: 'API-024 POST /join-requests/{id}/reject',
      method: 'post',
      route: 'POST /join-requests/:id/reject',
      outcome: 'ignored-no-body-dto',
      successStatus: HttpStatus.OK,
      injected: { status: 'Accepted' },
      prepare: async () => {
        const applicant = await registerActor(UserRole.User);
        const joinRequestId = await createPendingJoinRequest(
          applicant.userId,
          groupId,
        );
        return {
          path: `/api/v1/join-requests/${joinRequestId}/reject`,
          body: {},
          token: assistant.accessToken,
          context: { applicantId: applicant.userId, joinRequestId },
        };
      },
      assertNotApplied: async (prepared) => {
        const status = await scalar<string>(
          'SELECT status FROM join_requests WHERE id = $1',
          [prepared.context.joinRequestId],
        );
        expect(status).toBe('Rejected');
        expect(await roleOf(prepared.context.applicantId)).toBe('User');
        const memberships = await countRows(
          'SELECT count(*) FROM memberships WHERE user_id = $1',
          [prepared.context.applicantId],
        );
        expect(memberships).toBe(0);
      },
    },
    {
      id: 'API-012 POST /groups',
      method: 'post',
      route: 'POST /groups',
      outcome: 'rejected-by-allow-list',
      injected: { lifecycle_state: 'Archived', created_by: 'SPOOF' },
      prepare: () =>
        Promise.resolve({
          path: '/api/v1/groups',
          body: {
            name: `${TEST_GROUP_PREFIX} created ${uuidv7()}`,
            gender: 'Male',
            recitation_day: 4,
            teacher_id: teacher.userId,
            assistant_id: assistant.userId,
          },
          token: admin.accessToken,
          context: {},
        }),
      assertNotApplied: async (prepared) => {
        const created = await countRows(
          'SELECT count(*) FROM groups WHERE name = $1',
          [prepared.body.name],
        );
        expect(created).toBe(0);
      },
    },
    {
      id: 'API-014 PATCH /groups/{id}',
      method: 'patch',
      route: 'PATCH /groups/:id',
      outcome: 'rejected-by-allow-list',
      injected: { lifecycle_state: 'Archived' },
      prepare: async () => {
        const target = await createGroup(
          teacher.userId,
          assistant.userId,
          admin.userId,
        );
        return {
          path: `/api/v1/groups/${target}`,
          body: { name: `${TEST_GROUP_PREFIX} renamed ${uuidv7()}` },
          token: admin.accessToken,
          context: { groupId: target },
        };
      },
      assertNotApplied: async (prepared) => {
        const lifecycle = await scalar<string>(
          'SELECT lifecycle_state FROM groups WHERE id = $1',
          [prepared.context.groupId],
        );
        expect(lifecycle).toBe('Active');
      },
    },
    {
      id: 'API-016 PATCH /groups/{id}/lifecycle',
      method: 'patch',
      route: 'PATCH /groups/:id/lifecycle',
      outcome: 'rejected-by-allow-list',
      injected: { enrollment_status: 'Closed' },
      prepare: async () => {
        const target = await createGroup(
          teacher.userId,
          assistant.userId,
          admin.userId,
        );
        return {
          path: `/api/v1/groups/${target}/lifecycle`,
          body: { lifecycle_state: 'Archived' },
          token: admin.accessToken,
          context: { groupId: target },
        };
      },
      assertNotApplied: async (prepared) => {
        const enrollment = await scalar<string>(
          'SELECT enrollment_status FROM groups WHERE id = $1',
          [prepared.context.groupId],
        );
        expect(enrollment).toBe('Open');
      },
    },
    {
      id: 'API-017 PATCH /groups/{id}/staff',
      method: 'patch',
      route: 'PATCH /groups/:id/staff',
      outcome: 'rejected-by-allow-list',
      injected: { created_by: 'SPOOF' },
      prepare: async () => {
        const target = await createGroup(
          teacher.userId,
          assistant.userId,
          admin.userId,
        );
        return {
          path: `/api/v1/groups/${target}/staff`,
          body: { teacher_id: otherTeacher.userId },
          token: admin.accessToken,
          context: { groupId: target },
        };
      },
      assertNotApplied: async (prepared) => {
        const createdBy = await scalar<string>(
          'SELECT created_by FROM groups WHERE id = $1',
          [prepared.context.groupId],
        );
        expect(createdBy).toBe(admin.userId);
      },
    },
    {
      id: 'API-015 PATCH /groups/{id}/enrollment',
      method: 'patch',
      route: 'PATCH /groups/:id/enrollment',
      outcome: 'rejected-by-allow-list',
      injected: { lifecycle_state: 'Archived' },
      prepare: async () => {
        const target = await createGroup(
          teacher.userId,
          assistant.userId,
          admin.userId,
        );
        return {
          path: `/api/v1/groups/${target}/enrollment`,
          body: { enrollment_status: 'Closed' },
          token: teacher.accessToken,
          context: { groupId: target },
        };
      },
      assertNotApplied: async (prepared) => {
        const lifecycle = await scalar<string>(
          'SELECT lifecycle_state FROM groups WHERE id = $1',
          [prepared.context.groupId],
        );
        expect(lifecycle).toBe('Active');
      },
    },
    {
      id: 'API-048 POST /devices',
      method: 'post',
      route: 'POST /devices',
      outcome: 'rejected-by-allow-list',
      injected: { user_id: 'IMPERSONATE' },
      prepare: async () => {
        const victim = await registerActor(UserRole.User);
        return {
          path: '/api/v1/devices',
          body: { token: `ExponentPushToken[${uuidv7()}]`, platform: 'iOS' },
          token: bystanderA.accessToken,
          context: { victimId: victim.userId },
        };
      },
      assertNotApplied: async (prepared) => {
        const rows = await countRows(
          'SELECT count(*) FROM device_tokens WHERE token = $1',
          [prepared.body.token],
        );
        expect(rows).toBe(0);
        const forVictim = await countRows(
          'SELECT count(*) FROM device_tokens WHERE user_id = $1',
          [prepared.context.victimId],
        );
        expect(forVictim).toBe(0);
      },
    },
    {
      id: 'API-051 PATCH /me/notification-preferences',
      method: 'patch',
      route: 'PATCH /me/notification-preferences',
      outcome: 'rejected-by-allow-list',
      injected: { user_id: 'IMPERSONATE' },
      prepare: async () => {
        const victim = await registerActor(UserRole.User);
        return {
          path: '/api/v1/me/notification-preferences',
          body: { category: 'N-01', muted: true },
          token: bystanderB.accessToken,
          context: { victimId: victim.userId },
        };
      },
      assertNotApplied: async (prepared) => {
        const rows = await countRows(
          'SELECT count(*) FROM notification_preferences WHERE user_id = $1',
          [prepared.context.victimId],
        );
        expect(rows).toBe(0);
      },
    },
    {
      id: 'API-047 POST /memberships/{id}/payments',
      method: 'post',
      route: 'POST /memberships/:id/payments',
      outcome: 'rejected-by-allow-list',
      // BR-31: the 30 TND fee is a server constant and may never be chosen
      // by the caller.
      injected: { amount: 1, recorded_by: 'SPOOF', paid_at: '1990-01-01' },
      prepare: async () => {
        const payer = await registerActor(UserRole.Student);
        const membershipId = await createMembership(payer.userId, groupId);
        return {
          path: `/api/v1/memberships/${membershipId}/payments`,
          body: { cycle_index: 1 },
          token: assistant.accessToken,
          context: { membershipId },
        };
      },
      assertNotApplied: async (prepared) => {
        const rows = await countRows(
          'SELECT count(*) FROM payment_records WHERE membership_id = $1',
          [prepared.context.membershipId],
        );
        expect(rows).toBe(0);
      },
    },
    {
      id: 'API-029 POST /daily-reports',
      method: 'post',
      route: 'POST /daily-reports',
      outcome: 'rejected-by-allow-list',
      injected: { membership_id: 'RETARGET' },
      prepare: () =>
        Promise.resolve({
          path: '/api/v1/daily-reports',
          body: { type: 'Absent', absence_reason: 'Sick' },
          token: student.accessToken,
          context: { victimMembershipId: otherStudentMembershipId },
        }),
      assertNotApplied: async (prepared) => {
        const rows = await countRows(
          'SELECT count(*) FROM daily_reports WHERE membership_id = $1',
          [prepared.context.victimMembershipId],
        );
        expect(rows).toBe(0);
      },
    },
    {
      id: 'API-034 POST /weekly-reports/{id}/confirm',
      method: 'post',
      route: 'POST /weekly-reports/:id/confirm',
      outcome: 'rejected-by-allow-list',
      injected: { state: 'Finalised', finalised_by: 'SPOOF' },
      prepare: async () => {
        const reportId = await createOpenWeeklyReport(studentMembershipId);
        return {
          path: `/api/v1/weekly-reports/${reportId}/confirm`,
          body: { attended_recitation_call: true },
          token: student.accessToken,
          context: { reportId },
        };
      },
      assertNotApplied: async (prepared) => {
        const row: Array<{ state: string; finalised_by: string | null }> =
          await dataSource.query(
            'SELECT state, finalised_by FROM weekly_reports WHERE id = $1',
            [prepared.context.reportId],
          );
        expect(row[0].state).toBe('Open');
        expect(row[0].finalised_by).toBeNull();
      },
    },
  ];

  /**
   * Placeholder values in `injected` that can only be resolved once the
   * fixtures exist. Keeping them as literals keeps the table declarative.
   */
  function resolveInjected(
    injected: Record<string, unknown>,
    prepared: PreparedCase,
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(injected)) {
      if (value === 'IMPERSONATE') {
        resolved[key] = prepared.context.victimId ?? prepared.context.targetId;
      } else if (value === 'RETARGET') {
        resolved[key] =
          prepared.context.retargetId ??
          prepared.context.victimMembershipId ??
          prepared.context.victimEmail;
      } else if (value === 'SPOOF') {
        resolved[key] = teacher.userId;
      } else if (value === 'REDIRECT') {
        resolved[key] = otherGroupId;
      } else {
        resolved[key] = value;
      }
    }
    return resolved;
  }

  it('covers every mutation endpoint the controllers declare', () => {
    // `MUTATION_ROUTES` is itself checked against the controller sources by
    // mutation-endpoint-coverage.integration.spec.ts, so this equality is
    // what makes "every POST/PATCH endpoint" verifiable rather than counted
    // by hand.
    expect(MUTATION_ENDPOINTS.map((endpoint) => endpoint.route).sort()).toEqual(
      [...MUTATION_ROUTES].sort(),
    );
  });

  describe.each(MUTATION_ENDPOINTS)(
    '$id',
    ({
      method,
      outcome,
      injected,
      prepare,
      assertNotApplied,
      successStatus,
    }) => {
      it('never applies an unexpected field smuggled into the payload', async () => {
        const prepared = await prepare();
        const resolved = resolveInjected(injected, prepared);
        const injectedFields = Object.keys(resolved);

        let call = request(app.getHttpServer())
          [method](prepared.path)
          .send({ ...prepared.body, ...resolved });
        if (prepared.token) {
          call = call.set('Authorization', `Bearer ${prepared.token}`);
        }
        const response = await call;

        if (outcome === 'rejected-by-allow-list') {
          // TS §16: `forbidNonWhitelisted` refuses the request outright,
          // which is a strictly stronger guarantee than stripping.
          expect(response.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
          const body = response.body as ErrorEnvelope;
          expect(body.error).toBe('VALIDATION_ERROR');
          expect(body.details).toBeDefined();
          // Exactly one whitelist rejection per injected field, and no
          // other validation error — the base payload was otherwise valid,
          // so the 422 is caused by the injection and nothing else.
          expect(
            (body.details ?? [])
              .map((detail) => `${detail.field}:${detail.rule ?? ''}`)
              .sort(),
          ).toEqual(
            injectedFields.map((f) => `${f}:whitelistValidation`).sort(),
          );
        } else {
          // No DTO to allow-list against: the route must behave exactly as
          // if the extra field were absent.
          expect(response.status).toBe(successStatus);
          const serialized = JSON.stringify(response.body);
          for (const value of Object.values(resolved)) {
            expect(serialized).not.toContain(String(value));
          }
        }

        await assertNotApplied(prepared);
      });
    },
  );
});
