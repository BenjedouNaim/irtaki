/**
 * F-TEST-02 — the parameterized authorization-matrix suite (TS §36's first
 * row: "Parameterized Supertest suite hitting every endpoint with every
 * role, asserting the authorization matrix (§15.1) exactly").
 *
 * The matrix itself lives next door in `authorization-matrix.ts`, declared
 * as data transcribed from APIS §6.1 so it can be diffed against the
 * document by eye. This file only builds the fixture graph and turns each
 * declared cell into HTTP assertions:
 *
 *   54 endpoints × 5 roles = 270 cells, plus one *same-role, wrong-scope*
 *   test for every cell whose route carries a resource id (TS §36's
 *   ScopeGuard row: "one test as the legitimate owner (200), one as a
 *   different, otherwise-valid staff member of a *different* group (403)").
 *
 * This is a superset check, not a replacement: each feature's own suite
 * still owns its business rules, response shapes and row-level scoping.
 * What this suite owns is the claim that no cell of §6.1 was missed.
 */
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
import { ErrorEnvelope } from '../../src/shared/filters/http-exception.filter';
import {
  AUTHORIZATION_MATRIX,
  DEC_B09,
  EndpointAuthz,
  INVERTED_EXCLUSIONS,
  Role,
  ROLES,
  SRS_10_TEACHER_PAYMENTS,
  endpointOf,
  isAllowed,
  isScoped,
} from './authorization-matrix';
import { purgeNotificationLog, stopScheduledJobs } from './scheduled-jobs';

const EMAIL_DOMAIN = '@test-authz-matrix.com';
const GROUP_PREFIX = 'F-TEST-02 authz';
const PASSWORD = 'Password123!';
const TIMEZONE = 'Africa/Tunis';

/**
 * SA §14 / NFR-20 — every authorization failure answers with one masked
 * result. What is uniform across the whole surface today is the status and
 * the machine-readable code, so that is what every refused cell asserts.
 *
 * The human-readable `message` is *not* uniform and is deliberately not
 * asserted here: the route-specific ScopeGuards raise the Arabic
 * `'ليس لديك صلاحية للوصول إلى هذا المورد'`, while `RolesGuard` and the
 * use-case-level scope checks in Groups, Memberships and Enrollment raise a
 * bare `ForbiddenException`, which the global filter renders with the
 * English default `'Forbidden'`. That inconsistency is an error-envelope
 * defect rather than a §6.1 cell, and is reported as an open question.
 */
const UNIFORM_403 = {
  statusCode: 403,
  error: 'SCOPE_DENIED',
};

type Variant = 'owner' | 'foreign';

interface Actor {
  userId: string;
  email: string;
  accessToken: string;
  role: Role;
}

/** One complete, self-consistent group: staff, a student, an applicant. */
interface Side {
  groupId: string;
  teacher: Actor;
  assistant: Actor;
  student: Actor;
  membershipId: string;
  /** A `User` holding a Pending join request on this side's group. */
  applicant: Actor;
  joinRequestId: string;
}

interface Plan {
  path: string;
  body?: Record<string, unknown>;
  /**
   * Overrides the default caller for this cell. Used only where the default
   * side-A actor cannot legitimately make the call — e.g. the Student who
   * owns the confirmable weekly report is not side A's student, and the User
   * submitting a fresh join request must be one who holds none (BR-01).
   */
  actor?: Actor;
}

function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function isoDay(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

function shift(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

describe('APIS §6.1 authorization matrix (F-TEST-02 / TS §36)', () => {
  jest.setTimeout(900_000);

  let app: INestApplication<App>;
  let dataSource: DataSource;

  /** The last password-reset token the (mocked) mailer was handed. */
  let capturedResetToken = '';
  const mockMailer: IMailer = {
    sendPasswordResetEmail: jest.fn((_email: string, token: string) => {
      capturedResetToken = token;
      return Promise.resolve();
    }),
  };

  const today = todayIn(TIMEZONE);
  const todayIsoDay = isoDay(today);
  /** Any weekday that is *not* today — daily reports are blocked on the
   *  group's recitation day (E-05 / VR-12), so side A must not recite today. */
  const otherIsoDay = todayIsoDay === 7 ? 1 : todayIsoDay + 1;
  const longAgo = shift(today, -120);

  let admin: Actor;
  /** When the suite started, so its own audit trail can be removed again. */
  let suiteStartedAt: Date;
  let sideA: Side;
  let sideB: Side;
  /** A Student whose group recites *today*, with an Open weekly report. */
  let weeklyOwner: { actor: Actor; membershipId: string; reportId: string };
  /** The device the `owner` cell deletes — one per role. */
  const ownDevices = new Map<Role, string>();
  /**
   * A second, never-deleted device belonging to the same `owner` actor: the
   * resource the wrong-scope caller reaches for, so the 403 is caused by the
   * caller not owning it and not by the row having already gone.
   */
  const probeDevices = new Map<Role, string>();

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

    // DS-02's cron must not finalise the fixture week mid-suite (ADR-024).
    void app
      .get(SchedulerRegistry)
      .getCronJob(WEEKLY_REPORT_FINALIZATION_CRON)
      .stop();

    dataSource = app.get(DataSource);
    await cleanDatabase();

    // The seeded Admin is not this suite's user and therefore survives
    // `cleanDatabase`, but the AuditEntry rows this suite makes it write
    // (LOGIN per FR-AUTH-07, GROUP_CREATED, STAFF_REASSIGNED) must not
    // outlive the run — `GET /audit` is itself an endpoint under test.
    suiteStartedAt = new Date();
    admin = await loginSeededAdmin();
    sideA = await buildSide('a');
    sideB = await buildSide('b');
    weeklyOwner = await buildWeeklyOwner();

    for (const role of ROLES) {
      const owner = actorFor(role, 'owner');
      ownDevices.set(role, await createDevice(owner));
      probeDevices.set(role, await createDevice(owner));
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await cleanDatabase();
      if (admin && suiteStartedAt) {
        await dataSource.query(
          `DELETE FROM audit_entries
           WHERE actor_id = $1 AND occurred_at >= $2`,
          [admin.userId, suiteStartedAt],
        );
      }
    }
    await app.close();
  });

  // ───────────────────────────── fixtures ──────────────────────────────

  /**
   * Removes only what this suite creates: users at `EMAIL_DOMAIN` and groups
   * named with `GROUP_PREFIX`. Both are bound as parameters — nothing here
   * is spliced into SQL text (TS §36).
   */
  async function cleanDatabase(): Promise<void> {
    const emailLike = `%${EMAIL_DOMAIN}`;
    const nameLike = `${GROUP_PREFIX}%`;
    const USERS = 'SELECT id FROM users WHERE email LIKE $1';
    const GROUPS = 'SELECT id FROM groups WHERE name LIKE $2';
    const MEMBERSHIPS = `SELECT id FROM memberships
       WHERE user_id IN (${USERS}) OR group_id IN (${GROUPS})`;
    const both = [emailLike, nameLike];

    await dataSource.query(
      `DELETE FROM coverage_intervals WHERE coverage_id IN (
         SELECT id FROM memorization_coverage
         WHERE membership_id IN (${MEMBERSHIPS}))`,
      both,
    );
    for (const table of [
      'weekly_reports',
      'daily_reports',
      'payment_records',
      'memorization_coverage',
    ]) {
      await dataSource.query(
        `DELETE FROM ${table} WHERE membership_id IN (${MEMBERSHIPS})`,
        both,
      );
    }
    await dataSource.query(
      `DELETE FROM memberships
       WHERE user_id IN (${USERS}) OR group_id IN (${GROUPS})`,
      both,
    );
    await dataSource.query(
      `DELETE FROM join_request_ahzab WHERE join_request_id IN (
         SELECT id FROM join_requests
         WHERE user_id IN (${USERS}) OR group_id IN (${GROUPS}))`,
      both,
    );
    await dataSource.query(
      `DELETE FROM join_requests
       WHERE user_id IN (${USERS}) OR group_id IN (${GROUPS})`,
      both,
    );
    await dataSource.query(
      `DELETE FROM audit_entries
       WHERE actor_id IN (${USERS}) OR target_id IN (${GROUPS})`,
      both,
    );
    await dataSource.query(
      `DELETE FROM groups
       WHERE name LIKE $2
          OR teacher_id IN (${USERS})
          OR assistant_id IN (${USERS})`,
      both,
    );
    for (const table of [
      'notification_log',
      'notification_preferences',
      'device_tokens',
      'auth_tokens',
    ]) {
      await dataSource.query(
        `DELETE FROM ${table} WHERE user_id IN (${USERS})`,
        [emailLike],
      );
    }
    // DBT-17 holds ON DELETE RESTRICT references to these users.
    await purgeNotificationLog(dataSource);
    await dataSource.query('DELETE FROM users WHERE email LIKE $1', [
      emailLike,
    ]);
  }

  /**
   * INV-02 / DB-UQ-08 keep the Admin a singleton, so the suite adopts the
   * seeded one rather than creating a second (SRS §14.2: an Admin "may not
   * create another Admin").
   */
  async function loginSeededAdmin(): Promise<Actor> {
    const rows: Array<{ id: string; email: string }> = await dataSource.query(
      "SELECT id, email FROM users WHERE role = 'Admin' LIMIT 1",
    );
    const hasher = app.get<IPasswordHasher>(PASSWORD_HASHER);
    await dataSource.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [await hasher.hash(PASSWORD), rows[0].id],
    );
    const accessToken = await login(rows[0].email);
    return {
      userId: rows[0].id,
      email: rows[0].email,
      accessToken,
      role: 'Admin',
    };
  }

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(HttpStatus.OK);
    return (res.body as { access_token: string }).access_token;
  }

  async function refreshTokenFor(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(HttpStatus.OK);
    return (res.body as { refresh_token: string }).refresh_token;
  }

  async function register(
    role: Role,
    label: string,
  ): Promise<{ userId: string; email: string }> {
    const email = `${label}-${uuidv7()}${EMAIL_DOMAIN}`;
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD, timezone: TIMEZONE })
      .expect(HttpStatus.CREATED);
    const userId = (res.body as { id: string }).id;
    if (role !== 'User') {
      await dataSource.query(
        'UPDATE users SET role = $1, full_name = $2, gender = $3 WHERE id = $4',
        [role, `${role} ${label}`, 'Male', userId],
      );
    }
    return { userId, email };
  }

  async function makeActor(role: Role, label: string): Promise<Actor> {
    const { userId, email } = await register(role, label);
    return { userId, email, accessToken: await login(email), role };
  }

  async function createGroup(
    teacherId: string,
    assistantId: string,
    recitationDay: number,
  ): Promise<string> {
    const groupId = uuidv7();
    await dataSource.query(
      `INSERT INTO groups (
         id, name, gender, recitation_day, enrollment_status,
         lifecycle_state, teacher_id, assistant_id, created_by,
         created_at, updated_at
       ) VALUES ($1, $2, 'Male', $3, 'Open', 'Active', $4, $5, $4, now(), now())`,
      [
        groupId,
        `${GROUP_PREFIX} ${uuidv7()}`,
        recitationDay,
        teacherId,
        assistantId,
      ],
    );
    return groupId;
  }

  /** An Active membership with the seeded coverage row DS-01 creates. */
  async function enrol(userId: string, groupId: string): Promise<string> {
    const membershipId = uuidv7();
    await dataSource.query(
      `INSERT INTO memberships (id, user_id, group_id, state, started_at)
       VALUES ($1, $2, $3, 'Active', $4::date)`,
      [membershipId, userId, groupId, longAgo],
    );
    await dataSource.query(
      `INSERT INTO memorization_coverage (id, membership_id, ahzab_completed)
       VALUES ($1, $2, 0)`,
      [uuidv7(), membershipId],
    );
    return membershipId;
  }

  async function createJoinRequest(groupId: string): Promise<{
    applicant: Actor;
    joinRequestId: string;
  }> {
    const applicant = await makeActor('User', 'applicant');
    const joinRequestId = uuidv7();
    await dataSource.query(
      `INSERT INTO join_requests (
         id, user_id, group_id, full_name, gender, age, phone_number,
         occupation, city, memorized_hizb_count, tajweed_level,
         studied_tajweed_theory, studied_qalun, fee_agreement, program_goal,
         score, status
       ) VALUES ($1, $2, $3, 'مترشح الاختبار', 'Male', 26, '+21698123456',
                 'مهندس', 'تونس', 10, 'Advanced', true, true, true,
                 'Memorization', 58.33, 'Pending')`,
      [joinRequestId, applicant.userId, groupId],
    );
    return { applicant, joinRequestId };
  }

  async function buildSide(label: 'a' | 'b'): Promise<Side> {
    const teacher = await makeActor('Teacher', `teacher-${label}`);
    const assistant = await makeActor('Assistant', `assistant-${label}`);
    const groupId = await createGroup(
      teacher.userId,
      assistant.userId,
      otherIsoDay,
    );
    const student = await makeActor('Student', `student-${label}`);
    const membershipId = await enrol(student.userId, groupId);
    const { applicant, joinRequestId } = await createJoinRequest(groupId);
    return {
      groupId,
      teacher,
      assistant,
      student,
      membershipId,
      applicant,
      joinRequestId,
    };
  }

  /**
   * `POST /weekly-reports/{id}/confirm` is only confirmable on the group's
   * recitation day (VR-21), so its owner needs a group that recites today.
   */
  async function buildWeeklyOwner(): Promise<{
    actor: Actor;
    membershipId: string;
    reportId: string;
  }> {
    const teacher = await makeActor('Teacher', 'teacher-w');
    const assistant = await makeActor('Assistant', 'assistant-w');
    const groupId = await createGroup(
      teacher.userId,
      assistant.userId,
      todayIsoDay,
    );
    const actor = await makeActor('Student', 'student-w');
    const membershipId = await enrol(actor.userId, groupId);
    const reportId = uuidv7();
    await dataSource.query(
      `INSERT INTO weekly_reports (
         id, membership_id, week_start, week_end, expected_days,
         missed_daily_reports, missed_daily_memorization,
         missed_daily_revision, missed_50_repetitions, missed_single_session,
         attended_recitation_call, state
       ) VALUES ($1, $2, $3::date, $4::date, 6, 0, 0, 0, 0, 0, false, 'Open')`,
      [reportId, membershipId, shift(today, -6), today],
    );
    return { actor, membershipId, reportId };
  }

  async function createDevice(owner: Actor): Promise<string> {
    const res = await send('POST', '/devices', owner.accessToken, {
      token: `authz-device-${uuidv7()}`,
      platform: 'iOS',
    }).expect(HttpStatus.OK);
    return (res.body as { data: { id: string } }).data.id;
  }

  // ───────────────────────────── actors ────────────────────────────────

  /**
   * The caller for a cell. `owner` is the legitimate holder of side A's
   * resources; `foreign` is the *same role*, equally valid, but staffing /
   * owning side B — TS §36's "a different, otherwise-valid staff member of a
   * different group", never merely "some other role".
   */
  function actorFor(role: Role, variant: Variant): Actor {
    const side = variant === 'owner' ? sideA : sideB;
    switch (role) {
      case 'Admin':
        return admin;
      case 'Teacher':
        return side.teacher;
      case 'Assistant':
        return side.assistant;
      case 'Student':
        return side.student;
      case 'User':
        return side.applicant;
    }
  }

  /**
   * The caller for a cell, after any plan-level override. `DELETE /devices/{id}`
   * is "own" for all five roles and DB-UQ-08 forbids a second Admin, so the
   * Admin's wrong-scope caller there is a different *user* rather than a
   * same-role peer; every other wrong-scope caller in the suite is same-role.
   */
  function callerFor(
    endpoint: EndpointAuthz,
    role: Role,
    variant: Variant,
    plan: Plan,
  ): Actor {
    if (plan.actor) {
      return plan.actor;
    }
    if (
      variant === 'foreign' &&
      role === 'Admin' &&
      endpoint.api === 'API-049'
    ) {
      return sideB.teacher;
    }
    return actorFor(role, variant);
  }

  // ───────────────────────────── requests ──────────────────────────────

  function send(
    method: string,
    path: string,
    token: string | null,
    body?: Record<string, unknown>,
  ): request.Test {
    const server = app.getHttpServer();
    const url = `/api/v1${path}`;
    let test: request.Test;
    switch (method) {
      case 'GET':
        test = request(server).get(url);
        break;
      case 'POST':
        test = request(server).post(url);
        break;
      case 'PATCH':
        test = request(server).patch(url);
        break;
      case 'DELETE':
        test = request(server).delete(url);
        break;
      default:
        throw new Error(`Unsupported method ${method}`);
    }
    if (token) {
      test = test.set('Authorization', `Bearer ${token}`);
    }
    return body === undefined ? test : test.send(body);
  }

  const JOIN_REQUEST_BODY = {
    full_name: 'أحمد التونسي',
    gender: 'Male',
    age: 26,
    phone_number: '+21698123456',
    occupation: 'مهندس برمجيات',
    city: 'تونس',
    memorized_ahzab: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    tajweed_level: 'Advanced',
    studied_tajweed_theory: true,
    studied_qalun: true,
    fee_agreement: true,
    program_goal: 'Memorization',
  };

  /**
   * Builds the request for one cell. `variant` picks whose resource is
   * named only where a *fresh* one is needed (writes that cannot repeat);
   * everything else always names side A's resource, so a `foreign` caller
   * is genuinely reaching across a group boundary and a denied role is
   * genuinely reaching for a resource that exists.
   */
  async function planFor(
    api: string,
    role: Role,
    variant: Variant,
  ): Promise<Plan> {
    const allowed =
      variant === 'owner' && isAllowed(endpointOf(api).cells[role]);
    switch (api) {
      case 'API-001':
        return {
          path: '/auth/register',
          body: {
            email: `reg-${uuidv7()}${EMAIL_DOMAIN}`,
            password: PASSWORD,
            timezone: TIMEZONE,
          },
        };
      case 'API-002': {
        const fresh = await register('User', 'login');
        return {
          path: '/auth/login',
          body: { email: fresh.email, password: PASSWORD },
        };
      }
      case 'API-003': {
        const fresh = await register('User', 'refresh');
        return {
          path: '/auth/refresh',
          body: { refresh_token: await refreshTokenFor(fresh.email) },
        };
      }
      case 'API-004':
        return {
          path: '/auth/logout',
          body: {
            refresh_token: await refreshTokenFor(actorFor(role, variant).email),
          },
        };
      case 'API-005': {
        const fresh = await register('User', 'pwreq');
        return {
          path: '/auth/password-reset/request',
          body: { email: fresh.email },
        };
      }
      case 'API-006': {
        const fresh = await register('User', 'pwconf');
        await send('POST', '/auth/password-reset/request', null, {
          email: fresh.email,
        }).expect(HttpStatus.ACCEPTED);
        return {
          path: '/auth/password-reset/confirm',
          body: { token: capturedResetToken, new_password: PASSWORD },
        };
      }
      case 'API-007':
        return { path: '/me' };
      case 'API-008':
        return { path: '/me', body: { timezone: TIMEZONE } };
      case 'API-009':
        return { path: '/me/dashboard' };
      case 'API-010':
        return { path: '/groups' };
      case 'API-011':
        return { path: '/groups/available?gender=Male' };
      case 'API-012':
        return { path: `/groups/${sideA.groupId}` };
      case 'API-013':
        return {
          path: '/groups',
          body: {
            name: `${GROUP_PREFIX} created ${uuidv7()}`,
            gender: 'Male',
            recitation_day: otherIsoDay,
            teacher_id: sideA.teacher.userId,
            assistant_id: sideA.assistant.userId,
          },
        };
      case 'API-014':
        return {
          path: `/groups/${allowed ? await throwawayGroup() : sideA.groupId}`,
          body: { name: `${GROUP_PREFIX} renamed ${uuidv7()}` },
        };
      case 'API-015':
        return {
          path: `/groups/${sideA.groupId}/enrollment`,
          body: { enrollment_status: 'Open' },
        };
      case 'API-016':
        return {
          path: `/groups/${allowed ? await throwawayGroup() : sideA.groupId}/staff`,
          body: { teacher_id: sideB.teacher.userId },
        };
      case 'API-017':
        return {
          path: `/groups/${allowed ? await throwawayGroup() : sideA.groupId}/lifecycle`,
          body: { lifecycle_state: 'Archived' },
        };
      case 'API-018':
        return {
          path: `/groups/${allowed ? await throwawayGroup() : sideA.groupId}`,
        };
      case 'API-019':
        // BR-01 — a User may hold at most one Pending request, so the allowed
        // caller is a User who holds none. Refused roles keep their own actor.
        return {
          path: '/join-requests',
          body: { ...JOIN_REQUEST_BODY, group_id: sideA.groupId },
          actor: allowed ? await makeActor('User', 'submitter') : undefined,
        };
      case 'API-020':
        return { path: '/join-requests/mine' };
      case 'API-021':
        return { path: '/join-requests?status=pending' };
      case 'API-022':
        return { path: `/join-requests/${sideA.joinRequestId}` };
      case 'API-023':
        return {
          path: `/join-requests/${
            allowed
              ? (await createJoinRequest(sideA.groupId)).joinRequestId
              : sideA.joinRequestId
          }/accept`,
        };
      case 'API-024':
        return {
          path: `/join-requests/${
            allowed
              ? (await createJoinRequest(sideA.groupId)).joinRequestId
              : sideA.joinRequestId
          }/reject`,
        };
      case 'API-025':
        return { path: '/memberships/mine' };
      case 'API-026':
        return { path: `/groups/${sideA.groupId}/memberships` };
      case 'API-027':
        return {
          path: `/memberships/${
            allowed ? await throwawayMembership() : sideA.membershipId
          }`,
        };
      case 'API-028':
        return { path: `/memberships/${sideA.membershipId}/recovery` };
      case 'API-029':
        return { path: '/daily-reports/today' };
      case 'API-030':
        return {
          path: '/daily-reports',
          body: { type: 'Absent', absence_reason: 'Other' },
        };
      case 'API-031':
        return { path: '/daily-reports' };
      case 'API-032':
        return { path: `/memberships/${sideA.membershipId}/daily-reports` };
      case 'API-033':
        return { path: '/weekly-reports/current' };
      case 'API-034':
        // VR-21 confines confirmation to the group's recitation day, so the
        // owner is the Student whose group recites today. The wrong-scope
        // caller is side A's Student: same role, another student's report.
        return {
          path: `/weekly-reports/${weeklyOwner.reportId}/confirm`,
          body: { attended_recitation_call: true },
          actor:
            variant === 'owner' && role === 'Student'
              ? weeklyOwner.actor
              : undefined,
        };
      case 'API-035':
        return { path: '/weekly-reports' };
      case 'API-036':
        return { path: `/memberships/${sideA.membershipId}/weekly-reports` };
      case 'API-037':
        return { path: '/me/performance' };
      case 'API-038':
        return { path: `/groups/${sideA.groupId}/performance` };
      case 'API-039':
        return { path: `/memberships/${sideA.membershipId}/performance` };
      case 'API-040':
        return { path: `/groups/${sideA.groupId}/at-risk` };
      case 'API-041':
        return { path: '/me/progress' };
      case 'API-042':
        return { path: `/memberships/${sideA.membershipId}/progress` };
      case 'API-043':
        return { path: '/quran/surahs' };
      case 'API-044':
        return { path: '/quran/hizb-boundaries' };
      case 'API-045':
        return { path: '/me/payments' };
      case 'API-046':
        return { path: `/groups/${sideA.groupId}/payments` };
      case 'API-047':
        // DB-UQ-06 makes cycle 0 payable exactly once per membership, so the
        // allowed caller always gets a membership of side A's group that has
        // never been paid; every refused caller aims at side A's own student.
        return {
          path: `/memberships/${
            allowed
              ? await enrol(
                  (await makeActor('Student', 'payable')).userId,
                  sideA.groupId,
                )
              : sideA.membershipId
          }/payments`,
          body: { cycle_index: 0 },
        };
      case 'API-048':
        return {
          path: '/devices',
          body: { token: `authz-device-${uuidv7()}`, platform: 'iOS' },
        };
      case 'API-049': {
        const deviceId =
          variant === 'owner'
            ? (ownDevices.get(role) as string)
            : (probeDevices.get(role) as string);
        return { path: `/devices/${deviceId}` };
      }
      case 'API-050':
        return { path: '/me/notification-preferences' };
      case 'API-051':
        return {
          path: '/me/notification-preferences',
          body: { category: 'N-01', muted: true },
        };
      case 'API-052':
        return {
          path: `/users/${
            allowed
              ? (await register('User', 'promote')).userId
              : sideA.applicant.userId
          }/role`,
          body: { role: 'Teacher' },
        };
      case 'API-053':
        return { path: '/users' };
      case 'API-054':
        return { path: '/audit' };
      default:
        throw new Error(`No request plan declared for ${api}`);
    }
  }

  /** A group nothing references — safe to rename, archive, restaff, delete. */
  async function throwawayGroup(): Promise<string> {
    return createGroup(
      sideA.teacher.userId,
      sideA.assistant.userId,
      otherIsoDay,
    );
  }

  /** A membership that exists only to be terminated (BR-05 cascade). */
  async function throwawayMembership(): Promise<string> {
    const student = await makeActor('Student', 'terminable');
    return enrol(student.userId, await throwawayGroup());
  }

  // ─────────────────────────── the runner ──────────────────────────────

  /**
   * The API-049 `foreign` caller for the Admin is a different *user*, not a
   * different Admin, because DB-UQ-08 makes the Admin a singleton. Every
   * other wrong-scope caller in the suite is same-role by construction.
   */
  function foreignLabel(endpoint: EndpointAuthz, role: Role): string {
    if (endpoint.api === 'API-049' && role === 'Admin') {
      return 'a different user (DB-UQ-08 allows only one Admin)';
    }
    return `a different, otherwise-valid ${role} of another group`;
  }

  async function expectUniform403(
    endpoint: EndpointAuthz,
    role: Role,
    variant: Variant,
  ): Promise<void> {
    const plan = await planFor(endpoint.api, role, variant);
    const res = await send(
      endpoint.method,
      plan.path,
      callerFor(endpoint, role, variant, plan).accessToken,
      plan.body,
    );
    expect({
      cell: `${endpoint.api} × ${role} (${variant})`,
      status: res.status,
      error: (res.body as ErrorEnvelope).error,
    }).toEqual({
      cell: `${endpoint.api} × ${role} (${variant})`,
      status: HttpStatus.FORBIDDEN,
      error: UNIFORM_403.error,
    });
    // NFR-20 / TS §36 "Error envelope leakage": the masked 403 carries the
    // envelope and nothing else — no stack, no SQL, no file path, and above
    // all nothing that would distinguish "wrong role" from "wrong scope"
    // from "does not exist".
    expect(Object.keys(res.body as object).sort()).toEqual([
      'correlationId',
      'error',
      'message',
      'statusCode',
    ]);
  }

  async function expectSuccess(
    endpoint: EndpointAuthz,
    role: Role,
    expectedStatus: number,
  ): Promise<request.Response> {
    const plan = await planFor(endpoint.api, role, 'owner');
    const res = await send(
      endpoint.method,
      plan.path,
      callerFor(endpoint, role, 'owner', plan).accessToken,
      plan.body,
    );
    // The failing body is folded into the assertion so a red cell reports
    // *why* the endpoint refused, not just the number it refused with.
    expect({
      cell: `${endpoint.api} × ${role}`,
      status: res.status,
      body: res.status >= 400 ? (res.body as unknown) : undefined,
    }).toEqual({
      cell: `${endpoint.api} × ${role}`,
      status: expectedStatus,
      body: undefined,
    });
    return res;
  }

  describe.each(
    AUTHORIZATION_MATRIX.map(
      (endpoint) =>
        [`${endpoint.api} ${endpoint.method} ${endpoint.path}`, endpoint] as [
          string,
          EndpointAuthz,
        ],
    ),
  )('%s', (_label, endpoint) => {
    it(`APIS §6.1 row: ${endpoint.matrixRow}`, () => {
      // The `cells` this suite asserts must be the five columns of the §6.1
      // row quoted in the test name — nothing else. Reading the columns back
      // out of the row string turns "I transcribed it correctly" from a claim
      // into a check: a cell edited without editing the quoted row (or the
      // reverse) fails here, before any HTTP call is made.
      const columns = endpoint.matrixRow
        .split('|')
        .slice(-5)
        .map((column) => column.trim())
        // A `🚫` column names the decision that blocks it — "🚫 (DEC-B09)",
        // "🚫 (SRS §10)". The legend value is the 🚫; `blockedBy` carries the
        // citation.
        .map((column) => (column.startsWith('🚫') ? '🚫' : column));

      expect(columns).toEqual(ROLES.map((role) => endpoint.cells[role]));
    });

    for (const role of ROLES) {
      const cell = endpoint.cells[role];
      const deviation = endpoint.deviation?.[role];

      if (deviation) {
        it(`${role} → ${deviation.observed} — DOCUMENTED DEVIATION from §6.1 "${cell}": ${deviation.reason}`, async () => {
          const plan = await planFor(endpoint.api, role, 'owner');
          const res = await send(
            endpoint.method,
            plan.path,
            callerFor(endpoint, role, 'owner', plan).accessToken,
            plan.body,
          );
          expect(res.status).toBe(deviation.observed);
          if (deviation.assertEmptyData) {
            expect((res.body as { data: unknown[] }).data).toEqual([]);
          }
        });
        continue;
      }

      if (!isAllowed(cell)) {
        const because = endpoint.blockedBy
          ? ` — blocked by ${endpoint.blockedBy}`
          : '';
        it(`${role} → 403 (§6.1 says "${cell}")${because}`, async () => {
          await expectUniform403(endpoint, role, 'owner');
        });
        continue;
      }

      it(`${role} → ${endpoint.successStatus} (§6.1 says "${cell}")`, async () => {
        await expectSuccess(endpoint, role, endpoint.successStatus);
      });

      if (isScoped(cell) && endpoint.scope === 'resource') {
        it(`${role} → 403 when the caller is ${foreignLabel(endpoint, role)} (§6.1 "${cell}", TS §36 ScopeGuard row)`, async () => {
          await expectUniform403(endpoint, role, 'foreign');
        });
      }
    }
  });

  // ───────────── the two inverted exclusions, stated apart ─────────────

  /**
   * The single easiest thing in this system to get backwards. Both
   * directions are asserted for each pair, in the same test file, with the
   * excluded role named in capitals — a swap makes *both* halves fail.
   */
  describe('Inverted exclusions — DEC-B09 (Assistant) vs SRS §10 (Teacher)', () => {
    it('the two exclusions name different roles and disjoint endpoint sets', () => {
      const assistantBlocked = new Set<string>(
        INVERTED_EXCLUSIONS.assistantBlocked,
      );
      const teacherBlocked = new Set<string>(
        INVERTED_EXCLUSIONS.teacherBlocked,
      );
      for (const api of teacherBlocked) {
        expect(assistantBlocked.has(api)).toBe(false);
      }
      // DEC-B09 blocks the Assistant on Reports/Weekly/Performance/Progress
      // and leaves Payments alone; SRS §10 does exactly the opposite.
      for (const api of INVERTED_EXCLUSIONS.assistantBlocked) {
        expect(endpointOf(api).cells.Assistant).toBe('🚫');
        expect(endpointOf(api).cells.Teacher).not.toBe('🚫');
      }
      for (const api of INVERTED_EXCLUSIONS.teacherBlocked) {
        expect(endpointOf(api).cells.Teacher).toBe('🚫');
        expect(endpointOf(api).cells.Assistant).not.toBe('🚫');
      }
      for (const api of INVERTED_EXCLUSIONS.assistantKeepsAccess) {
        expect(isAllowed(endpointOf(api).cells.Assistant)).toBe(true);
      }
      for (const api of INVERTED_EXCLUSIONS.teacherKeepsAccess) {
        expect(isAllowed(endpointOf(api).cells.Teacher)).toBe(true);
      }
    });

    describe.each(INVERTED_EXCLUSIONS.assistantBlocked.map((api) => [api]))(
      'DEC-B09 %s',
      (api: string) => {
        const endpoint = endpointOf(api);

        it(`refuses the ASSISTANT — and it is the Assistant, not the Teacher, who is excluded here (${DEC_B09})`, async () => {
          // The caller is side A's *assigned* Assistant — on the
          // `/memberships/{id}/…` and `/groups/{id}/…` rows, the one staff
          // member whose group scope would otherwise let them through. What
          // stops them is the role alone, which is exactly what DEC-B09 says:
          // the Assistant is not in these endpoints' `@Roles()` at all.
          await expectUniform403(endpoint, 'Assistant', 'owner');
        });
      },
    );

    describe.each(INVERTED_EXCLUSIONS.teacherKeepsAccess.map((api) => [api]))(
      'DEC-B09 counterpart %s',
      (api: string) => {
        const endpoint = endpointOf(api);

        it('allows the assigned TEACHER of the same group — proving DEC-B09 was not applied to the Teacher by mistake', async () => {
          await expectSuccess(endpoint, 'Teacher', endpoint.successStatus);
        });
      },
    );

    describe.each(INVERTED_EXCLUSIONS.teacherBlocked.map((api) => [api]))(
      'SRS §10 %s',
      (api: string) => {
        const endpoint = endpointOf(api);

        it(`refuses the TEACHER — and it is the Teacher, not the Assistant, who is excluded from Payments (${SRS_10_TEACHER_PAYMENTS})`, async () => {
          // Side A's *assigned* Teacher: in scope for the group, refused
          // purely because Payments is not a Teacher capability.
          await expectUniform403(endpoint, 'Teacher', 'owner');
        });
      },
    );

    describe.each(INVERTED_EXCLUSIONS.assistantKeepsAccess.map((api) => [api]))(
      'SRS §10 counterpart %s',
      (api: string) => {
        const endpoint = endpointOf(api);

        it('allows the assigned ASSISTANT of the same group — proving SRS §10 was not applied to the Assistant by mistake', async () => {
          await expectSuccess(endpoint, 'Assistant', endpoint.successStatus);
        });
      },
    );
  });

  // ─────────────────── coverage bookkeeping & anon ─────────────────────

  describe('Suite coverage', () => {
    it('covers all 54 catalogue endpoints × 5 roles = 270 matrix cells', () => {
      expect(AUTHORIZATION_MATRIX).toHaveLength(54);
      const ids = AUTHORIZATION_MATRIX.map((e) => e.api);
      expect(new Set(ids).size).toBe(54);
      for (let n = 1; n <= 54; n += 1) {
        expect(ids).toContain(`API-${String(n).padStart(3, '0')}`);
      }
      expect(AUTHORIZATION_MATRIX.length * ROLES.length).toBe(270);
    });

    it('gives every resource-id route a same-role wrong-scope case, and names the cells that cannot have one', () => {
      const covered: string[] = [];
      const notExpressible: string[] = [];
      for (const endpoint of AUTHORIZATION_MATRIX) {
        for (const role of ROLES) {
          if (!isScoped(endpoint.cells[role])) continue;
          const cell = `${endpoint.api} × ${role}`;
          (endpoint.scope === 'resource' ? covered : notExpressible).push(cell);
        }
      }

      // Every "(g)" / "own" cell on a route that names a resource id gets the
      // pair TS §36 asks for: legitimate owner 2xx, same-role wrong-scope 403.
      expect(covered).toEqual([
        'API-012 × Teacher',
        'API-012 × Assistant',
        'API-012 × Student',
        'API-015 × Teacher',
        'API-022 × Assistant',
        'API-023 × Assistant',
        'API-024 × Assistant',
        'API-026 × Teacher',
        'API-026 × Assistant',
        'API-032 × Teacher',
        'API-034 × Student',
        'API-036 × Teacher',
        'API-038 × Teacher',
        'API-040 × Teacher',
        'API-039 × Teacher',
        'API-039 × Student',
        'API-042 × Teacher',
        'API-046 × Assistant',
        'API-047 × Assistant',
        'API-049 × Admin',
        'API-049 × Teacher',
        'API-049 × Assistant',
        'API-049 × Student',
        'API-049 × User',
      ]);

      // The rest cannot have a wrong-scope caller at all, and the reason is
      // structural rather than an omission: a `/me/…` route makes the caller
      // *be* the scope (no path names another user's resource), and a list
      // route applies scope as the repository's WHERE clause (TS §15.2), so
      // every allowed caller gets 2xx over a different row set and there is
      // no 403 to assert. Row sets are asserted by the per-feature suites.
      expect(notExpressible).toEqual([
        'API-010 × Teacher',
        'API-010 × Assistant',
        'API-010 × Student',
        'API-020 × User',
        'API-021 × Assistant',
        'API-025 × Student',
        'API-029 × Student',
        'API-030 × Student',
        'API-031 × Student',
        'API-033 × Student',
        'API-035 × Student',
        'API-037 × Student',
        'API-041 × Student',
        'API-045 × Student',
        'API-048 × Admin',
        'API-048 × Teacher',
        'API-048 × Assistant',
        'API-048 × Student',
        'API-048 × User',
        'API-050 × Admin',
        'API-050 × Teacher',
        'API-050 × Assistant',
        'API-050 × Student',
        'API-050 × User',
        'API-051 × Admin',
        'API-051 × Teacher',
        'API-051 × Assistant',
        'API-051 × Student',
        'API-051 × User',
      ]);
      for (const cell of notExpressible) {
        expect(['own', 'list']).toContain(
          endpointOf(cell.split(' × ')[0]).scope,
        );
      }
    });
  });

  describe('Unauthenticated access (AuthGuard, before any role check)', () => {
    it.each(
      AUTHORIZATION_MATRIX.filter((e) => !e.isPublic).map(
        (e) => [`${e.api} ${e.method} ${e.path}`, e] as [string, EndpointAuthz],
      ),
    )('%s → 401 with no Authorization header', async (_label, endpoint) => {
      const plan = await planFor(endpoint.api, 'Admin', 'owner');
      const res = await send(endpoint.method, plan.path, null, plan.body);
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it.each(
      AUTHORIZATION_MATRIX.filter((e) => e.isPublic).map(
        (e) => [`${e.api} ${e.method} ${e.path}`, e] as [string, EndpointAuthz],
      ),
    )(
      '%s → reachable anonymously (§6.1 "✓ (anon. before login)")',
      async (_label, endpoint) => {
        const plan = await planFor(endpoint.api, 'User', 'owner');
        const res = await send(endpoint.method, plan.path, null, plan.body);
        expect(res.status).toBe(endpoint.successStatus);
      },
    );
  });

  /** Kept honest: the enum the suite iterates is the system's own. */
  it('iterates exactly the five roles UserRole declares', () => {
    expect([...ROLES].sort()).toEqual(Object.values(UserRole).sort());
  });
});
