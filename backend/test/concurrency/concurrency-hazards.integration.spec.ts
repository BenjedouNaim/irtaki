/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
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

/**
 * F-TEST-04 — the five concurrency hazards of SAS §26.4 / DBD §27 / TS §20,
 * exercised against the running system rather than against each feature's own
 * mocks. Every race here is fired with `Promise.all` so the competing requests
 * are genuinely in flight together; the suite asserts that exactly one writer
 * wins and that the loser receives the response APIS §9.7 documents, never a
 * 500 and never a second row.
 *
 * The last block is the one no single feature's tests could cover: the accept
 * guard (EPIC-03/F-ENR-05) racing the archival cascade (EPIC-02/F-GRP-08).
 */
describe('Concurrency hazards (F-TEST-04 / TS §20)', () => {
  jest.setTimeout(180000);

  let app: INestApplication<App>;
  let dataSource: DataSource;

  const emailDomain = '@test-concurrency.com';
  const groupPrefix = 'F-TEST-04 حلقة';
  const STUDENT_TIMEZONE = 'Africa/Tunis';

  const mockMailer: IMailer = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  };

  interface TestActor {
    accessToken: string;
    userId: string;
  }

  /** "Today" in the student's own timezone (T-01, SAS T-01 / DMS INV-27). */
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

  /** Set once the seeded Admin has been borrowed, so its LOGIN rows (whose
   *  email does not match this suite's domain) can be cleaned up again. */
  let borrowedAdmin: TestActor | null = null;
  const suiteStartedAt = new Date();

  const today = todayIn(STUDENT_TIMEZONE);
  /** A recitation day that is not today, so BR-16 stays out of the way. */
  const nonRecitationDay = (isoDay(today) % 7) + 1;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MAILER)
      .useValue(mockMailer)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      }),
    );
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
    const byEmail = `%${emailDomain}`;
    const byGroup = `${groupPrefix}%`;

    await dataSource.query(
      `DELETE FROM coverage_intervals WHERE coverage_id IN (
         SELECT c.id FROM memorization_coverage c
         JOIN memberships m ON m.id = c.membership_id
         WHERE m.user_id IN (SELECT id FROM users WHERE email LIKE $1)
            OR m.group_id IN (SELECT id FROM groups WHERE name LIKE $2))`,
      [byEmail, byGroup],
    );
    await dataSource.query(
      `DELETE FROM memorization_coverage WHERE membership_id IN (
         SELECT id FROM memberships
         WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)
            OR group_id IN (SELECT id FROM groups WHERE name LIKE $2))`,
      [byEmail, byGroup],
    );
    for (const table of [
      'daily_reports',
      'weekly_reports',
      'payment_records',
    ]) {
      await dataSource.query(
        `DELETE FROM ${table} WHERE membership_id IN (
           SELECT id FROM memberships
           WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)
              OR group_id IN (SELECT id FROM groups WHERE name LIKE $2))`,
        [byEmail, byGroup],
      );
    }
    await dataSource.query(
      `DELETE FROM memberships
        WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)
           OR group_id IN (SELECT id FROM groups WHERE name LIKE $2)`,
      [byEmail, byGroup],
    );
    await dataSource.query(
      `DELETE FROM join_request_ahzab WHERE join_request_id IN (
         SELECT id FROM join_requests
         WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)
            OR group_id IN (SELECT id FROM groups WHERE name LIKE $2))`,
      [byEmail, byGroup],
    );
    await dataSource.query(
      `DELETE FROM join_requests
        WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)
           OR group_id IN (SELECT id FROM groups WHERE name LIKE $2)`,
      [byEmail, byGroup],
    );
    await dataSource.query(
      `DELETE FROM groups
        WHERE name LIKE $2
           OR teacher_id IN (SELECT id FROM users WHERE email LIKE $1)
           OR assistant_id IN (SELECT id FROM users WHERE email LIKE $1)
           OR created_by IN (SELECT id FROM users WHERE email LIKE $1)`,
      [byEmail, byGroup],
    );
    await dataSource.query(
      'DELETE FROM audit_entries WHERE actor_id IN (SELECT id FROM users WHERE email LIKE $1)',
      [byEmail],
    );
    await dataSource.query(
      'DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)',
      [byEmail],
    );
    await dataSource.query('DELETE FROM users WHERE email LIKE $1', [byEmail]);

    // The seeded Admin is borrowed, not created, so it survives the sweep
    // above — but the LOGIN entries this suite made as that Admin should not
    // accumulate in the shared test database.
    if (borrowedAdmin) {
      await dataSource.query(
        `DELETE FROM audit_entries
          WHERE actor_id = $1 AND action = 'LOGIN' AND occurred_at >= $2`,
        [borrowedAdmin.userId, suiteStartedAt],
      );
    }
  }

  async function registerAndLogin(role: UserRole): Promise<TestActor> {
    const password = 'Password123!';

    // DB-UQ-08: a single Admin exists system-wide; borrow the seeded one, and
    // borrow it only once so the suite does not stack up LOGIN audit rows.
    if (role === UserRole.Admin) {
      if (borrowedAdmin) {
        return borrowedAdmin;
      }
      const existing: Array<{ id: string; email: string }> =
        await dataSource.query(
          "SELECT id, email FROM users WHERE role = 'Admin' LIMIT 1",
        );
      if (existing.length > 0) {
        const hasher = app.get<IPasswordHasher>(PASSWORD_HASHER);
        await dataSource.query(
          'UPDATE users SET password_hash = $1 WHERE id = $2',
          [await hasher.hash(password), existing[0].id],
        );
        const login = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: existing[0].email, password })
          .expect(HttpStatus.OK);
        borrowedAdmin = {
          accessToken: login.body.access_token as string,
          userId: existing[0].id,
        };
        return borrowedAdmin;
      }
    }

    const email = `${role.toLowerCase()}-${uuidv7()}${emailDomain}`;
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, timezone: STUDENT_TIMEZONE })
      .expect(HttpStatus.CREATED);

    const userId = registration.body.id as string;
    await dataSource.query(
      'UPDATE users SET role = $1, full_name = $2, gender = $3 WHERE id = $4',
      [role, `${role} تجريبي`, 'Male', userId],
    );

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(HttpStatus.OK);

    return { accessToken: login.body.access_token as string, userId };
  }

  async function createGroup(options: {
    teacherId: string;
    assistantId: string;
    enrollmentStatus?: 'Open' | 'Closed';
    recitationDay?: number;
  }): Promise<string> {
    const id = uuidv7();
    await dataSource.query(
      `INSERT INTO groups (
         id, name, gender, recitation_day, enrollment_status, lifecycle_state,
         archived_at, teacher_id, assistant_id, created_by, created_at, updated_at
       ) VALUES ($1, $2, 'Male', $3, $4, 'Active', NULL, $5, $6, $5, now(), now())`,
      [
        id,
        `${groupPrefix} ${uuidv7()}`,
        options.recitationDay ?? nonRecitationDay,
        options.enrollmentStatus ?? 'Open',
        options.teacherId,
        options.assistantId,
      ],
    );
    return id;
  }

  /** A Teacher, an Assistant and an Active group the two of them staff. */
  async function seedGroup(
    options: {
      enrollmentStatus?: 'Open' | 'Closed';
      recitationDay?: number;
    } = {},
  ): Promise<{ teacher: TestActor; assistant: TestActor; groupId: string }> {
    const teacher = await registerAndLogin(UserRole.Teacher);
    const assistant = await registerAndLogin(UserRole.Assistant);
    const groupId = await createGroup({
      teacherId: teacher.userId,
      assistantId: assistant.userId,
      ...options,
    });
    return { teacher, assistant, groupId };
  }

  async function createPendingRequest(
    userId: string,
    groupId: string,
  ): Promise<string> {
    const id = uuidv7();
    const ahzab = [1, 2, 3, 4, 5, 6, 7, 8];
    await dataSource.query(
      `INSERT INTO join_requests (
         id, user_id, group_id, full_name, gender, age, phone_number,
         occupation, city, memorized_hizb_count, tajweed_level,
         studied_tajweed_theory, studied_qalun, fee_agreement,
         program_goal, score, status
       ) VALUES ($1, $2, $3, 'أحمد التونسي', 'Male', 25, '+21698123456',
                 'مهندس', 'تونس', $4, 'Intermediate', true, true, true,
                 'Memorization', 87.5, 'Pending')`,
      [id, userId, groupId, ahzab.length],
    );
    for (const hizb of ahzab) {
      await dataSource.query(
        'INSERT INTO join_request_ahzab (join_request_id, hizb_number) VALUES ($1, $2)',
        [id, hizb],
      );
    }
    return id;
  }

  async function createMembership(options: {
    userId: string;
    groupId: string;
    startedAt?: string;
  }): Promise<string> {
    const id = uuidv7();
    await dataSource.query(
      `INSERT INTO memberships (id, user_id, group_id, state, started_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'Active', $4, now(), now())`,
      [id, options.userId, options.groupId, options.startedAt ?? '2026-08-01'],
    );
    await dataSource.query(
      `INSERT INTO memorization_coverage (
         id, membership_id, ahzab_completed, last_memorized_ordinal, created_at, updated_at, deleted_at
       ) VALUES ($1, $2, 0, NULL, now(), now(), NULL)`,
      [uuidv7(), id],
    );
    return id;
  }

  function acceptRequest(requestId: string, actor: TestActor): request.Test {
    return request(app.getHttpServer())
      .post(`/api/v1/join-requests/${requestId}/accept`)
      .set('Authorization', `Bearer ${actor.accessToken}`);
  }

  function rejectRequest(requestId: string, actor: TestActor): request.Test {
    return request(app.getHttpServer())
      .post(`/api/v1/join-requests/${requestId}/reject`)
      .set('Authorization', `Bearer ${actor.accessToken}`);
  }

  function archiveGroup(groupId: string, admin: TestActor): request.Test {
    return request(app.getHttpServer())
      .patch(`/api/v1/groups/${groupId}/lifecycle`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ lifecycle_state: 'Archived' });
  }

  /** The two settled statuses, sorted, so either interleaving reads the same. */
  function sorted(...responses: Array<{ status: number }>): number[] {
    return responses.map((r) => r.status).sort((a, b) => a - b);
  }

  function loser(
    a: { status: number; body: Record<string, unknown> },
    b: { status: number; body: Record<string, unknown> },
  ): { status: number; body: Record<string, unknown> } {
    return a.status === Number(HttpStatus.CONFLICT) ? a : b;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Hazard 1 — double accept / reject of a JoinRequest.
  // Guard: `UPDATE … WHERE status = 'Pending'`, 0 rows = already decided.
  // ───────────────────────────────────────────────────────────────────────────
  describe("Hazard 1 — double accept/reject of a JoinRequest (WHERE status='Pending')", () => {
    it('two simultaneous accepts: one 200, one 409 ALREADY_DECIDED, exactly one Membership', async () => {
      const { assistant, groupId } = await seedGroup();
      const admin = await registerAndLogin(UserRole.Admin);
      const applicant = await registerAndLogin(UserRole.User);
      const requestId = await createPendingRequest(applicant.userId, groupId);

      const [a, b] = await Promise.all([
        acceptRequest(requestId, assistant),
        acceptRequest(requestId, admin),
      ]);

      expect(sorted(a, b)).toEqual([HttpStatus.OK, HttpStatus.CONFLICT]);
      expect(loser(a, b).body.error).toBe('ALREADY_DECIDED');

      const memberships = await dataSource.query(
        'SELECT id FROM memberships WHERE join_request_id = $1',
        [requestId],
      );
      expect(memberships).toHaveLength(1);

      const [jr] = await dataSource.query(
        'SELECT status FROM join_requests WHERE id = $1',
        [requestId],
      );
      expect(jr.status).toBe('Accepted');
    });

    it('two simultaneous rejects: one 200, one 409 ALREADY_DECIDED', async () => {
      const { assistant, groupId } = await seedGroup();
      const admin = await registerAndLogin(UserRole.Admin);
      const applicant = await registerAndLogin(UserRole.User);
      const requestId = await createPendingRequest(applicant.userId, groupId);

      const [a, b] = await Promise.all([
        rejectRequest(requestId, assistant),
        rejectRequest(requestId, admin),
      ]);

      expect(sorted(a, b)).toEqual([HttpStatus.OK, HttpStatus.CONFLICT]);
      expect(loser(a, b).body.error).toBe('ALREADY_DECIDED');

      const [jr] = await dataSource.query(
        'SELECT status FROM join_requests WHERE id = $1',
        [requestId],
      );
      expect(jr.status).toBe('Rejected');
    });

    it('accept racing reject: exactly one decision lands, and it is the one persisted', async () => {
      const { assistant, groupId } = await seedGroup();
      const admin = await registerAndLogin(UserRole.Admin);
      const applicant = await registerAndLogin(UserRole.User);
      const requestId = await createPendingRequest(applicant.userId, groupId);

      const [accept, reject] = await Promise.all([
        acceptRequest(requestId, assistant),
        rejectRequest(requestId, admin),
      ]);

      expect(sorted(accept, reject)).toEqual([
        HttpStatus.OK,
        HttpStatus.CONFLICT,
      ]);
      expect(loser(accept, reject).body.error).toBe('ALREADY_DECIDED');

      const [jr] = await dataSource.query(
        'SELECT status FROM join_requests WHERE id = $1',
        [requestId],
      );
      const memberships = await dataSource.query(
        'SELECT id FROM memberships WHERE join_request_id = $1',
        [requestId],
      );

      // The winner's decision is the stored one, and a Membership exists
      // if and only if the accept won.
      if (accept.status === Number(HttpStatus.OK)) {
        expect(jr.status).toBe('Accepted');
        expect(memberships).toHaveLength(1);
      } else {
        expect(jr.status).toBe('Rejected');
        expect(memberships).toHaveLength(0);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Hazard 2 — duplicate DailyReport for one (membership, date). DB-UQ-04.
  // ───────────────────────────────────────────────────────────────────────────
  describe('Hazard 2 — duplicate DailyReport for one membership/date (DB-UQ-04)', () => {
    const body = {
      type: 'Normal',
      memo_range: { from: { surah: 2, ayah: 1 }, to: { surah: 2, ayah: 20 } },
      memo_time: { from: '18:00', to: '18:45' },
      completed_50_repetitions: true,
      repetitions_in_single_session: true,
      rev_range: { from: { surah: 1, ayah: 1 }, to: { surah: 1, ayah: 7 } },
      rev_time: { from: '19:00', to: '19:10' },
      read_tafsir: false,
    };

    it('a double-tapped submission yields one 201 and one 409 DUPLICATE_REPORT carrying the winner', async () => {
      const { groupId } = await seedGroup();
      const student = await registerAndLogin(UserRole.Student);
      const membershipId = await createMembership({
        userId: student.userId,
        groupId,
      });

      const submit = (): request.Test =>
        request(app.getHttpServer())
          .post('/api/v1/daily-reports')
          .set('Authorization', `Bearer ${student.accessToken}`)
          .send(body);

      const [a, b] = await Promise.all([submit(), submit()]);

      expect(sorted(a, b)).toEqual([HttpStatus.CREATED, HttpStatus.CONFLICT]);

      const conflict = loser(a, b);
      expect(conflict.body.error).toBe('DUPLICATE_REPORT');
      // APIQ-09: the loser is handed the already-persisted report, so the
      // client treats the 409 as success without a follow-up GET.
      expect(conflict.body.existing_report).toBeDefined();

      const rows = await dataSource.query(
        `SELECT id FROM daily_reports
          WHERE membership_id = $1 AND report_date = $2 AND deleted_at IS NULL`,
        [membershipId, today],
      );
      expect(rows).toHaveLength(1);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Hazard 3 — duplicate JoinRequest (DB-UQ-03) and double membership (DB-UQ-02).
  // ───────────────────────────────────────────────────────────────────────────
  describe('Hazard 3 — duplicate JoinRequest (DB-UQ-03) / double membership (DB-UQ-02)', () => {
    it('two simultaneous applications from one User: one 201, one 409 DUPLICATE_JOIN_REQUEST', async () => {
      const { groupId } = await seedGroup();
      const applicant = await registerAndLogin(UserRole.User);

      const payload = {
        group_id: groupId,
        full_name: 'طارق ذياب',
        gender: 'Male',
        age: 27,
        phone_number: '+21620123987',
        occupation: 'مدرب',
        city: 'تونس',
        memorized_ahzab: [1, 2, 3, 4, 5, 6],
        tajweed_level: 'Intermediate',
        studied_tajweed_theory: true,
        studied_qalun: false,
        fee_agreement: true,
        program_goal: 'Memorization',
      };

      const submit = (): request.Test =>
        request(app.getHttpServer())
          .post('/api/v1/join-requests')
          .set('Authorization', `Bearer ${applicant.accessToken}`)
          .send(payload);

      const [a, b] = await Promise.all([submit(), submit()]);

      expect(sorted(a, b)).toEqual([HttpStatus.CREATED, HttpStatus.CONFLICT]);
      expect(loser(a, b).body.error).toBe('DUPLICATE_JOIN_REQUEST');

      const rows = await dataSource.query(
        "SELECT id FROM join_requests WHERE user_id = $1 AND status = 'Pending'",
        [applicant.userId],
      );
      expect(rows).toHaveLength(1);
    });

    it('one applicant applying to two groups at once still ends with a single Pending row', async () => {
      const first = await seedGroup();
      const second = await seedGroup();
      const applicant = await registerAndLogin(UserRole.User);

      const payload = (groupId: string): Record<string, unknown> => ({
        group_id: groupId,
        full_name: 'طارق ذياب',
        gender: 'Male',
        age: 27,
        phone_number: '+21620123987',
        occupation: 'مدرب',
        city: 'تونس',
        memorized_ahzab: [1, 2, 3, 4, 5, 6],
        tajweed_level: 'Intermediate',
        studied_tajweed_theory: true,
        studied_qalun: false,
        fee_agreement: true,
        program_goal: 'Memorization',
      });

      const [a, b] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/join-requests')
          .set('Authorization', `Bearer ${applicant.accessToken}`)
          .send(payload(first.groupId)),
        request(app.getHttpServer())
          .post('/api/v1/join-requests')
          .set('Authorization', `Bearer ${applicant.accessToken}`)
          .send(payload(second.groupId)),
      ]);

      expect(sorted(a, b)).toEqual([HttpStatus.CREATED, HttpStatus.CONFLICT]);
      expect(loser(a, b).body.error).toBe('DUPLICATE_JOIN_REQUEST');

      const rows = await dataSource.query(
        "SELECT id FROM join_requests WHERE user_id = $1 AND status = 'Pending'",
        [applicant.userId],
      );
      expect(rows).toHaveLength(1);
    });

    it('an accept whose Membership INSERT collides with a concurrent one loses at DB-UQ-02, not at a SELECT', async () => {
      // DB-UQ-03 makes two Pending requests for one user unrepresentable, so
      // the only way two writers can both aim an Active Membership at the same
      // user is a competing membership write landing mid-accept. A second
      // connection holds an uncommitted Active Membership for the applicant;
      // the accept's own INSERT therefore blocks on DB-UQ-02's index rather
      // than on any application check, and is released — as a violation — the
      // moment the competitor commits.
      const { assistant, groupId } = await seedGroup();
      const other = await seedGroup();
      const applicant = await registerAndLogin(UserRole.User);
      const requestId = await createPendingRequest(applicant.userId, groupId);

      const competitor = dataSource.createQueryRunner();
      await competitor.connect();
      await competitor.startTransaction();

      let response: request.Response;
      try {
        await competitor.query(
          `INSERT INTO memberships (id, user_id, group_id, state, started_at, created_at, updated_at)
           VALUES ($1, $2, $3, 'Active', '2026-08-01', now(), now())`,
          [uuidv7(), applicant.userId, other.groupId],
        );

        // In flight together: the accept reaches its Membership INSERT while
        // the competitor still holds the unique key.
        const inFlight = acceptRequest(requestId, assistant);
        const settled = Promise.all([
          inFlight,
          (async () => {
            await new Promise((resolve) => setTimeout(resolve, 250));
            await competitor.commitTransaction();
          })(),
        ]);
        [response] = await settled;
      } finally {
        if (competitor.isTransactionActive) {
          await competitor.rollbackTransaction();
        }
        await competitor.release();
      }

      expect(response.status).toBe(HttpStatus.CONFLICT);
      expect(response.body.error).toBe('APPLICANT_NO_LONGER_ELIGIBLE');

      // DB-UQ-02 held: exactly one Active Membership for this user, and the
      // accept's whole transaction rolled back — no half-promoted Student.
      const active = await dataSource.query(
        "SELECT id FROM memberships WHERE user_id = $1 AND state = 'Active'",
        [applicant.userId],
      );
      expect(active).toHaveLength(1);

      const [user] = await dataSource.query(
        'SELECT role FROM users WHERE id = $1',
        [applicant.userId],
      );
      expect(user.role).toBe('User');

      const [jr] = await dataSource.query(
        'SELECT status FROM join_requests WHERE id = $1',
        [requestId],
      );
      expect(jr.status).toBe('Pending');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Hazard 4 — duplicate PaymentRecord for one cycle. DB-UQ-06.
  // ───────────────────────────────────────────────────────────────────────────
  describe('Hazard 4 — duplicate PaymentRecord for one cycle (DB-UQ-06)', () => {
    it('two simultaneous recordings of one cycle: one 201, one 409 CYCLE_ALREADY_PAID', async () => {
      const { assistant, groupId } = await seedGroup();
      const student = await registerAndLogin(UserRole.Student);
      // Started long enough ago that cycle 0 is well within the past (VR-37).
      const membershipId = await createMembership({
        userId: student.userId,
        groupId,
        startedAt: '2026-01-05',
      });

      const record = (): request.Test =>
        request(app.getHttpServer())
          .post(`/api/v1/memberships/${membershipId}/payments`)
          .set('Authorization', `Bearer ${assistant.accessToken}`)
          .send({ cycle_index: 0 });

      const [a, b] = await Promise.all([record(), record()]);

      expect(sorted(a, b)).toEqual([HttpStatus.CREATED, HttpStatus.CONFLICT]);
      expect(loser(a, b).body.error).toBe('CYCLE_ALREADY_PAID');

      const rows = await dataSource.query(
        `SELECT id FROM payment_records
          WHERE membership_id = $1 AND cycle_index = 0 AND deleted_at IS NULL`,
        [membershipId],
      );
      expect(rows).toHaveLength(1);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Hazard 5 — accept racing group archival. The cross-Epic one: F-GRP-08's
  // cascade (DS-07 / FR-REQ-08) against F-ENR-05's accept guard.
  // ───────────────────────────────────────────────────────────────────────────
  describe('Hazard 5 — accept racing Group archival (DS-07 cascade × accept guard)', () => {
    it('archival auto-rejects every Pending request in its own transaction (FR-REQ-08)', async () => {
      const { groupId } = await seedGroup();
      const admin = await registerAndLogin(UserRole.Admin);
      const firstApplicant = await registerAndLogin(UserRole.User);
      const secondApplicant = await registerAndLogin(UserRole.User);
      const first = await createPendingRequest(firstApplicant.userId, groupId);
      const second = await createPendingRequest(
        secondApplicant.userId,
        groupId,
      );

      await archiveGroup(groupId, admin).expect(HttpStatus.OK);

      const rows = await dataSource.query(
        'SELECT id, status, resolution_source, reviewed_by FROM join_requests WHERE id = ANY($1)',
        [[first, second]],
      );
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.status).toBe('Rejected');
        // SAS §21.3: `System`, not an Assistant's manual decision.
        expect(row.resolution_source).toBe('system');
        expect(row.reviewed_by).toBeNull();
      }
    });

    it('un-archiving does not revive an auto-rejected request (APIS §10.4)', async () => {
      const { groupId } = await seedGroup();
      const admin = await registerAndLogin(UserRole.Admin);
      const applicant = await registerAndLogin(UserRole.User);
      const requestId = await createPendingRequest(applicant.userId, groupId);

      await archiveGroup(groupId, admin).expect(HttpStatus.OK);
      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${groupId}/lifecycle`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ lifecycle_state: 'Active' })
        .expect(HttpStatus.OK);

      const [jr] = await dataSource.query(
        'SELECT status FROM join_requests WHERE id = $1',
        [requestId],
      );
      expect(jr.status).toBe('Rejected');
    });

    it('a request left Pending against an Archived group can never be accepted (BR-42)', async () => {
      // The cascade cannot see a request whose INSERT was still uncommitted
      // when it ran, so such a row survives as Pending against an Archived
      // group. This reproduces that state directly and asserts the accept's
      // own guard — not the cascade — refuses it.
      const { assistant, groupId } = await seedGroup();
      const applicant = await registerAndLogin(UserRole.User);
      const requestId = await createPendingRequest(applicant.userId, groupId);
      await dataSource.query(
        "UPDATE groups SET lifecycle_state = 'Archived', archived_at = now() WHERE id = $1",
        [groupId],
      );

      const response = await acceptRequest(requestId, assistant);

      expect(response.status).toBe(HttpStatus.CONFLICT);
      expect(response.body.error).toBe('ALREADY_DECIDED');

      const memberships = await dataSource.query(
        'SELECT id FROM memberships WHERE join_request_id = $1',
        [requestId],
      );
      expect(memberships).toHaveLength(0);

      const [user] = await dataSource.query(
        'SELECT role FROM users WHERE id = $1',
        [applicant.userId],
      );
      expect(user.role).toBe('User');
    });

    // Repeated because the interleaving is decided by the database, not by the
    // test: several runs shake out both orders while the asserted invariant
    // stays the same either way.
    for (const run of [1, 2, 3, 4, 5, 6]) {
      it(`archive and accept fired together (run ${run}) settle to exactly one winner and never a Membership in an Archived group`, async () => {
        const { assistant, groupId } = await seedGroup();
        const admin = await registerAndLogin(UserRole.Admin);
        const applicant = await registerAndLogin(UserRole.User);
        const requestId = await createPendingRequest(applicant.userId, groupId);

        const [archive, accept] = await Promise.all([
          archiveGroup(groupId, admin),
          acceptRequest(requestId, assistant),
        ]);

        // Archival is unconditional — it never loses to an accept.
        expect(archive.status).toBe(HttpStatus.OK);
        expect(archive.body.data.lifecycle_state).toBe('Archived');

        // The accept either won the JoinRequest row outright (a serial order
        // of accept-then-archive, which BR-42 permits: existing Students stay
        // enrolled) or lost it to the cascade. Nothing in between, and never
        // a 500.
        expect([HttpStatus.OK, HttpStatus.CONFLICT]).toContain(accept.status);

        const [jr] = await dataSource.query(
          'SELECT status, resolution_source FROM join_requests WHERE id = $1',
          [requestId],
        );
        const memberships = await dataSource.query(
          'SELECT id, state FROM memberships WHERE join_request_id = $1',
          [requestId],
        );
        const [group] = await dataSource.query(
          'SELECT lifecycle_state FROM groups WHERE id = $1',
          [groupId],
        );

        expect(group.lifecycle_state).toBe('Archived');
        // No request survives Pending against an Archived group: whichever
        // writer won, the request is decided. This is the invariant the
        // TOCTOU window used to break.
        expect(jr.status).not.toBe('Pending');

        if (accept.status === Number(HttpStatus.OK)) {
          expect(jr.status).toBe('Accepted');
          expect(jr.resolution_source).toBe('manual');
          expect(memberships).toHaveLength(1);
        } else {
          expect(accept.body.error).toBe('ALREADY_DECIDED');
          expect(jr.status).toBe('Rejected');
          expect(jr.resolution_source).toBe('system');
          // The loser wrote nothing at all — no Membership, no promotion.
          expect(memberships).toHaveLength(0);
          const [user] = await dataSource.query(
            'SELECT role FROM users WHERE id = $1',
            [applicant.userId],
          );
          expect(user.role).toBe('User');
        }
      });
    }

    it('a submission racing archival never leaves an acceptable request behind', async () => {
      // The other half of the window: the applicant applies at the instant the
      // Admin archives. Either the request never became Pending, or it did and
      // the cascade missed it — in which case the accept guard must still
      // refuse, because BR-42 forbids a Membership into an Archived Group.
      const { assistant, groupId } = await seedGroup();
      const admin = await registerAndLogin(UserRole.Admin);
      const applicant = await registerAndLogin(UserRole.User);

      const [submission, archive] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/join-requests')
          .set('Authorization', `Bearer ${applicant.accessToken}`)
          .send({
            group_id: groupId,
            full_name: 'طارق ذياب',
            gender: 'Male',
            age: 27,
            phone_number: '+21620123987',
            occupation: 'مدرب',
            city: 'تونس',
            memorized_ahzab: [1, 2, 3, 4, 5, 6],
            tajweed_level: 'Intermediate',
            studied_tajweed_theory: true,
            studied_qalun: false,
            fee_agreement: true,
            program_goal: 'Memorization',
          }),
        archiveGroup(groupId, admin),
      ]);

      expect(archive.status).toBe(HttpStatus.OK);
      expect([HttpStatus.CREATED, HttpStatus.CONFLICT]).toContain(
        submission.status,
      );

      const pending = await dataSource.query(
        "SELECT id FROM join_requests WHERE group_id = $1 AND status = 'Pending'",
        [groupId],
      );

      for (const row of pending) {
        const response = await acceptRequest(row.id as string, assistant);
        expect(response.status).toBe(HttpStatus.CONFLICT);
        expect(response.body.error).toBe('ALREADY_DECIDED');
      }

      const memberships = await dataSource.query(
        'SELECT id FROM memberships WHERE group_id = $1',
        [groupId],
      );
      expect(memberships).toHaveLength(0);
    });

    it('an un-archive fired against a simultaneous archive never revives a cascaded group', async () => {
      // Both Admin actions read the group, then write it. Without a guard on
      // the UPDATE, an un-archive that read `Archived` a moment too early
      // clobbers the archive — leaving the group Active with its whole Pending
      // queue already auto-rejected and unrevivable (APIS §10.4).
      const { groupId } = await seedGroup();
      const admin = await registerAndLogin(UserRole.Admin);
      const applicant = await registerAndLogin(UserRole.User);
      const requestId = await createPendingRequest(applicant.userId, groupId);

      await archiveGroup(groupId, admin).expect(HttpStatus.OK);

      const [archive, unarchive] = await Promise.all([
        archiveGroup(groupId, admin),
        request(app.getHttpServer())
          .patch(`/api/v1/groups/${groupId}/lifecycle`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send({ lifecycle_state: 'Active' }),
      ]);

      expect(sorted(archive, unarchive)).toEqual([
        HttpStatus.OK,
        HttpStatus.OK,
      ]);

      const [group] = await dataSource.query(
        'SELECT lifecycle_state, archived_at FROM groups WHERE id = $1',
        [groupId],
      );
      const [jr] = await dataSource.query(
        'SELECT status FROM join_requests WHERE id = $1',
        [requestId],
      );

      // Whichever landed last, the two columns agree with each other — an
      // Active group never carries an archived_at, and an Archived one always
      // does. The cascade is never undone either way.
      expect(jr.status).toBe('Rejected');
      if (group.lifecycle_state === 'Active') {
        expect(group.archived_at).toBeNull();
      } else {
        expect(group.archived_at).not.toBeNull();
      }
    });

    it('two Admins archiving at once cascade exactly once (guarded UPDATE, not a read)', async () => {
      const { groupId } = await seedGroup();
      const admin = await registerAndLogin(UserRole.Admin);
      const applicant = await registerAndLogin(UserRole.User);
      const requestId = await createPendingRequest(applicant.userId, groupId);

      const [a, b] = await Promise.all([
        archiveGroup(groupId, admin),
        archiveGroup(groupId, admin),
      ]);

      // BR-42 makes a repeat archive a no-op, so both callers see 200.
      expect(sorted(a, b)).toEqual([HttpStatus.OK, HttpStatus.OK]);

      const [jr] = await dataSource.query(
        'SELECT status, resolution_source FROM join_requests WHERE id = $1',
        [requestId],
      );
      expect(jr.status).toBe('Rejected');
      expect(jr.resolution_source).toBe('system');

      const [group] = await dataSource.query(
        'SELECT lifecycle_state FROM groups WHERE id = $1',
        [groupId],
      );
      expect(group.lifecycle_state).toBe('Archived');
    });
  });
});
